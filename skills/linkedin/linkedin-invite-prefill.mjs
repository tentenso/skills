#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";
import { chromium } from "playwright";

const DEFAULT_TIMEOUT_MS = 60_000;

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

async function visibleDialog(page) {
  const dialogs = page.locator('[role="dialog"]:visible');
  const count = await dialogs.count();
  return count > 0 ? dialogs.last() : null;
}

async function findExistingState(page) {
  const stateButton = page.getByRole("button", {
    name: /^(Pending|待处理|已发送|Connected|已连接)$/i,
  });
  if (await stateButton.count()) {
    return (await stateButton.first().innerText()).trim();
  }
  return null;
}

async function openConnectDialog(page) {
  const directConnect = page.getByRole("button", {
    name: /^(Connect|Add friend|加为好友)$/i,
  });
  if (await directConnect.count()) {
    await directConnect.first().click();
    return;
  }

  const moreButton = page.getByRole("button", {
    name: /^(More|更多)$/i,
  });
  if (!(await moreButton.count())) {
    throw new Error("Connect entry not found: More button is unavailable");
  }

  await moreButton.first().click();
  const menuItems = page.getByRole("menuitem");
  const itemCount = await menuItems.count();
  const menuText = (await menuItems.allTextContents()).join(" ");
  const menuState = menuText.match(/Pending|待处理|已发送|Connected|已连接/i);
  if (menuState) {
    throw new Error(`LinkedIn state is already ${menuState[0]}`);
  }

  const connectItem = menuItems.filter({
    hasText: /^(Connect|Add friend|加为好友)$/i,
  });
  if (!(await connectItem.count())) {
    throw new Error("Connect entry not found in More menu");
  }
  await connectItem.first().click();
}

async function fillInvitationNote(page, message) {
  const dialog = await visibleDialog(page);
  if (!dialog) {
    throw new Error("Invitation dialog did not open");
  }

  const addNote = dialog.getByRole("button", {
    name: /^(Add a note|添加消息)$/i,
  });
  if (!(await addNote.count())) {
    return { filled: false, reason: "Add a note control is unavailable" };
  }
  await addNote.first().click();

  const editable = page.locator('textarea:visible, [contenteditable="true"]:visible').last();
  await editable.waitFor({ state: "visible" });
  await editable.fill(message);
  const value = await editable.inputValue().catch(async () => editable.innerText());
  if (value !== message) {
    throw new Error("Invitation note could not be verified after filling");
  }
  return { filled: true, reason: null };
}

async function processCustomer(context, customer, timeoutMs) {
  let page;
  let timeoutHandle;
  const operation = (async () => {
    page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    await page.goto(customer.linkedin, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    const heading = page.locator("h1").first();
    await heading.waitFor({ state: "visible", timeout: timeoutMs });
    const headingText = (await heading.innerText()).trim();
    if (!exactNamePattern(customer.name).test(headingText)) {
      throw new Error(`Profile mismatch: expected ${customer.name}, got ${headingText}`);
    }

    const existingState = await findExistingState(page);
    if (existingState) {
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

    await openConnectDialog(page);
    const note = await fillInvitationNote(page, customer.message);
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
  browser.disconnect();
  console.log(JSON.stringify({ output: outputPath, results }, null, 2));
}

main().catch((error) => {
  console.error(error?.message ?? error);
  console.error(usage());
  process.exitCode = 1;
});
