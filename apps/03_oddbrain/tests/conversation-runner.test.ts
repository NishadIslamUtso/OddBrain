import { IDBFactory } from "fake-indexeddb";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const { create: createOutbox } = createRequire(import.meta.url)(
  "../../../extension/lib/conversation-outbox.js",
);
/** Real Chromium DOM + paired vault; Chrome APIs are explicit fixtures, not a
 * claim of native MV3 or authenticated provider acceptance. */
import { it, expect } from "vitest";
import { readFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createVaultService } from "../src/main/vault/service";
import { startExtensionApi } from "../src/main/extension/server";
const browserOptions = process.env.ODDBRAIN_BROWSER_OPTIONS;
const extension = fileURLToPath(
  new URL("../../../extension/", import.meta.url),
);
it.skipIf(!browserOptions)(
  "runs the automatic reader through streaming, media, reload, pause, exclusion and SPA navigation",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "ob-reader-browser-"));
    const vault = createVaultService({ vaultPath: root });
    const app = await startExtensionApi({ port: 0, vault });
    const browser = await chromium.launch(
      JSON.parse(readFileSync(browserOptions!, "utf8")),
    );
    const outbox = createOutbox({
      indexedDB: new IDBFactory(),
      digest: async (value: string) =>
        createHash("sha256").update(value).digest("hex"),
    });
    const destination = { identity: "a".repeat(64), target: "b".repeat(64) };
    let offline = false,
      excluded = false,
      missing = true;
    const writes: any[] = [],
      progress: any[] = [],
      mediaFetches: string[] = [];
    const content =
      '<!doctype html><title>Fixtures - ChatGPT</title><main><a href="/c/fixture" data-conversation-title>Correct title</a><div data-message-id="u1" data-message-author-role="user">Hi<img alt="photo" src="https://chatgpt.com/photo.png"><a download="voice.ogg" href="https://chatgpt.com/voice.ogg">Voice</a><a download="missing.pdf" href="https://chatgpt.com/missing.pdf">File</a><textarea>UNSENT_SECRET</textarea></div><div data-message-id="a1" data-message-author-role="assistant">Starting</div><button data-testid="stop-button">Stop</button></main>';
    const photo = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    );
    const voice = Buffer.from("OggS" + "voice-test".repeat(65_000));
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("dialog", (dialog) => void dialog.accept());
      await page.exposeFunction("__relay", async (msg: any) => {
        if (msg.type === "ob-conversation-access")
          return { allowed: !excluded, excluded };
        if (msg.type === "ob-conversation-progress") {
          progress.push(msg.status);
          return { ok: true };
        }
        if (msg.type !== "ob-conversation-sync") return { ok: false };
        const post = async (payload: any) => {
          // This fixture exercises the reader transport, while worker tests
          // exercise policy/target guards. The real vault still writes evidence.
          const { capture_target: _target, ...body } = payload;
          const response = await fetch(app.url + "/conversation-sync", {
            method: "POST",
            headers: {
              origin: "chrome-extension://fixture",
              "content-type": "application/json",
              "x-oddbrain-pair": app.pairToken,
            },
            body: JSON.stringify(body),
          });
          const result = await response.json();
          if (body.op === "messages") writes.push({ payload: body, result });
          return result;
        };
        if (
          ["messages", "media-part", "media-finish"].includes(msg.payload.op)
        ) {
          const row = await outbox.enqueue(msg.payload, destination);
          return { ok: true, queued: true, receipt: row.id };
        }
        if (msg.payload.op === "delivery") {
          if (!offline)
            for (const row of await outbox.list()) {
              const result = await post(await outbox.body(row.id));
              if (!result.ok) break;
              await outbox.remove([row.id], true);
            }
          return { ok: true, ...(await outbox.receipts(msg.payload.receipts)) };
        }
        if (offline) return { ok: true, saved: null, parts: [] };
        // A fresh message may still be waiting locally when media-state is read.
        const result = await post(msg.payload);
        return !result.ok && msg.payload.op === "media-state"
          ? { ok: true, saved: null }
          : result;
      });
      await page.addInitScript(() => {
        const callbacks: any[] = [],
          values: any = {
            autoCaptureAi: true,
            conversationSites: { instagram: true },
          };
        (window as any).chrome = {
          runtime: {
            id: "fixture",
            sendMessage: (msg: any) => (window as any).__relay(msg),
          },
          extension: {},
          storage: {
            local: {
              get: async (defaults: any) => ({ ...defaults, ...values }),
              set: async (updates: any) => {
                Object.assign(values, updates);
                callbacks.forEach((fn) =>
                  fn(
                    Object.fromEntries(
                      Object.entries(updates).map(([k, value]) => [
                        k,
                        { newValue: value },
                      ]),
                    ),
                    "local",
                  ),
                );
              },
            },
            onChanged: { addListener: (fn: any) => callbacks.push(fn) },
          },
        };
      });
      await page.route("https://chatgpt.com/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().resourceType() === "fetch") mediaFetches.push(path);
        if (path === "/photo.png")
          return route.fulfill({
            status: 200,
            contentType: "image/png",
            body: photo,
          });
        if (path === "/voice.ogg")
          return route.fulfill({
            status: 200,
            contentType: "audio/ogg",
            body: voice,
          });
        if (path === "/missing.pdf")
          return route.fulfill({
            status: missing ? 403 : 200,
            contentType: "application/pdf",
            body: missing ? "Denied" : "%PDF-1.7 original",
          });
        return route.fulfill({
          status: 200,
          contentType: "text/html",
          body: content,
        });
      });
      const install = async () => {
        for (const file of [
          "lib/conversation-adapters.js",
          "content-scripts/conversation-sync.js",
        ])
          await page.addScriptTag({
            content: readFileSync(join(extension, file), "utf8"),
          });
      };
      await page.goto("https://chatgpt.com/c/fixture");
      await install();
      await expect
        .poll(() => progress.at(-1)?.state, { timeout: 15000 })
        .toBe("Attachments pending");
      expect(progress.at(-1).media).toBe("2/3");
      expect(
        writes
          .flatMap((w) => w.payload.messages)
          .some((m) => m.text.includes("UNSENT_SECRET")),
      ).toBe(false);
      expect(writes[0].payload.conversation.title).toBe("Correct title");
      const source = writes[0].result.source;
      await page.evaluate(() => {
        document.querySelector('[data-message-id="a1"]')!.textContent =
          "Final answer " + "x".repeat(70_000);
        document.querySelector('[data-testid="stop-button"]')!.remove();
        document.querySelector("[data-conversation-title]")!.textContent =
          "Renamed conversation";
      });
      await expect
        .poll(
          () =>
            writes
              .flatMap((w) => w.payload.messages)
              .some((m) => m.text.length > 70_000),
          { timeout: 15000 },
        )
        .toBe(true);
      expect(
        JSON.parse(
          readFileSync(join(root, source, "conversation.json"), "utf8"),
        ).title,
      ).toBe("Renamed conversation");
      // Same native ID, new immutable revision, not a second message in the projection.
      expect(
        readdirSync(join(root, source, "messages")).filter((f) =>
          f.endsWith(".md"),
        ),
      ).toHaveLength(2);
      await page.evaluate(() =>
        (window as any).chrome.storage.local.set({ conversationPaused: true }),
      );
      await expect
        .poll(() => progress.at(-1)?.state, { timeout: 10000 })
        .toBe("Paused");
      const paused = writes.length;
      await page.evaluate(() => {
        document.querySelector('[data-message-id="a1"]')!.textContent =
          "After pause";
      });
      await page.waitForTimeout(3500);
      expect(writes).toHaveLength(paused);
      await page.evaluate(() =>
        (window as any).chrome.storage.local.set({ conversationPaused: false }),
      );
      await expect
        .poll(
          () =>
            writes
              .flatMap((w) => w.payload.messages)
              .some((m) => m.text === "After pause"),
          { timeout: 15000 },
        )
        .toBe(true);
      offline = true;
      await page.evaluate(() => {
        document.querySelector('[data-message-id="a1"]')!.textContent =
          "While offline";
      });
      await expect
        .poll(() => progress.at(-1)?.state, { timeout: 15000 })
        .toBe("Queued on this browser");
      offline = false;
      missing = false;
      // Reload resumes from disk. Already saved originals must not be downloaded again.
      const photosBefore = mediaFetches.filter(
        (p) => p === "/photo.png",
      ).length;
      const voicesBefore = mediaFetches.filter(
        (p) => p === "/voice.ogg",
      ).length;
      await page.reload();
      await install();
      await expect
        .poll(() => progress.at(-1)?.media, { timeout: 15000 })
        .toBe("3/3");
      expect(mediaFetches.filter((p) => p === "/photo.png")).toHaveLength(
        photosBefore,
      );
      expect(mediaFetches.filter((p) => p === "/voice.ogg")).toHaveLength(
        voicesBefore,
      );
      // A stale reloaded tab must not replace the newer persisted response.
      const records = readdirSync(join(root, source, "messages"))
        .filter((f) => f.endsWith(".json"))
        .map((f) =>
          JSON.parse(readFileSync(join(root, source, "messages", f), "utf8")),
        );
      expect(records.find((r) => r.message.id === "a1").message.text).toBe(
        "While offline",
      );
      await page.evaluate(() => {
        history.pushState({}, "", "/c/second");
        document.querySelector('[data-message-id="u1"]')!.textContent =
          "Different conversation";
        document.querySelector('[data-message-id="a1"]')!.remove();
      });
      await expect
        .poll(
          () =>
            writes.some((w) =>
              w.payload.conversation.key.endsWith("/c/second"),
            ),
          { timeout: 15000 },
        )
        .toBe(true);
      expect(
        writes.find((w) => w.payload.conversation.key.endsWith("/c/second"))
          .result.source,
      ).not.toBe(source);
      excluded = true;
      await page.evaluate(() => {
        document.querySelector('[data-message-id="u1"]')!.textContent =
          "EXCLUDED_SECRET";
      });
      await expect
        .poll(
          () => page.locator('[data-oddbrain="conversation-progress"]').count(),
          { timeout: 15000 },
        )
        .toBe(0);
      expect(
        writes
          .flatMap((w) => w.payload.messages)
          .some((m) => m.text.includes("EXCLUDED_SECRET")),
      ).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      await outbox.close();
      await browser.close();
      await app.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
  120_000,
);
