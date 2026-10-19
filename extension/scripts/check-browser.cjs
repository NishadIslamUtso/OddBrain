/* UI + content-script browser acceptance. Browser APIs are explicitly stubbed;
 * paired HTTP/vault integration is covered separately by extension-worker.test.ts. */
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const repo = path.resolve(__dirname, "../..");
const { chromium } = require(
  path.join(repo, "apps/03_oddbrain/node_modules/playwright-core"),
);
const target =
  process.env.ODDBRAIN_EXTENSION_PREVIEW || "http://127.0.0.1:5175";
const dir =
  process.env.ODDBRAIN_QA_DIR || path.join(repo, ".cache/extension-review");
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const options = JSON.parse(
    fs.readFileSync(
      process.env.ODDBRAIN_BROWSER_OPTIONS ||
        path.join(dir, "browser-options.json"),
      "utf8",
    ),
  );
  const browser = await chromium.launch(options),
    errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.stack || e.message));
    await page.goto(target);
    const ui = () => page.frameLocator("#extension"),
      inner = () => page.frames().find((f) => f.url().includes("/popup/"));
    await ui()
      .locator("#connection")
      .filter({ hasText: "simulated connection" })
      .waitFor();
    const initialLooks = await (
      await page.request.get(target + "/preview/looks.json")
    ).json();
    await inner().waitForFunction(
      (bg) =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-bg")
          .trim() === bg,
      initialLooks.find((l) => l.name === "Quiet Minimal").appearance.tokens[
        "--color-bg"
      ],
    );
    assert.equal(await ui().locator("#brain-art svg").count(), 1);
    await page.screenshot({
      path: path.join(dir, "extension-side-panel.png"),
      fullPage: true,
    });
    await ui().locator("#capture-current").click();
    await ui().locator("#review").waitFor({ state: "visible" });
    await ui().locator("#capture-title").fill("Browser acceptance capture");
    await ui().locator("#capture-content").fill("Only the reviewed content.");
    await ui().locator("[data-tab=settings]").click();
    await ui().locator("[data-tab=save]").click();
    assert.equal(
      await ui().locator("#capture-content").inputValue(),
      "Only the reviewed content.",
    );
    await ui().locator("#capture-current").click();
    await ui()
      .locator("#notice")
      .filter({ hasText: "Saved to your vault" })
      .waitFor();
    assert.equal(
      await inner().evaluate(() => __preview.local.activity.at(-1).title),
      "Browser acceptance capture",
    );
    await ui().locator("[data-mode=capsule]").click();
    await ui().locator("#capture-current").click();
    await ui().locator("#capture-title").fill("A new capsule");
    await ui().locator("#capture-goal").fill("Keep the useful part");
    await ui().locator("#capture-current").click();
    await ui().locator("#review").waitFor({ state: "hidden" });
    await ui().locator("[data-tab=library]").click();
    await ui()
      .getByRole("button", { name: "A new capsule", exact: true })
      .click();
    await ui().getByRole("button", { name: "Edit as a new version" }).click();
    await ui()
      .locator("#capsule-detail textarea")
      .first()
      .fill("The updated background.");
    await ui()
      .getByRole("button", { name: "Save new version", exact: true })
      .click();
    await ui()
      .getByRole("button", { name: "A new capsule", exact: true })
      .waitFor();
    assert.equal(
      await inner().evaluate(
        () =>
          __preview.local.capsules.find((c) => c.title === "A new capsule")
            .version,
      ),
      2,
    );
    const drag = await inner().evaluate(() => {
      const transfer = new DataTransfer();
      document
        .querySelector(".capsule")
        .dispatchEvent(
          new DragEvent("dragstart", { dataTransfer: transfer, bubbles: true }),
        );
      return {
        custom: transfer.getData("application/x-capsule"),
        plain: transfer.getData("text/plain"),
      };
    });
    assert.ok(drag.custom);
    assert.equal(drag.plain, "", "no silent native insertion without preview");
    // Untrusted titles are text, never HTML or attributes.
    await inner().evaluate(() =>
      __preview.local.capsules.push({
        id: "unsafe",
        title: '<img src=x onerror="window.XSS=true">',
        background: "<script>window.XSS=true</script>",
        goals: [],
        version: 1,
      }),
    );
    await ui().locator("#refresh-library").click();
    assert.equal(
      await ui().locator("#capsule-list img,#capsule-list script").count(),
      0,
    );
    assert.equal(await inner().evaluate(() => !!window.XSS), false);
    await ui().locator("#search").fill("workshop");
    assert.equal(await ui().locator(".capsule").count(), 1);
    await ui().locator("#search").fill("");
    await ui().locator("[data-tab=settings]").click();
    const messagingToggle = ui().getByRole("checkbox", {
      name: "Instagram conversation memory",
    });
    await messagingToggle.check();
    assert.equal(
      await inner().evaluate(() => __preview.local.conversationSites.instagram),
      true,
    );
    await messagingToggle.uncheck();
    assert.equal(
      await inner().evaluate(() => __preview.local.conversationSites.instagram),
      false,
    );
    await inner().evaluate(() => {
      __preview.local.previewConversationStatus = {
        state: "Attachments pending",
        detail: "Simulated: 4 messages saved; one voice note still pending.",
        saved: 4,
        total: 4,
        media: "1/2",
        at: Date.now(),
      };
      __preview.fire(
        {
          "conversationProgress:1": {
            newValue: __preview.local.previewConversationStatus,
          },
        },
        "session",
      );
    });
    await ui().locator("[data-tab=save]").click();
    await ui()
      .locator("#conversation-state")
      .filter({ hasText: "Attachments pending" })
      .waitFor();
    assert.equal(
      await ui().locator("#conversation-bar").getAttribute("value"),
      "4",
    );
    await ui().locator("#conversation-pause").click();
    await ui()
      .locator("#conversation-state")
      .filter({ hasText: "Collection paused" })
      .waitFor();
    assert.equal(
      await inner().evaluate(() => __preview.local.conversationPaused),
      true,
    );
    await ui().locator("#conversation-pause").click();
    assert.equal(
      await inner().evaluate(() => __preview.local.conversationPaused),
      false,
    );
    await inner().evaluate(() => {
      __preview.local.previewConversationStatus = null;
      __preview.fire({}, "session");
    });
    await ui().locator("[data-tab=settings]").click();
    await ui().locator("#blacklist-input").fill("private.example/*");
    await ui().locator("#blacklist-add").click();
    await ui()
      .locator(".blacklist-item")
      .filter({ hasText: "private.example/*" })
      .waitFor();
    await ui()
      .locator(".blacklist-item")
      .filter({ hasText: "private.example/*" })
      .getByRole("button", { name: "Remove" })
      .click();
    assert.equal(
      await ui()
        .locator(".blacklist-item")
        .filter({ hasText: "private.example/*" })
        .count(),
      0,
    );
    await inner().evaluate(() =>
      chrome.storage.local.set({
        queue: [
          {
            title: "Unsent capture",
            type: "web_page",
            content: "Keep until confirmed",
          },
        ],
      }),
    );
    await ui().locator("[data-tab=activity]").click();
    await ui().locator("#clear-queue").click();
    await ui().locator("#confirm-cancel").click();
    assert.equal(await inner().evaluate(() => __preview.local.queue.length), 1);
    await ui().locator("#clear-queue").click();
    await ui().locator("#confirm-ok").click();
    await ui()
      .locator("#queue-count")
      .filter({ hasText: "Outbox is clear" })
      .waitFor();
    const looks = await (
      await page.request.get(target + "/preview/looks.json")
    ).json();
    for (const surface of ["panel", "popup"]) {
      await page.selectOption("#surface", surface);
      await ui().locator("#brain-art svg").waitFor();
      for (const look of looks) {
        await page.selectOption("#look", look.id);
        await inner().waitForFunction(
          (bg) =>
            document.documentElement.style.getPropertyValue("--color-bg") ===
            bg,
          look.appearance.tokens["--color-bg"],
        );
        for (const view of ["save", "library", "activity", "settings"]) {
          await ui().locator(`[data-tab=${view}]`).click();
          assert.ok(
            await inner().evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${surface}/${look.id}/${view} overflow`,
          );
        }
      }
    }
    await page.selectOption(
      "#look",
      looks.find((l) => l.name === "Quiet Minimal").id,
    );
    await page.selectOption("#surface", "popup");
    await ui().locator("[data-tab=save]").click();
    await ui().locator("#brain-art svg").waitFor();
    await page.screenshot({
      path: path.join(dir, "extension-popup.png"),
      fullPage: true,
    });
    await page.selectOption("#surface", "panel");
    await ui().locator("body.panel").waitFor();
    await page.locator("aside").evaluate((el) => (el.style.width = "282px"));
    for (const view of ["save", "library", "activity", "settings"]) {
      await ui().locator(`[data-tab=${view}]`).click();
      assert.ok(
        await inner().evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "280px " + view,
      );
    }
    await context.setOffline(true);
    await ui().locator("[data-tab=save]").click();
    await ui().locator("#brain").click();
    await context.setOffline(false);
    await inner().evaluate(() =>
      chrome.storage.local.set({
        appAppearance: {
          ...__preview.local.appAppearance,
          paused: true,
          interactions: false,
        },
      }),
    );
    await ui().locator("#brain:disabled").waitFor();
    assert.equal(await ui().locator("html").getAttribute("data-still"), "true");
    await inner().waitForFunction(() =>
      document
        .getElementById("brain-art")
        .getAnimations({ subtree: true })
        .every((a) => a.playState !== "running"),
    );
    await inner().evaluate(() =>
      chrome.storage.local.set({
        appAppearance: {
          ...__preview.local.appAppearance,
          roles: { idle: "assemble" },
          words: true,
        },
      }),
    );
    await ui().locator("#brain-art #ob-assemble").waitFor();
    assert.equal(
      await ui().locator("#brain-word").innerText(),
      "Getting started",
    );
    assert.equal(
      await inner().evaluate(
        () =>
          getComputedStyle(document.querySelector("#ob-assemble .lobe-left"))
            .animationName,
      ),
      "none",
    );
    // Content script insertion, explicit prompt cooking, and extraction in an actual DOM.
    const content = await context.newPage();
    content.on("pageerror", (e) => errors.push(e.stack || e.message));
    // A real HTTP origin is needed, not the preview app. Loading preview.js
    // and then replacing its DOM races its awaited looks.json fetch: it resumes
    // against a removed #look and throws at select.append. Keep this fixture
    // independent; do not swallow page errors or add timing-dependent sleeps.
    const fixtureRequests = [];
    content.on("request", request => {
      if (/\/preview\/(looks\.json|preview\.js)(?:[?#]|$)/.test(request.url()))
        fixtureRequests.push(request.url());
    });
    await content.route(target + "/preview/content-fixture", route =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><head></head><body></body></html>" }),
    );
    await content.goto(target + "/preview/content-fixture");
    await content.setContent(
      '<main><h1>Public page</h1><p>Useful public text.</p><form>PRIVATE_FORM<textarea id="first">First draft</textarea><textarea id="second">Second draft</textarea></form><div contenteditable="true" id="editable">PRIVATE_EDITOR</div><p style="display:none">PRIVATE_HIDDEN</p></main>',
    );
    await content.evaluate(() => {
      window.__roots = [];
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) {
        const root = attach.call(this, options);
        window.__roots.push(root);
        return root;
      };
      window.__messages = [];
      window.__listener = null;
      window.__allowed = true;
      window.chrome = {
        extension: { inIncognitoContext: false },
        runtime: {
          id: "test",
          sendMessage: async (msg) => {
            __messages.push(msg);
            return msg.type === "ob-site-access"
              ? { allowed: __allowed }
              : msg.type === "ob-context"
                ? {
                    context: {
                      capsules: [
                        { title: "A safe capsule", background: "Context text" },
                      ],
                    },
                  }
                : { ok: true };
          },
          onMessage: {
            addListener: (fn) => {
              __listener = fn;
            },
          },
        },
        storage: {
          local: {
            get: async (defaults) => ({
              ...defaults,
              inlineSuggestions: true,
              capsules: [
                { title: "A draft capsule", background: "Cached context" },
              ],
            }),
          },
          onChanged: { addListener: () => {} },
        },
      };
    });
    for (const file of [
      "lib/page-extract.js",
      "lib/appearance.js",
      "content-scripts/companion.js",
    ])
      await content.addScriptTag({ path: path.join(repo, "extension", file) });
    await content.locator("#second").click();
    await content.locator("#second").fill("A changed draft");
    const read = await content.evaluate(() => oddExtractPage("page"));
    assert.ok(
      !read.content.includes("PRIVATE_"),
      "extractor leaked private content",
    );
    const inserted = await content.evaluate(
      () =>
        new Promise((resolve) =>
          __listener(
            {
              type: "ob-insert-preview",
              capsule: {
                title: "Saved context",
                background: "Trusted plain text",
              },
            },
            {},
            resolve,
          ),
        ),
    );
    assert.ok(inserted.ok);
    assert.equal(
      await content.locator("#second").inputValue(),
      "A changed draft",
      "no insertion before confirmation",
    );
    await content.evaluate(() =>
      [...__roots[0].querySelectorAll("button")]
        .find((b) => b.textContent === "Insert context")
        .click(),
    );
    assert.match(
      await content.locator("#second").inputValue(),
      /Trusted plain text/,
    );
    assert.equal(await content.locator("#first").inputValue(), "First draft");
    assert.equal(
      await content.evaluate(
        () => __messages.filter((m) => m.type === "ob-context").length,
      ),
      0,
      "typing must not send draft queries",
    );
    await content.evaluate(() => {
      __allowed = false;
    });
    const blocked = await content.evaluate(
      () =>
        new Promise((resolve) =>
          __listener(
            { type: "ob-insert-preview", capsule: { title: "Excluded" } },
            {},
            resolve,
          ),
        ),
    );
    assert.equal(blocked.ok, false);
    await page.locator("aside").evaluate((el) => (el.style.width = ""));
    await page.selectOption(
      "#look",
      looks.find((l) => l.name === "Quiet Minimal").id,
    );
    await ui().locator("[data-tab=library]").click();
    await page.screenshot({
      path: path.join(dir, "extension-library.png"),
      fullPage: true,
    });
    // Waiting conversations use the existing outbox, with plain text titles,
    // honest partial-file wording and explicit discard confirmation.
    await inner().evaluate(() => {
      const original = chrome.runtime.sendMessage;
      let waiting = [
        {
          id: "fixture-receipt",
          title: "<img src=x onerror=alert(1)> Saved later",
          messages: 2,
          parts: 3,
          incomplete: true,
          files: 0,
          bytes: 1000,
          problem: "",
        },
      ];
      chrome.runtime.sendMessage = async (msg) => {
        if (msg.type === "ob-conversation-outbox")
          return {
            ok: true,
            conversations: waiting,
            count: waiting.length,
            bytes: 1000,
          };
        if (msg.type === "ob-conversation-discard") {
          waiting = [];
          return { ok: true };
        }
        return original(msg);
      };
    });
    await ui().locator("[data-tab=activity]").click();
    await ui()
      .getByRole("button", { name: "Discard waiting capture", exact: true })
      .waitFor();
    assert.match(
      await ui().locator("#queue-list").innerText(),
      /Reopen the source conversation/,
    );
    assert.equal(await ui().locator("#queue-list img").count(), 0);
    await page.screenshot({
      path: path.join(dir, "conversation-outbox.png"),
      fullPage: true,
    });
    await ui()
      .getByRole("button", { name: "Discard waiting capture", exact: true })
      .click();
    await ui().getByRole("button", { name: "Keep it", exact: true }).click();
    assert.equal(
      await ui()
        .getByRole("button", { name: "Discard waiting capture", exact: true })
        .count(),
      1,
    );
    await ui()
      .getByRole("button", { name: "Discard waiting capture", exact: true })
      .click();
    await ui()
      .getByRole("dialog")
      .getByRole("button", { name: "Discard waiting capture", exact: true })
      .click();
    await ui()
      .getByRole("button", { name: "Discard waiting capture", exact: true })
      .waitFor({ state: "hidden" });
    assert.deepEqual(fixtureRequests, [], "content fixtures must not run the preview controller");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(dir, "browser-acceptance.json"),
      JSON.stringify(
        { ok: true, contentFixtureIsolated: true, lookSurfaceScreenChecks: 64, minPanelWidth: 280, errors },
        null,
        2,
      ),
    );
    console.log(
      "PASS: capture review, capsule versions, XSS text rendering, exclusions, durable conversation outbox/discard confirmation, 8 looks × 2 surfaces × 4 screens, 280px layout, motion pause, private extraction, focused insertion, no automatic draft queries.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
