import {
  EXTENSION_COLOR_TOKENS,
  EXTENSION_FONT_TOKENS,
  EXTENSION_SIZE_TOKENS,
  normalizeExtensionAppearance,
} from "@shared/lib/extensionAppearance";
import type { Appearance } from "../state/appearance";
import type { LookPreferences } from "../state/look";
/** Read the actual applied palette, including custom mixes and theme packs.
 * Only resolved safe visual tokens cross IPC; arbitrary pack CSS does not. */
export function publishExtensionAppearance(
  appearance: Appearance,
  look: LookPreferences,
): void {
  const publish = window.api?.extension?.publishAppearance;
  if (!publish || new URLSearchParams(location.search).has("quick")) return;
  const computed = getComputedStyle(document.documentElement);
  const tokens = Object.fromEntries(
    [
      ...EXTENSION_COLOR_TOKENS,
      ...EXTENSION_FONT_TOKENS,
      ...EXTENSION_SIZE_TOKENS,
    ].map((key) => [key, computed.getPropertyValue(key).trim()]),
  );
  const snapshot = normalizeExtensionAppearance({
    version: 1,
    tokens,
    scheme: computed.colorScheme === "dark" ? "dark" : "light",
    style: look.style,
    density: look.density,
    motion: appearance.motion,
    speed: look.speed,
    paused: look.paused,
    interactions: look.interactions,
    captions: look.captions,
    words: appearance.mascotWords,
    mischief: look.mischief,
    roles: look.roles,
  });
  if (snapshot)
    void publish(snapshot).catch(() => {
      /* Extension can ask again after app startup. */
    });
}
