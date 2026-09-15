#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const DEFAULT_TIMEOUT_MS = 60_000;

const CONNECTION_STATES = [
  {
    label: "Connected",
    pattern:
      /\bconnected\b|\bremove connection\b|\bremove friend\b|\bdisconnect\b|已连接|已添加好友|已是好友|取消连接|移除连接|移除好友|删除好友|删除联系人|取消好友关系/i,
  },
  {
    label: "Pending",
    pattern:
      /\bpending\b|\binvitation sent\b|\bwithdraw invitation\b|待处理|已发送|邀请已发送|撤回邀请/i,
  },
];

const CONNECT_ACTION_PATTERN =
  /\bconnect\b|\badd friend\b|\binvite .* to connect\b|加为好友|添加好友|建立联系|邀请建立联系/i;
const MORE_ACTION_PATTERN =
  /^(?:open actions overflow menu|more(?: actions?)?|see more(?: actions?)?|更多(?:操作)?)(?:\s*\.\.\.)?$/i;
const ADD_NOTE_PATTERN = /^(?:add a note|add note|添加消息|添加备注)$/i;

export function isSalesNavigatorLeadUrl(value) {
  try {
    const url = new URL(value);
    return (
      /(^|\.)linkedin\.com$/i.test(url.hostname) &&
      /^\/sales\/lead\/[^/]+/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (key === "help") {
      args.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  npm run linkedin:prefill -- --ws-endpoint <ws> --input <customers.json> [--output <results.json>] [--timeout-ms <ms>]",
    "",
    "The script never clicks LinkedIn's Send button and never closes the FlashID browser.",
  ].join("\n");
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactNamePattern(name) {
  return new RegExp(`^${escapeRegExp(name)}$`, "i");
}

async function disconnectBrowser(browser) {
  // Playwright's CDP Browser has no public disconnect() method. Closing the
  // Browser object would also close FlashID's tabs, so close only its private
  // protocol connection and leave the remote profile running.
  if (typeof browser.disconnect === "function") {
    browser.disconnect();
    return;
  }
  if (browser._connection && typeof browser._connection.close === "function") {
    await browser._connection.close();
  }
}

async function readInput(inputPath) {
  const raw = await fs.readFile(inputPath, "utf8");
  const input = JSON.parse(raw);
  if (!Array.isArray(input.customers) || input.customers.length === 0) {
    throw new Error("Input must contain a non-empty customers array");
  }

  return {
    ...input,
    customers: input.customers.map((customer, index) => ({
      name: requiredString(customer.name, `customers[${index}].name`),
      linkedin: requiredString(customer.linkedin, `customers[${index}].linkedin`),
      message: requiredString(customer.message, `customers[${index}].message`),
    })),
  };
}

async function visibleDialog(page, timeoutMs) {
  const dialogs = page.locator('[role="dialog"]:visible');
  const dialog = dialogs.last();
  try {
    await dialog.waitFor({ state: "visible", timeout: timeoutMs });
    return dialog;
  } catch {
    return null;
  }
}

async function profileCard(page, timeoutMs) {
  const landmarkTimeout = Math.min(timeoutMs, 5_000);
  const topCard = page.locator('section[componentkey*="Topcard"]:visible').first();
  if (await topCard.count()) {
    try {
      await topCard.waitFor({ state: "visible", timeout: landmarkTimeout });
      return topCard;
    } catch {
      // Older LinkedIn layouts may expose only an h1 instead of a Topcard.
    }
  }

  const genericCard = page.locator('section[componentkey*="profile.card"]:visible').first();
  if (await genericCard.count()) {
    try {
      await genericCard.waitFor({ state: "visible", timeout: landmarkTimeout });
      return genericCard;
    } catch {
      // Fall back to the main content when no profile card landmark exists.
    }
  }

  return page.locator("main").first();
}

async function profileName(page, scope, expectedName, timeoutMs) {
  const expectedPattern = exactNamePattern(expectedName);
  const probeTimeout = Math.min(timeoutMs, 5_000);

  // Sales Navigator renders a page-level h1 before the lead's h1. Prefer its
  // explicit lead-name marker, then search all visible headings for an exact
  // match instead of assuming the first h1 is the customer's name.
  const markedHeading = scope
    .locator('h1[data-x--lead--name]:visible, h1[data-anonymize="person-name"]:visible')
    .first();
  if (await markedHeading.count()) {
    try {
      await markedHeading.waitFor({ state: "visible", timeout: probeTimeout });
      const text = (await markedHeading.innerText()).trim();
      if (expectedPattern.test(text)) {
        return text;
      }
    } catch {
      // Fall through to the generic heading and exact-text lookups below.
    }
  }

  const headings = scope.locator("h1:visible");
  let headingTexts = [];
  if (await headings.count()) {
    try {
      await headings.first().waitFor({ state: "visible", timeout: probeTimeout });
    } catch {
      // The page may expose the name in a profile-card element without an h1.
    }
    headingTexts = await headings.allInnerTexts();
  }
  const matchingHeading = headingTexts.find((text) => expectedPattern.test(text.trim()));
  if (matchingHeading) {
    return matchingHeading.trim();
  }

  const exactName = scope.getByText(expectedPattern).first();
  try {
    await exactName.waitFor({ state: "visible", timeout: timeoutMs });
    return (await exactName.innerText()).trim();
  } catch {
    if (headingTexts[0]) {
      return headingTexts[0].trim();
    }
    throw new Error(`Profile name is unavailable; expected ${expectedName}`);
  }
}

async function visibleMatch(scope, role, name) {
  const matches = scope.getByRole(role, { name });
  const count = await matches.count();
  for (let index = 0; index < count; index += 1) {
    const match = matches.nth(index);
    if (await match.isVisible().catch(() => false)) {
      return match;
    }
  }
  return null;
}

async function findExistingState(page) {
  for (const state of CONNECTION_STATES) {
    for (const role of ["button", "link", "menuitem"]) {
      const control = await visibleMatch(page, role, state.pattern);
      if (control) {
        const text = (await control.innerText().catch(() => "")).trim();
        return text || state.label;
      }
    }
  }
  return null;
}

async function openConnectDialog(page, scope, timeoutMs, options = {}) {
  if (!options.requireMoreMenu) {
    const directConnect = await visibleMatch(scope, "button", CONNECT_ACTION_PATTERN);
    if (directConnect) {
      await directConnect.click();
      return { existingState: null };
    }
  }

  const moreButton = await visibleMatch(scope, "button", MORE_ACTION_PATTERN);
  if (!moreButton) {
    throw new Error("Connect entry not found: More button is unavailable");
  }

  await moreButton.click();
  const menuTimeout = Math.min(timeoutMs, 10_000);
  const controlledId = await moreButton.getAttribute("aria-controls");
  const menuCandidates = [
    controlledId ? page.locator(`[id="${controlledId}"]:visible`).first() : null,
    page.locator('[role="menu"]:visible').last(),
    page.locator('[role="listbox"]:visible').last(),
    page.locator('[id^="hue-menu-"]:visible').last(),
  ].filter(Boolean);

  let menu = null;
  for (const candidate of menuCandidates) {
    try {
      await candidate.waitFor({ state: "visible", timeout: menuTimeout });
      menu = candidate;
      break;
    } catch {
      // Try the next menu representation used by LinkedIn's layouts.
    }
  }
  if (!menu) {
    const menuItem = page.getByRole("menuitem").last();
    try {
      await menuItem.waitFor({ state: "visible", timeout: menuTimeout });
      menu = menuItem;
    } catch {
      // Some Sales Navigator menus expose no role at all. The More click still
      // scopes the following visible Connect action to the opened popover.
      const connectAction = await visibleMatch(page, "button", CONNECT_ACTION_PATTERN);
      if (!connectAction) {
        throw new Error("Connect menu did not open");
      }
      menu = page;
    }
  }
  const menuScope = (await menu.count()) > 0 ? menu : page;
  const menuState = await findExistingState(menuScope);
  if (menuState) {
    return { existingState: menuState };
  }

  const connectItem =
    (await visibleMatch(menuScope, "menuitem", CONNECT_ACTION_PATTERN)) ??
    (await visibleMatch(menuScope, "button", CONNECT_ACTION_PATTERN));
  if (!connectItem) {
    throw new Error("Connect entry not found in More menu");
  }
  await connectItem.click();
  return { existingState: null };
}

async function fillInvitationNote(page, message, timeoutMs) {
  const dialog = await visibleDialog(page, timeoutMs);
  if (!dialog) {
    throw new Error("Invitation dialog did not open");
  }

  const addNote =
    (await visibleMatch(dialog, "button", ADD_NOTE_PATTERN)) ??
    (await visibleMatch(dialog, "link", ADD_NOTE_PATTERN));
  if (addNote) {
    await addNote.click();
  }

  const editable = dialog.locator(
    'textarea:visible, [contenteditable="true"]:visible',
  ).last();
  try {
    await editable.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    return { filled: false, reason: "Invitation note input is unavailable" };
  }
  const maxLength = await editable.getAttribute("maxlength");
  const maxCharacters = Number(maxLength);
  if (Number.isInteger(maxCharacters) && maxCharacters > 0 && message.length > maxCharacters) {
    throw new Error(
      `Invitation message exceeds LinkedIn's ${maxCharacters}-character limit (${message.length} characters)`,
    );
  }
  await editable.fill(message);
  const value = await editable.inputValue().catch(async () => editable.innerText());
  if (value !== message) {
    throw new Error("Invitation note could not be verified after filling");
  }
  return { filled: true, reason: null };
}

export async function processCustomer(context, customer, timeoutMs) {
  let page;
  let timeoutHandle;
  const operation = (async () => {
    page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    await page.goto(customer.linkedin, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    const scope = await profileCard(page, timeoutMs);
    const headingText = await profileName(page, scope, customer.name, timeoutMs);
    if (!exactNamePattern(customer.name).test(headingText)) {
      throw new Error(`Profile mismatch: expected ${customer.name}, got ${headingText}`);
    }

    const existingState = await findExistingState(scope);
    if (existingState) {
      await page.bringToFront().catch(() => {});
      return {
        name: customer.name,
        linkedin: customer.linkedin,
        message: customer.message,
        status: "skipped",
        linkedin_note_filled: "no",
        external_sent: "no",
        failure_reason: `LinkedIn state is already ${existingState}`,
      };
    }

    const connect = await openConnectDialog(page, scope, timeoutMs, {
      requireMoreMenu: isSalesNavigatorLeadUrl(customer.linkedin),
    });
    if (connect.existingState) {
      await page.bringToFront().catch(() => {});
      return {
        name: customer.name,
        linkedin: customer.linkedin,
        message: customer.message,
        status: "skipped",
        linkedin_note_filled: "no",
        external_sent: "no",
        failure_reason: `LinkedIn state is already ${connect.existingState}`,
      };
    }

    const note = await fillInvitationNote(page, customer.message, timeoutMs);
    await page.bringToFront().catch(() => {});
    return {
      name: customer.name,
      linkedin: customer.linkedin,
      message: customer.message,
      status: note.filled ? "prefilled" : "skipped",
      linkedin_note_filled: note.filled ? "yes" : "no",
      external_sent: "no",
      failure_reason: note.reason,
    };
  })();

  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Customer operation timed out after ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    operation.catch(() => {});
    if (page && /timeout/i.test(error?.message ?? "")) {
      await page.close().catch(() => {});
    }
    return {
      name: customer.name,
      linkedin: customer.linkedin,
      message: customer.message,
      status: "failed",
      linkedin_note_filled: "no",
      external_sent: "no",
      failure_reason: error?.message ?? String(error),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const wsEndpoint = requiredString(args["ws-endpoint"], "--ws-endpoint");
  const inputPath = requiredString(args.input, "--input");
  const outputPath = args.output ?? "linkedin-invite-results.json";
  const timeoutMs = Number(args["timeout-ms"] ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
    throw new Error("--timeout-ms must be an integer >= 1000");
  }

  const input = await readInput(inputPath);
  const browser = await chromium.connectOverCDP(wsEndpoint);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("Connected browser has no browser context");
  }

  const results = [];
  for (const customer of input.customers) {
    // Sequential execution keeps each review tab isolated and predictable.
    results.push(await processCustomer(context, customer, timeoutMs));
  }

  await fs.writeFile(
    outputPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
    "utf8",
  );

  // Disconnect only; FlashID and successful review tabs stay open.
  await disconnectBrowser(browser);
  console.log(JSON.stringify({ output: outputPath, results }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    console.error(usage());
    process.exitCode = 1;
  });
}
