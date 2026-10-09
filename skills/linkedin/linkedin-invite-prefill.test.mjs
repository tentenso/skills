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
const OUT_OF_NETWORK_SALES_LEAD_URL =
  "https://www.linkedin.com/sales/lead/ACwAAFdmVMIB2pcb5v7ZyCt5BkQQD5Q1DalGdKc,OUT_OF_NETWORK,ek2n";

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
  assert.equal(isSalesNavigatorLeadUrl(OUT_OF_NETWORK_SALES_LEAD_URL), true);
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
          <h1>Sales Navigator Lead Page</h1>
          <section>
            <h1 data-x--lead--name="" data-anonymize="person-name">Sample Customer</h1>
            <button id="direct-connect">Connect</button>
            <button id="more" aria-label="Open actions overflow menu" aria-controls="lead-menu">...</button>
          </section>
          <div id="lead-menu" hidden>
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
            document.querySelector('#lead-menu').hidden = false;
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

test("standard profile fallback finds an exact name without an h1", async (t) => {
  const browser = await chromium.launch(chromiumLaunchOptions());
  t.after(() => browser.close());
  const context = await browser.newContext();
  const profileUrl = "https://www.linkedin.com/in/sample-customer";

  await context.route(profileUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html>
        <main>
          <section componentkey="Topcard">
            <span data-anonymize="person-name">Sample Customer</span>
            <button id="connect">Connect</button>
          </section>
          <div id="dialog" role="dialog" hidden>
            <textarea></textarea>
          </div>
        </main>
        <script>
          document.querySelector('#connect').onclick = () => {
            document.querySelector('#dialog').hidden = false;
          };
        </script>`,
    }),
  );

  const result = await processCustomer(
    context,
    { name: "Sample Customer", linkedin: profileUrl, message: "Hello" },
    10_000,
  );

  assert.equal(result.status, "prefilled");
  assert.equal(await context.pages()[0].locator("textarea").inputValue(), "Hello");
});

test("new profile UI uses the target direct invite link and adds a note", async (t) => {
  const browser = await chromium.launch(chromiumLaunchOptions());
  t.after(() => browser.close());
  const context = await browser.newContext();
  const profileUrl = "https://www.linkedin.com/in/sample-customer/";

  await context.route(profileUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html>
        <main>
          <section id="recommendation-card">
            <span>Other Customer</span>
            <a id="other-connect"
               aria-label="Invite Other Customer to connect"
               href="/preload/custom-invite/?vanityName=other-customer">Connect</a>
          </section>
          <section id="profile-card">
            <span>Sample Customer</span>
            <a id="target-connect"
               aria-label="Invite Sample Customer to connect"
               href="/preload/custom-invite/?vanityName=sample-customer">Connect</a>
            <button id="more">More</button>
          </section>
          <div id="dialog" role="dialog" hidden>
            <button id="add-note">Add a note</button>
            <textarea name="message" hidden></textarea>
            <button id="send">Send</button>
          </div>
        </main>
        <script>
          window.clicked = [];
          document.querySelector('#other-connect').onclick = (event) => {
            event.preventDefault();
            window.clicked.push('other-connect');
          };
          document.querySelector('#target-connect').onclick = (event) => {
            event.preventDefault();
            window.clicked.push('target-connect');
            document.querySelector('#dialog').hidden = false;
          };
          document.querySelector('#add-note').onclick = () => {
            window.clicked.push('add-note');
            document.querySelector('textarea').hidden = false;
          };
          document.querySelector('#more').onclick = () => window.clicked.push('more');
          document.querySelector('#send').onclick = () => window.clicked.push('send');
        </script>`,
    }),
  );

  const result = await processCustomer(
    context,
    { name: "Sample Customer", linkedin: profileUrl, message: "Hello from the new UI" },
    10_000,
  );

  assert.equal(result.status, "prefilled");
  assert.equal(result.linkedin_note_filled, "yes");
  assert.equal(result.external_sent, "no");
  const page = context.pages()[0];
  assert.equal(await page.locator("textarea").inputValue(), "Hello from the new UI");
  assert.deepEqual(await page.evaluate(() => window.clicked), ["target-connect", "add-note"]);
});

