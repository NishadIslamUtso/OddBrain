/** Read-only visual bridge. Never transports CSS, names, keys or app settings. */
export const EXTENSION_COLOR_TOKENS = [
  "--color-bg",
  "--color-panel",
  "--color-card",
  "--color-line",
  "--color-ink",
  "--color-muted",
  "--color-accent",
  "--accent-ink",
  "--ob-accent-text",
  "--ob-focus",
] as const;
export const EXTENSION_FONT_TOKENS = [
  "--font-sans",
  "--ob-heading-font",
  "--transcript-font",
] as const;
export const EXTENSION_SIZE_TOKENS = [
  "--ob-radius",
  "--ob-control-radius",
  "--ob-border-size",
  "--transcript-size",
] as const;
export const EXTENSION_ROLES = [
  "idle",
  "thinking",
  "working",
  "waiting",
  "done",
  "searching",
  "making",
  "resting",
] as const;
export type ExtensionAppearance = {
  version: 1;
  tokens: Record<string, string>;
  scheme: "light" | "dark";
  style: string;
  density: string;
  motion: string;
  speed: number;
  paused: boolean;
  interactions: boolean;
  captions: boolean;
  words: boolean;
  mischief: string;
  roles: Record<string, string>;
};
export function normalizeExtensionAppearance(
  value: unknown,
): ExtensionAppearance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !v.tokens || typeof v.tokens !== "object") return null;
  const incoming = v.tokens as Record<string, unknown>,
    tokens: Record<string, string> = {};
  for (const key of EXTENSION_COLOR_TOKENS) {
    const text = incoming[key];
    if (
      typeof text === "string" &&
      /^(#[a-f\d]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i.test(text.trim())
    )
      tokens[key] = text.trim();
  }
  for (const key of EXTENSION_FONT_TOKENS) {
    const text = incoming[key];
    if (
      typeof text === "string" &&
      text.length <= 180 &&
      /^[\w\s,'"-]+$/.test(text)
    )
      tokens[key] = text;
  }
  for (const key of EXTENSION_SIZE_TOKENS) {
    const text = incoming[key];
    if (typeof text === "string" && /^(?:\d{1,2}(?:\.\d{1,2})?)px$/.test(text))
      tokens[key] = text;
  }
  if (!tokens["--color-bg"] || !tokens["--color-ink"]) return null;
  const choose = (k: string, values: string[], fallback: string): string =>
    values.includes(String(v[k])) ? String(v[k]) : fallback;
  const roles =
    v.roles && typeof v.roles === "object"
      ? (v.roles as Record<string, unknown>)
      : {};
  return {
    version: 1,
    tokens,
    scheme: v.scheme === "dark" ? "dark" : "light",
    style: choose("style", ["editorial", "ink", "soft", "glass"], "editorial"),
    density: choose("density", ["compact", "comfortable"], "comfortable"),
    motion: choose(
      "motion",
      ["system", "still", "calm", "balanced", "playful"],
      "system",
    ),
    speed:
      typeof v.speed === "number" && Number.isFinite(v.speed)
        ? Math.max(0.5, Math.min(1.5, v.speed))
        : 1,
    paused: v.paused === true,
    interactions: v.interactions !== false,
    captions: v.captions !== false,
    words: v.words === true,
    mischief: choose("mischief", ["quiet", "witty", "extra"], "witty"),
    roles: Object.fromEntries(
      EXTENSION_ROLES.map((role) => [
        role,
        typeof roles[role] === "string" &&
        /^[a-z][a-z0-9-]{0,50}$/.test(roles[role] as string)
          ? roles[role]
          : "auto",
      ]),
    ),
  };
}
