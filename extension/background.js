/* MV3 worker. Only this context talks to the paired desktop app. */
importScripts(
  "lib/vault-writer.js",
  "lib/blacklist.js",
  "lib/appearance.js",
  "lib/page-extract.js",
  "lib/conversation-adapters.js",
  "lib/conversation-outbox.js",
  "lib/conversation-delivery.js",
);
const DEFAULT_PATTERNS = ["bank.com/*"];
async function api(path, options = {}) {
  const res = await fetch(`${await localApiBase()}${path}`, {
    ...options,
    headers: await pairHeaders(!!options.body),
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(6000)])
      : AbortSignal.timeout(6000),
  });
  const data = await res.json().catch(() => ({}));
  return { ...data, ok: res.ok && data.ok !== false, status: res.status };
}
async function currentPatterns() {
  const local = await chrome.storage.sync.get({
    excluded_patterns: DEFAULT_PATTERNS,
  });
  const { blacklistPending } =
    await chrome.storage.local.get("blacklistPending");
  if (Array.isArray(blacklistPending)) return blacklistPending;
  try {
    const data = await api("/blacklist");
    if (data.ok && Array.isArray(data.excluded_patterns)) {
      if (
        JSON.stringify(local.excluded_patterns) !==
        JSON.stringify(data.excluded_patterns)
      )
        await chrome.storage.sync.set({
          excluded_patterns: data.excluded_patterns,
        });
      return data.excluded_patterns;
    }
  } catch {}
  return local.excluded_patterns;
}
// Also used by the outbox immediately before sending a queued page.
checkBlacklist = async (url) => isExcluded(url, await currentPatterns());
async function syncBlacklist() {
  const { blacklistPending } =
    await chrome.storage.local.get("blacklistPending");
  if (!Array.isArray(blacklistPending)) return { ok: true };
  try {
    const result = await api("/blacklist", {
      method: "POST",
      body: JSON.stringify({ excluded_patterns: blacklistPending }),
    });
    if (result.ok) {
      const latest = await chrome.storage.local.get("blacklistPending");
      if (
        JSON.stringify(latest.blacklistPending) ===
        JSON.stringify(blacklistPending)
      )
        await chrome.storage.local.remove("blacklistPending");
    }
    return result;
  } catch {
    return {
      ok: false,
      offline: true,
      error:
        "Saved in this browser. The app copy will update when it reconnects.",
    };
  }
}
async function changeBlacklist(patterns) {
  if (
    !Array.isArray(patterns) ||
    patterns.length > 200 ||
    patterns.some((p) => typeof p !== "string" || !p.trim() || p.length > 500)
  )
    throw Error("Use up to 200 site patterns, each under 500 characters.");
  const clean = [...new Set(patterns.map((p) => p.trim()))];
  await chrome.storage.local.set({ blacklistPending: clean });
  await chrome.storage.sync.set({ excluded_patterns: clean });
  interruptConversations();
  await pruneConversations();
  return syncBlacklist();
}
async function connection() {
  if (!(await getPairToken()))
    return {
      ok: false,
      unpaired: true,
      error: "Pair with the desktop app to save to your vault.",
    };
  try {
    const health = await api("/health");
    if (health.status === 401)
      return {
        ok: false,
        unpaired: true,
        error:
          "The pairing token was refused. Copy the current token from the app.",
      };
    if (!health.ok || health.app !== "OddBrain")
      return {
        ok: false,
        error: health.error || "This port did not answer as OddBrain.",
      };
    await rememberConversationDestination(health);
    return {
      ok: true,
      captures: health.captures,
      available: health.available,
      durableCapture: /^[a-f0-9]{64}$/.test(health.capture_target || ""),
      // Why recoverable capture is off, when the app can say.
      captureProblem: String(health.capture_problem || ""),
    };
  } catch {
    return {
      ok: false,
      offline: true,
      error: "App not reachable. Paired captures can wait in this browser.",
    };
  }
}
async function synchronize() {
  const status = await connection();
  if (status.ok) {
    await syncBlacklist();
    try {
      const answer = await api("/appearance");
      const appearance = OddAppearance.clean(answer.appearance);
      if (answer.ok && appearance) {
        const old = await chrome.storage.local.get("appAppearance");
        if (JSON.stringify(old.appAppearance) !== JSON.stringify(appearance))
          await chrome.storage.local.set({ appAppearance: appearance });
        await chrome.storage.local.set({ appearanceSyncedAt: Date.now() });
      }
    } catch {}
  }
  return status;
}
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || tab.incognito)
    throw Error("Private windows are not captured.");
  if (!/^https?:\/\//.test(tab.url || ""))
    throw Error(
      "This browser page cannot be read. Open a regular website and try again.",
    );
  if (await checkBlacklist(tab.url))
    throw Error("This site is on your Never-check list. Nothing was read.");
  return tab;
}
async function preview(mode) {
  const tab = await activeTab();
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: oddExtractPage,
      args: [mode],
    });
    return { ...result, tabId: tab.id };
  } catch {
    return {
      ok: false,
      error:
        "The browser did not grant access to this tab. Click OddBrain’s toolbar icon on this page, or enable broad access in Settings. Browser-internal and store pages cannot be captured.",
    };
  }
}
function boundedCapsules(entries) {
  const kept = [];
  let bytes = 0;
  for (const entry of entries.slice(-200).reverse()) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      typeof entry.title !== "string"
    )
      continue;
    const size = new TextEncoder().encode(JSON.stringify(entry)).byteLength;
    if (bytes + size > 3_000_000) continue;
    kept.unshift(entry);
    bytes += size;
  }
  return kept;
}
async function capture(payload, sender) {
  return withOutbox(() => captureUnlocked(payload, sender));
}
async function captureUnlocked(payload, sender) {
  if (sender.tab?.incognito)
    return { ok: false, error: "Private windows are never captured." };
  if (!payload || typeof payload !== "object")
    throw Error("Capture content is missing.");
  if (sender.tab) {
    if (payload.type === "blacklist_update")
      throw Error("Change site exclusions in the extension settings.");
    if (!payload.url || payload.url !== sender.tab.url)
      throw Error("The page address changed. Review it again.");
  }
  if (
    payload.url &&
    (!/^https?:\/\//.test(payload.url) || (await checkBlacklist(payload.url)))
  )
    return { ok: false, error: "This page is excluded. Nothing was saved." };
  if (!(await getPairToken()))
    return {
      ok: false,
      unpaired: true,
      error: "Pair with OddBrain before saving.",
    };
  const result = await handleCaptureRelayUnlocked(payload);
  if (
    (result.ok || result.queued) &&
    payload.type === "capsule" &&
    payload.capsule
  ) {
    const { capsules = [] } = await chrome.storage.local.get({ capsules: [] });
    try {
      await chrome.storage.local.set({
        capsules: boundedCapsules([
          ...(Array.isArray(capsules) ? capsules : []).filter(
            (c) => c.id !== payload.capsule.id,
          ),
          payload.capsule,
        ]),
      });
    } catch {
      // A cache failure cannot turn an acknowledged vault write into "not saved".
      result.cacheWarning =
        "Saved, but the browser library cache is full. Refresh with the app open.";
    }
  }
  return result;
}
async function library() {
  return withOutbox(libraryUnlocked);
}
async function libraryUnlocked() {
  const cached = await chrome.storage.local.get({ capsules: [] });
  try {
    const result = await api("/capsules");
    if (result.ok && Array.isArray(result.capsules)) {
      const { queue = [] } = await chrome.storage.local.get({ queue: [] });
      const merged = new Map(result.capsules.map((c) => [c.id, c]));
      for (const item of queue)
        if (item.type === "capsule" && item.capsule)
          merged.set(item.capsule.id, item.capsule);
      const capsules = boundedCapsules([...merged.values()]);
      await chrome.storage.local.set({ capsules });
      return { ok: true, capsules };
    }
  } catch {}
  return { ok: false, cached: true, capsules: cached.capsules };
}
async function context(query) {
  try {
    const result = await api(
      "/context?q=" + encodeURIComponent(String(query || "").slice(0, 500)),
    );
    if (result.ok) return result;
  } catch {}
  const { capsules = [] } = await chrome.storage.local.get({ capsules: [] });
  const q = String(query || "").toLowerCase();
  return {
    capsules: capsules
      .filter((c) => c.suggestion_safe !== false)
      .filter((c) =>
        (c.title + " " + c.background + " " + (c.goals || []).join(" "))
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 8),
    entities: [],
    claims: [],
    cached: true,
  };
}
async function insertCapsule(capsule) {
  const tab = await activeTab();
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [
      "lib/page-extract.js",
      "lib/appearance.js",
      "content-scripts/companion.js",
    ],
  });
  return chrome.tabs.sendMessage(tab.id, {
    type: "ob-insert-preview",
    capsule,
  });
}
async function conversationAccess(sender, url) {
  if (
    !sender.tab ||
    (sender.frameId && sender.frameId !== 0) ||
    sender.tab.incognito
  )
    return {
      allowed: false,
      error: "Only a regular top-level conversation tab may collect.",
    };
  const actual = sender.url || sender.tab.url;
  if (actual !== url)
    return { allowed: false, error: "The conversation page changed." };
  const site = OddConversations.siteFor(url);
  if (!site) return { allowed: false, error: "No adapter for this site." };
  const prefs = await chrome.storage.local.get({
    autoCaptureAi: true,
    conversationSites: {},
    conversationPaused: false,
  });
  if (
    prefs.conversationPaused ||
    (site.kind === "ai"
      ? !prefs.autoCaptureAi
      : prefs.conversationSites?.[site.id] !== true)
  )
    return {
      allowed: false,
      error: "Conversation collection is paused or disabled for this site.",
    };
  if (await conversationExcluded(url))
    return { allowed: false, excluded: true, error: "This page is excluded." };
  if (!(await getPairToken()))
    return {
      allowed: false,
      error: "Pair with OddBrain to save conversations.",
    };
  if (
    !(await chrome.permissions.contains({
      origins: [new URL(url).origin + "/*"],
    }))
  )
    return {
      allowed: false,
      error: "Site permission was removed. Enable it in extension Settings.",
    };
  return { allowed: true, site };
}
async function conversationRelay(payload, sender) {
  const access = await conversationAccess(sender, payload?.url);
  if (!access.allowed) return { ok: false, ...access };
  const c = payload?.conversation;
  if (
    !c ||
    c.adapter !== access.site.id ||
    c.provider !== access.site.name ||
    typeof c.key !== "string" ||
    !c.key.startsWith(access.site.id + ":") ||
    new URL(c.url).origin !== new URL(payload.url).origin
  )
    throw Error("Conversation identity does not match the current site.");
  if (payload.op === "delivery") {
    await flushConversations();
    return {
      ok: true,
      ...(await conversationOutbox.receipts(payload.receipts)),
    };
  }
  if (payload.op === "media-state") return conversationMediaState(payload);
  if (!["messages", "media-part", "media-finish"].includes(payload.op))
    throw Error("Unsupported conversation operation.");
  return withOutbox(async () => {
    const fresh = await conversationAccess(sender, payload.url);
    if (!fresh.allowed) return { ok: false, ...fresh };
    return queueConversation(payload);
  });
}
async function conversationProgress(msg, sender) {
  if (
    !sender.tab ||
    sender.tab.incognito ||
    (sender.frameId && sender.frameId !== 0) ||
    (sender.url || sender.tab.url) !== msg.status?.url
  )
    return { ok: false };
  const s = msg.status;
  const clean = {
    state: String(s.state || "").slice(0, 100),
    detail: String(s.detail || "").slice(0, 1000),
    saved: Math.max(0, Math.min(256 * 1024 * 1024, Number(s.saved) || 0)),
    total: Math.max(0, Math.min(256 * 1024 * 1024, Number(s.total) || 0)),
    media: String(s.media || "").slice(0, 50),
    at: Date.now(),
  };
  // Session storage is cleared by the browser on restart; never persist chat titles here.
  if (chrome.storage.session)
    await chrome.storage.session.set({
      ["conversationProgress:" + sender.tab.id]: clean,
    });
  return { ok: true };
}
let conversationScriptLock = Promise.resolve();
function refreshConversationScripts() {
  const next = conversationScriptLock.then(
    refreshConversationScriptsUnlocked,
    refreshConversationScriptsUnlocked,
  );
  conversationScriptLock = next.catch(() => {});
  return next;
}
async function refreshConversationScriptsUnlocked() {
  const prefs = await chrome.storage.local.get({ conversationSites: {} });
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  for (const site of OddConversations.sites.filter((s) => s.kind !== "ai")) {
    const id = "oddbrain-conversations-" + site.id;
    const matches = site.hosts.map((host) => "https://" + host + "/*");
    const allowed =
      prefs.conversationSites?.[site.id] === true &&
      (await chrome.permissions.contains({ origins: matches }));
    const exists = scripts.some((s) => s.id === id);
    if (!allowed && exists)
      await chrome.scripting.unregisterContentScripts({ ids: [id] });
    if (allowed && !exists)
      await chrome.scripting.registerContentScripts([
        {
          id,
          matches,
          js: [
            "lib/conversation-adapters.js",
            "lib/appearance.js",
            "content-scripts/conversation-sync.js",
          ],
          runAt: "document_idle",
          allFrames: false,
          persistAcrossSessions: true,
        },
      ]);
  }
}
async function dispatch(msg, sender) {
  // Content scripts may capture, read exclusions, and explicitly request context.
  // They cannot change pairing, clear queues, or run arbitrary fetch/script jobs.
  const pageAllowed = [
    "ob-capture",
    "ob-conversation-access",
    "ob-conversation-sync",
    "ob-conversation-progress",
    "ob-blacklist-get",
    "ob-context",
    "ob-appearance",
    "ob-site-access",
  ];
  if (sender.tab && !pageAllowed.includes(msg.type))
    throw Error("This action belongs to the extension interface.");
  if (sender.tab?.incognito)
    throw Error("OddBrain is disabled in private windows.");
  switch (msg.type) {
    case "ob-conversation-access":
      return conversationAccess(sender, msg.url);
    case "ob-conversation-sync":
      return conversationRelay(msg.payload, sender);
    case "ob-conversation-progress":
      return conversationProgress(msg, sender);
    case "ob-conversation-settings":
      await refreshConversationScripts();
      return { ok: true };
    case "ob-conversation-status": {
      const tab = await activeTab();
      const key = "conversationProgress:" + tab.id;
      const saved = chrome.storage.session
        ? await chrome.storage.session.get(key)
        : {};
      return { ok: true, status: saved[key] || null };
    }
    case "ob-capture":
      return capture(msg.payload, sender);
    case "ob-blacklist-get":
      return { relay: await currentPatterns() };
    case "ob-blacklist-update":
      return changeBlacklist(msg.excluded_patterns);
    case "ob-context":
      if (sender.tab && (await checkBlacklist(sender.tab.url)))
        return { context: { capsules: [], entities: [], claims: [] } };
      return { context: await context(msg.query) };
    case "ob-site-access":
      return {
        allowed: !!sender.tab?.url && !(await checkBlacklist(sender.tab.url)),
      };
    case "ob-appearance":
      return {
        appearance:
          (await chrome.storage.local.get("appAppearance")).appAppearance ||
          null,
      };
    case "ob-sync":
      return synchronize();
    case "ob-library":
      return library();
    case "ob-preview":
      return preview(
        ["page", "selection", "structure"].includes(msg.mode)
          ? msg.mode
          : "page",
      );
    case "ob-insert":
      return insertCapsule(msg.capsule);
    case "ob-flush": {
      const status = await connection();
      if (!status.ok) return status;
      await syncBlacklist();
      for (const row of await conversationOutbox.list())
        await conversationOutbox.mark(row.id, "");
      await flushQueue();
      await flushConversations();
      return { ok: true };
    }
    case "ob-conversation-outbox":
      return { ok: true, ...(await conversationQueueSummary()) };
    case "ob-conversation-discard":
      return withOutbox(async () => ({
        ok: true,
        ...(await clearConversations(msg.id)),
      }));
    case "ob-pair":
      return withOutbox(async () => {
        if (
          typeof msg.token !== "string" ||
          !msg.token.trim() ||
          msg.token.length > 256 ||
          /\s/.test(msg.token) ||
          !Number.isInteger(msg.port) ||
          msg.port < 1 ||
          msg.port > 65535
        )
          throw Error("Invalid pairing details.");
        const previous = await chrome.storage.local.get({
          pairToken: "",
          appPort: 8765,
        });
        if (
          previous.pairToken &&
          (previous.pairToken !== msg.token || previous.appPort !== msg.port)
        ) {
          if (!msg.confirmChange)
            throw Error("Confirm changing the paired app first.");
          await clearConversations();
          await chrome.storage.local.remove("conversationDestination");
          await chrome.storage.local.set({
            queue: [],
            capsules: [],
            activity: [],
          });
          await chrome.storage.local.remove([
            "appAppearance",
            "appearanceSyncedAt",
          ]);
        }
        await chrome.storage.local.set({
          pairToken: msg.token,
          appPort: msg.port,
        });
        return { ok: true };
      });
    case "ob-forget":
      return withOutbox(async () => {
        await clearConversations();
        await chrome.storage.local.remove("conversationDestination");
        await chrome.storage.local.set({
          queue: [],
          capsules: [],
          activity: [],
        });
        await chrome.storage.local.remove([
          "pairToken",
          "appAppearance",
          "appearanceSyncedAt",
        ]);
        return { ok: true };
      });
    case "ob-clear-queue":
      return withOutbox(async () => {
        await clearConversations();
        await chrome.storage.local.set({ queue: [] });
        return { ok: true };
      });
    default:
      throw Error("Unknown extension action.");
  }
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== "string")
    return;
  dispatch(msg, sender)
    .then(respond)
    .catch((error) =>
      respond({
        ok: false,
        error: error.message || "The browser refused this action.",
      }),
    );
  return true;
});
async function refreshBroadScript() {
  const id = "oddbrain-optional-pages";
  const granted = await chrome.permissions.contains({
    origins: ["<all_urls>"],
  });
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [id],
  });
  if (!granted && registered.length)
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  if (granted && registered.length) {
    const desired = [
      ...chrome.runtime.getManifest().content_scripts[0].matches,
      ...OddConversations.sites
        .filter((s) => s.kind !== "ai")
        .flatMap((s) => s.hosts.map((h) => "https://" + h + "/*")),
      "http://127.0.0.1/*",
      "http://localhost/*",
    ];
    if (
      JSON.stringify(registered[0].excludeMatches) !== JSON.stringify(desired)
    ) {
      await chrome.scripting.unregisterContentScripts({ ids: [id] });
      registered.length = 0;
    }
  }
  if (granted && !registered.length)
    await chrome.scripting.registerContentScripts([
      {
        id,
        matches: ["http://*/*", "https://*/*"],
        excludeMatches: [
          ...chrome.runtime.getManifest().content_scripts[0].matches,
          ...OddConversations.sites
            .filter((s) => s.kind !== "ai")
            .flatMap((s) => s.hosts.map((h) => "https://" + h + "/*")),
          "http://127.0.0.1/*",
          "http://localhost/*",
        ],
        js: [
          "lib/page-extract.js",
          "lib/blacklist.js",
          "lib/vault-writer.js",
          "content-scripts/generic-capture.js",
          "lib/appearance.js",
          "content-scripts/companion.js",
        ],
        runAt: "document_idle",
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
}
chrome.runtime.onInstalled.addListener(async () => {
  await refreshBroadScript();
  await refreshConversationScripts();
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "collect-now",
    title: "Save page with OddBrain",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "save-selection",
    title: "Save selected text with OddBrain",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "capture-structure",
    title: "Save page structure with OddBrain",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "never-check",
    title: "Never check this site",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "open-panel",
    title: "Open OddBrain side panel",
    contexts: ["action"],
  });
  await chrome.alarms.create("oddbrain-sync", { periodInMinutes: 1 });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // sidePanel.open must run synchronously in the user gesture, before any await.
  if (info.menuItemId === "open-panel" && tab?.windowId) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  void (async () => {
    if (tab?.incognito) return;
    if (info.menuItemId === "never-check") {
      const patterns = await currentPatterns();
      await changeBlacklist([
        ...new Set([...patterns, new URL(tab.url).hostname + "/*"]),
      ]);
      return;
    }
    const mode =
      info.menuItemId === "save-selection"
        ? "selection"
        : info.menuItemId === "capture-structure"
          ? "structure"
          : "page";
    const result = await preview(mode);
    if (result.ok)
      await capture(
        {
          type: result.type,
          url: result.url,
          title: result.title,
          content: result.content,
          tree: result.tree,
          nodes: result.nodes,
          depth: result.depth,
          completeness: result.completeness,
        },
        { id: chrome.runtime.id },
      );
    else
      await recordActivity({
        type: "wasnt_accessible",
        url: tab?.url,
        reason: result.error,
        captured_at: new Date().toISOString(),
      });
  })().catch((error) =>
    recordActivity({
      type: "wasnt_accessible",
      reason: error.message,
      captured_at: new Date().toISOString(),
    }),
  );
});
// Upgrades revoke the obsolete grant without touching saved visit records.
async function revokeLegacyHistory() {
  try {
    await chrome.permissions.remove({ permissions: ["history"] });
  } catch {
    /* Not granted or no longer declared. No history API is registered. */
  }
}
void revokeLegacyHistory();
chrome.permissions.onAdded.addListener(() => {
  void refreshBroadScript().catch(() => {});
  void refreshConversationScripts().catch(() => {});
});
chrome.permissions.onRemoved.addListener(() => {
  interruptConversations();
  void pruneConversations().catch(() => {});
  void refreshBroadScript().catch(() => {});
  void refreshConversationScripts().catch(() => {});
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "oddbrain-sync")
    void (async () => {
      const status = await synchronize();
      await flushConversations();
      if (status.ok) await flushQueue();
    })().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  void flushConversations().catch(() => {});
  void refreshBroadScript().catch(() => {});
  void refreshConversationScripts().catch(() => {});
  void chrome.alarms.create("oddbrain-sync", { periodInMinutes: 1 });
});

if (chrome.storage.onChanged)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      [
        "conversationPaused",
        "autoCaptureAi",
        "conversationSites",
        "pairToken",
        "appPort",
        "blacklistPending",
      ].some((key) => changes[key])
    ) {
      interruptConversations();
      void withOutbox(() => pruneConversations()).catch(() => {});
    }
    if (area === "local" && changes.conversationSites)
      void refreshConversationScripts().catch(() => {});
  });
if (chrome.tabs.onRemoved)
  chrome.tabs.onRemoved.addListener((id) => {
    void chrome.storage.session?.remove("conversationProgress:" + id);
  });