for (const openInNewTab of [false, true]) {
  test(`Sales Navigator ${openInNewTab ? "opens a profile tab and closes the lead tab" : "navigates in the same tab"} before prefilling`, async (t) => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    t.after(() => browser.close());
    const context = await browser.newContext();
    const profileUrl = "https://www.linkedin.com/in/sample-customer";
    const existingPage = await context.newPage();
    const openedPages = [];
    context.on("page", (page) => openedPages.push(page));
    await context.exposeBinding("sourcePageIsClosed", () => openedPages[0].isClosed());

    await context.route("https://www.linkedin.com/sales/lead/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <main>
            <section>
              <h1>LinkedIn Member</h1>
              <button id="more" aria-controls="lead-menu">More</button>
            </section>
            <div id="lead-menu" role="menu" hidden>
              <a id="view-profile" role="menuitem" href="${profileUrl}" ${openInNewTab ? 'target="_blank"' : ""}>View LinkedIn profile</a>
            </div>
          </main>
          <script>
            window.clicked = [];
            document.querySelector('#more').onclick = () => {
              window.clicked.push('more');
              document.querySelector('#lead-menu').hidden = false;
            };
          </script>`,
      }),
    );

    await context.route(profileUrl, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <main>
            <section>
              <span>Sample Customer</span>
              <a id="profile-connect"
                 aria-label="Invite Sample Customer to connect"
                 href="/preload/custom-invite/?vanityName=sample-customer">Connect</a>
            </section>
            <div id="dialog" role="dialog" hidden>
              <button id="add-note">Add a note</button>
              <textarea name="message" hidden></textarea>
              <button id="send">Send</button>
            </div>
          </main>
          <script>
            window.clicked = [];
            document.querySelector('#profile-connect').onclick = async (event) => {
              event.preventDefault();
              window.sourceClosedAtConnect = await window.sourcePageIsClosed();
              window.clicked.push('profile-connect');
              document.querySelector('#dialog').hidden = false;
            };
            document.querySelector('#add-note').onclick = () => {
              window.clicked.push('add-note');
              document.querySelector('textarea').hidden = false;
            };
            document.querySelector('#send').onclick = () => window.clicked.push('send');
          </script>`,
      }),
    );

    const result = await processCustomer(
      context,
      {
        name: "Sample Customer",
        linkedin: OUT_OF_NETWORK_SALES_LEAD_URL,
        message: "Hello after opening the LinkedIn profile",
      },
      10_000,
    );

    assert.equal(result.status, "prefilled");
    assert.equal(result.linkedin_note_filled, "yes");
    assert.equal(result.external_sent, "no");
    assert.equal(existingPage.isClosed(), false);
    assert.equal(context.pages().length, 2);
    assert.equal(openedPages.length, openInNewTab ? 2 : 1);
    assert.equal(openedPages[0].isClosed(), openInNewTab);
    const page = openedPages.at(-1);
    assert.equal(page.url(), profileUrl);
    assert.equal(await page.evaluate(() => window.sourceClosedAtConnect), openInNewTab);
    assert.equal(await page.locator("textarea").inputValue(), "Hello after opening the LinkedIn profile");
    assert.deepEqual(await page.evaluate(() => window.clicked), ["profile-connect", "add-note"]);
  });
}

for (const failure of ["no-popup", "wrong-url", "connect-timeout"]) {
  test(`Sales Navigator handles ${failure} without closing unrelated tabs`, async (t) => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    t.after(() => browser.close());
    const context = await browser.newContext();
    const existingPage = await context.newPage();
    const openedPages = [];
    context.on("page", (page) => openedPages.push(page));
    const profileUrl = "https://www.linkedin.com/in/sample-customer";
    let unrelatedPage;
    await context.exposeBinding("openUnrelatedPage", async () => {
      unrelatedPage = await context.newPage();
      await unrelatedPage.goto(profileUrl);
    });
    await context.route("https://www.linkedin.com/**", (route) => {
      const lead = route.request().url() === OUT_OF_NETWORK_SALES_LEAD_URL;
      return route.fulfill({
        contentType: "text/html",
        body: lead ? `<!doctype html><main>
          <h1>LinkedIn Member</h1>
          <button aria-controls="lead-menu" onclick="document.querySelector('#lead-menu').hidden = false">More</button>
          <div id="lead-menu" role="menu" hidden>
            <a role="menuitem" target="_blank" href="${failure === "wrong-url" ? "https://www.linkedin.com/checkpoint/" : profileUrl}"
               ${failure === "no-popup" ? 'onclick="event.preventDefault(); window.openUnrelatedPage()"' : ""}>View LinkedIn profile</a>
          </div></main>` : `<!doctype html><main><h1>Sample Customer</h1><button>Connect</button></main>`,
      });
    });

    const result = await processCustomer(context, {
      name: "Sample Customer",
      linkedin: OUT_OF_NETWORK_SALES_LEAD_URL,
      message: "Hello",
    }, 2_000);

    assert.equal(result.status, "failed");
    assert.equal(result.external_sent, "no");
    assert.match(result.failure_reason, /timeout|timed out/i);
    assert.equal(existingPage.isClosed(), false);
    assert.equal(openedPages[0].isClosed(), failure === "connect-timeout");
    if (failure === "no-popup") {
      assert.ok(unrelatedPage);
      assert.equal(unrelatedPage.isClosed(), false);
      assert.deepEqual(context.pages(), [existingPage, openedPages[0], unrelatedPage]);
    } else {
      assert.equal(openedPages.length, 2);
      assert.equal(openedPages[1].isClosed(), true);
      assert.deepEqual(context.pages(), failure === "connect-timeout" ? [existingPage] : [existingPage, openedPages[0]]);
    }
  });
}
