/* The desktop is the authority. Only safe, resolved visual values are applied. */
(function (root) {
  const colors = [
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
  ];
  const fonts = ["--font-sans", "--ob-heading-font", "--transcript-font"];
  const sizes = [
    "--ob-radius",
    "--ob-control-radius",
    "--ob-border-size",
    "--transcript-size",
  ];
  function clean(value) {
    if (!value || value.version !== 1 || !value.tokens) return null;
    const tokens = {};
    for (const key of colors) {
      const v = value.tokens[key];
      if (
        typeof v === "string" &&
        /^(#[a-f\d]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i.test(v.trim())
      )
        tokens[key] = v.trim();
    }
    for (const key of fonts) {
      const v = value.tokens[key];
      if (typeof v === "string" && v.length <= 180 && /^[\w\s,'"-]+$/.test(v))
        tokens[key] = v;
    }
    for (const key of sizes) {
      const v = value.tokens[key];
      if (typeof v === "string" && /^(?:\d{1,2}(?:\.\d{1,2})?)px$/.test(v))
        tokens[key] = v;
    }
    if (!tokens["--color-bg"] || !tokens["--color-ink"]) return null;
    const pick = (key, values, fallback) =>
      values.includes(value[key]) ? value[key] : fallback;
    const roles = {};
    for (const role of [
      "idle",
      "thinking",
      "working",
      "waiting",
      "done",
      "searching",
      "making",
      "resting",
    ])
      roles[role] = /^[a-z][a-z0-9-]{0,50}$/.test(value.roles?.[role] || "")
        ? value.roles[role]
        : "auto";
    return {
      version: 1,
      tokens,
      roles,
      scheme: value.scheme === "dark" ? "dark" : "light",
      style: pick("style", ["editorial", "ink", "soft", "glass"], "editorial"),
      density: pick("density", ["compact", "comfortable"], "comfortable"),
      motion: pick(
        "motion",
        ["system", "still", "calm", "balanced", "playful"],
        "system",
      ),
      speed: Number.isFinite(value.speed)
        ? Math.max(0.5, Math.min(1.5, value.speed))
        : 1,
      paused: value.paused === true,
      interactions: value.interactions !== false,
      captions: value.captions !== false,
      words: value.words === true,
      mischief: pick("mischief", ["quiet", "witty", "extra"], "witty"),
    };
  }
  function apply(value, target = document.documentElement) {
    const a = clean(value);
    for (const key of [...colors, ...fonts, ...sizes])
      target.style.removeProperty(key);
    if (a)
      for (const [key, v] of Object.entries(a.tokens))
        target.style.setProperty(key, v);
    target.style.colorScheme = a?.scheme || "light dark";
    target.dataset.style = a?.style || "editorial";
    target.dataset.density = a?.density || "comfortable";
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.dataset.still = String(
      !!(reduced || a?.paused || a?.motion === "still"),
    );
    target.style.setProperty(
      "--play-state",
      target.dataset.still === "true" ? "paused" : "running",
    );
    return a;
  }
  root.OddAppearance = { clean, apply };
  if (typeof module !== "undefined") module.exports = root.OddAppearance;
})(globalThis);
