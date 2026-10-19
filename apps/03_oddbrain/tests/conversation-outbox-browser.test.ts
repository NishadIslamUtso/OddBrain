/** Real Chromium IndexedDB persisted across a complete browser restart.
 * This does not claim native MV3 service-worker lifecycle acceptance. */
import { it, expect } from "vitest";
import { chromium } from "playwright-core";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const options = process.env.ODDBRAIN_BROWSER_OPTIONS;
it.skipIf(!options)(
  "keeps text and attachment bytes after closing the source page and restarting Chromium",
  async () => {
    const profile = mkdtempSync(join(tmpdir(), "ob-outbox-browser-"));
    const launch = () =>
      chromium.launchPersistentContext(
        profile,
        JSON.parse(readFileSync(options!, "utf8")),
      );
    let context = await launch();
    const install = async () => {
      const page = await context.newPage();
      await page.route("https://outbox.fixture/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Outbox fixture</title>",
        }),
      );
      await page.goto("https://outbox.fixture/");
      await page.addScriptTag({
        content: readFileSync(
          new URL(
            "../../../extension/lib/conversation-adapters.js",
            import.meta.url,
          ),
          "utf8",
        ),
      });
      await page.addScriptTag({
        content: readFileSync(
          new URL(
            "../../../extension/lib/conversation-outbox.js",
            import.meta.url,
          ),
          "utf8",
        ),
      });
      await page.evaluate(() => {
        (window as any).queue = (window as any).OddConversationOutbox.create();
      });
      return page;
    };
    try {
      let page = await install();
      const ids = await page.evaluate(async () => {
        const queue = (window as any).queue,
          destination = { identity: "a".repeat(64), target: "b".repeat(64) };
        const common = {
          url: "https://chatgpt.com/c/offline",
          conversation: { key: "chatgpt:offline", title: "Offline fixture" },
        };
        const text = await queue.enqueue(
          {
            ...common,
            op: "messages",
            messages: [{ id: "m", text: "RESTART_PROTECTED" }],
          },
          destination,
        );
        const file = await queue.enqueue(
          {
            ...common,
            op: "media-part",
            message_id: "m",
            attachment_id: "file",
            index: 0,
            hash: "c".repeat(64),
            data: btoa("ATTACHMENT_BYTES"),
          },
          destination,
        );
        return [text.id, file.id];
      });
      await page.close();
      await context.close();
      context = await launch();
      page = await install();
      const restored = await page.evaluate(async (ids) => {
        const queue = (window as any).queue;
        return {
          receipt: await queue.receipts(ids),
          text: (await queue.body(ids[0])).messages[0].text,
          file: atob((await queue.body(ids[1])).data),
        };
      }, ids);
      expect(restored).toMatchObject({
        receipt: { queued: 2, saved: 0 },
        text: "RESTART_PROTECTED",
        file: "ATTACHMENT_BYTES",
      });
      await page.evaluate(async () => {
        await (window as any).queue.clear();
      });
      expect(await page.evaluate(() => (window as any).queue.list())).toEqual(
        [],
      );
    } finally {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    }
  },
  60000,
);
