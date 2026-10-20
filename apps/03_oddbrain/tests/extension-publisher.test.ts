// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishExtensionAppearance } from "../src/renderer/src/lib/extensionAppearance";
import { DEFAULT_APPEARANCE } from "../src/renderer/src/state/appearance";
import { DEFAULT_LOOK } from "../src/renderer/src/state/look";

afterEach(() => {
  delete window.api;
  document.documentElement.removeAttribute("style");
  history.replaceState({}, "", "/");
});
describe("desktop appearance publisher", () => {
  it("publishes the applied tokens and role preferences without changing app settings", async () => {
    const publish = vi.fn(async () => ({ ok: true }));
    Object.defineProperty(window, "api", {
      configurable: true,
      value: { extension: { publishAppearance: publish } },
    });
    const root = document.documentElement;
    root.style.setProperty("--color-bg", "#123456");
    root.style.setProperty("--color-ink", "#ffffff");
    root.style.setProperty("--font-sans", "Consolas, monospace");
    root.style.setProperty("--transcript-size", "16.5px");
    root.style.colorScheme = "dark";
    publishExtensionAppearance(DEFAULT_APPEARANCE, {
      ...DEFAULT_LOOK,
      paused: true,
      roles: { ...DEFAULT_LOOK.roles, idle: "glasses-clean" },
    });
    expect(publish).toHaveBeenCalledOnce();
    const snapshot = publish.mock.calls[0][0];
    expect(snapshot.tokens["--color-bg"]).toBe("#123456");
    expect(snapshot.tokens["--transcript-size"]).toBe("16.5px");
    expect(snapshot.roles.idle).toBe("glasses-clean");
    expect(snapshot.paused).toBe(true);
    expect(snapshot.scheme).toBe("dark");
    expect(snapshot).not.toHaveProperty("packCss");
    expect(snapshot).not.toHaveProperty("profile");
  });
  it("browser previews and quick windows cannot overwrite desktop appearance", () => {
    expect(() =>
      publishExtensionAppearance(DEFAULT_APPEARANCE, DEFAULT_LOOK),
    ).not.toThrow();
    const publish = vi.fn(async () => ({ ok: true }));
    Object.defineProperty(window, "api", {
      configurable: true,
      value: { extension: { publishAppearance: publish } },
    });
    history.replaceState({}, "", "/?quick=1");
    publishExtensionAppearance(DEFAULT_APPEARANCE, DEFAULT_LOOK);
    expect(publish).not.toHaveBeenCalled();
  });
});
