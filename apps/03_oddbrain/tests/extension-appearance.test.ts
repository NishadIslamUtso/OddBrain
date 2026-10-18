import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { normalizeExtensionAppearance } from "../src/shared/lib/extensionAppearance";
import { DEFAULT_APPEARANCE } from "../src/renderer/src/state/appearance";
import {
  DEFAULT_SIDEBAR,
  lookTokens,
  presetSnapshot,
} from "../src/renderer/src/state/look";
import { LOOK_PRESETS } from "../src/renderer/src/ui/lookCatalog";
import { startExtensionApi } from "../src/main/extension/server";
import { createVaultService } from "../src/main/vault/service";
const require = createRequire(import.meta.url);
const browser = require("../../../extension/lib/appearance.js");
export const exampleLook = {
  version: 1,
  tokens: {
    "--color-bg": "#fafafa",
    "--color-ink": "#222222",
    "--color-accent": "#334455",
    "--font-sans": "system-ui, sans-serif",
  },
  scheme: "light",
  style: "ink",
  speed: 1,
  roles: { idle: "idle" },
};

describe("the extension receives safe appearance, not settings or code", () => {
  it("all eight saved looks use the same token values and browser normalization", () => {
    for (const preset of LOOK_PRESETS) {
      const s = presetSnapshot(preset.id, DEFAULT_APPEARANCE, DEFAULT_SIDEBAR)!;
      const tokens = lookTokens(s.appearance, s.look);
      const data = {
        ...s.look,
        version: 1,
        tokens,
        scheme: tokens["--ob-scheme"],
        motion: s.appearance.motion,
      };
      const clean = normalizeExtensionAppearance(data)!;
      expect(clean).not.toBeNull();
      expect(clean.tokens["--color-bg"]).toBe(tokens["--color-bg"]);
      expect(clean.roles).toEqual(s.look.roles);
      expect(browser.clean(data)).toEqual(clean);
    }
  });
  it("drops arbitrary CSS, private data, URLs, paths and invalid sizes", () => {
    const clean = normalizeExtensionAppearance({
      ...exampleLook,
      token: "secret",
      name: "private",
      packCss: "body{display:none}",
      roles: { idle: "../../secret" },
      tokens: {
        ...exampleLook.tokens,
        "--color-accent": "url(https://tracker.test)",
        "--font-sans": "x; background:url(x)",
        "--ob-radius": "9999px",
        "--secret": "token",
      },
    })!;
    expect(clean.tokens["--color-accent"]).toBeUndefined();
    expect(clean.tokens["--font-sans"]).toBeUndefined();
    expect(clean.tokens["--ob-radius"]).toBeUndefined();
    expect(clean.roles.idle).toBe("auto");
    expect(JSON.stringify(clean)).not.toMatch(
      /secret|private|tracker|display:none/,
    );
    expect(
      browser.clean({ ...exampleLook, tokens: { "--color-bg": "url(x)" } }),
    ).toBeNull();
  });
  it("requires pairing, refuses web pages and POST, and reads changes live", async () => {
    const root = mkdtempSync(join(tmpdir(), "ob-appearance-"));
    let current = normalizeExtensionAppearance(exampleLook);
    const api = await startExtensionApi({
      port: 0,
      vault: createVaultService({ vaultPath: root }),
      appearance: () => current,
      mayCapture: () => false,
    });
    try {
      const headers = {
        origin: "chrome-extension://test-extension",
        "x-oddbrain-pair": api.pairToken,
      };
      expect(
        (
          await fetch(api.url + "/appearance", {
            headers: { origin: headers.origin },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(api.url + "/appearance", {
            headers: { ...headers, origin: "https://example.com" },
          })
        ).status,
      ).toBe(403);
      expect(
        (await fetch(api.url + "/appearance", { method: "POST", headers }))
          .status,
      ).toBe(405);
      const answer = await (
        await fetch(api.url + "/appearance", { headers })
      ).json();
      expect(answer.appearance.tokens["--color-bg"]).toBe("#fafafa");
      current = normalizeExtensionAppearance({
        ...exampleLook,
        tokens: { ...exampleLook.tokens, "--color-bg": "#111111" },
      });
      expect(
        (await (await fetch(api.url + "/appearance", { headers })).json())
          .appearance.tokens["--color-bg"],
      ).toBe("#111111");
      const preflight = await fetch(api.url + "/appearance", {
        method: "OPTIONS",
        headers,
      });
      expect(preflight.headers.get("access-control-allow-headers")).toContain(
        "x-oddbrain-pair",
      );
      for (const route of ["/settings", "/chat", "/export-zip"])
        expect((await fetch(api.url + route, { headers })).status).toBe(404);
    } finally {
      await api.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
