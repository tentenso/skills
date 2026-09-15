import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { chromium } from "playwright";

import {
  isSalesNavigatorLeadUrl,
  processCustomer,
} from "./linkedin-invite-prefill.mjs";

const SALES_LEAD_URL =
  "https://www.linkedin.com/sales/lead/ACwAACIGk3UBdp64fxV6TUOsC_-JPz08ZvUNNWo,NAME_SEARCH,XDM1";

function chromiumLaunchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    chromium.executablePath(),
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ];
  const executablePath = candidates.find((candidate) => candidate && existsSync(candidate));
  return executablePath ? { executablePath, headless: true } : { headless: true };
}

test("recognizes LinkedIn Sales Navigator lead URLs", () => {
  assert.equal(isSalesNavigatorLeadUrl(SALES_LEAD_URL), true);
  assert.equal(isSalesNavigatorLeadUrl("https://uk.linkedin.com/in/paulluen"), false);
  assert.equal(isSalesNavigatorLeadUrl("https://example.com/sales/lead/id"), false);
});

test("Sales Navigator uses More, prefills the message, and leaves Send untouched", async (t) => {
  const browser = await chromium.launch(chromiumLaunchOptions());
  t.after(() => browser.close());
  const context = await browser.newContext();

  await context.route("https://www.linkedin.com/sales/lead/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html>
        <main>
          <section componentkey="LeadTopcard">
            <h1>Sample Customer</h1>
            <button id="direct-connect">Connect</button>
            <button id="more" aria-label="More actions">...</button>
          </section>
          <div id="menu" role="menu" hidden>
            <button id="menu-connect" role="menuitem">Connect</button>
          </div>
          <div id="dialog" role="dialog" hidden>
            <textarea aria-label="Message"></textarea>
            <button id="send">Send</button>
          </div>
        </main>
        <script>
          window.clicked = [];
          document.querySelector('#direct-connect').onclick = () => window.clicked.push('direct-connect');
          document.querySelector('#more').onclick = () => {
            window.clicked.push('more');
            document.querySelector('#menu').hidden = false;
          };
          document.querySelector('#menu-connect').onclick = () => {
            window.clicked.push('menu-connect');
            document.querySelector('#dialog').hidden = false;
          };
          document.querySelector('#send').onclick = () => window.clicked.push('send');
        </script>`,
    }),
  );

  const result = await processCustomer(
    context,
    {
      name: "Sample Customer",
      linkedin: SALES_LEAD_URL,
      message: "Sample invitation message",
    },
    10_000,
  );

  assert.equal(result.status, "prefilled");
  assert.equal(result.linkedin_note_filled, "yes");
  assert.equal(result.external_sent, "no");
  assert.equal(context.pages().length, 1);
  const page = context.pages()[0];
  assert.equal(await page.locator("textarea").inputValue(), "Sample invitation message");
  assert.deepEqual(await page.evaluate(() => window.clicked), ["more", "menu-connect"]);
});
