/* Preview-only browser API fixture. Not referenced by the extension manifest. */
(() => {
  const callbacks = [];
  const fire = (changes, area = "local") =>
    callbacks.forEach((fn) => fn(changes, area));
  const local = {
    pairToken: "preview-only-not-a-real-token",
    appPort: 8765,
    queue: [],
    activity: [],
    capsules: [
      {
        id: "capsule-reading",
        title: "A small reading room",
        version: 2,
        background:
          "Keep a table for unfinished notes, a shelf for books in progress, and a clear path to the window.",
        goals: ["Make it easy to come back to a book"],
        constraints: ["Use the furniture already in the room"],
        sources: ["https://fieldnotes.example/a-small-reading-room"],
        updated: "2026-10-18T10:00:00Z",
      },
      {
        id: "capsule-workshop",
        title: "The weekend workshop",
        version: 1,
        background:
          "Six people, a shared table, and a repair list. Start with the lamp, then the loose shelves.",
        goals: ["Repair before replacing"],
        constraints: ["Finish before Sunday evening"],
        sources: ["https://fieldnotes.example/weekend-workshop"],
        updated: "2026-10-17T10:00:00Z",
      },
      {
        id: "capsule-website",
        title: "Notes for a smaller website",
        version: 1,
        background:
          "Write the useful information first. Keep navigation visible. Let the page load without a wall of scripts.",
        goals: ["Build a clear, readable website"],
        constraints: ["No account needed to read"],
        sources: [],
        updated: "2026-10-16T10:00:00Z",
      },
    ],
  };
  const sync = { excluded_patterns: ["bank.com/*"] },
    permissions = new Set();
  const storage = (data, area) => ({
    get: async (defaults) => {
      const keys =
        typeof defaults === "string"
          ? [defaults]
          : Array.isArray(defaults)
            ? defaults
            : Object.keys(defaults || data);
      return Object.fromEntries(
        keys.map((k) => [
          k,
          data[k] ??
            (typeof defaults === "object" && !Array.isArray(defaults)
              ? defaults[k]
              : undefined),
        ]),
      );
    },
    set: async (values) => {
      const changes = {};
      for (const [k, v] of Object.entries(values)) {
        changes[k] = { oldValue: data[k], newValue: v };
        data[k] = v;
      }
      fire(changes, area);
    },
    remove: async (keys) => {
      const changes = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        changes[k] = { oldValue: data[k] };
        delete data[k];
      }
      fire(changes, area);
    },
  });
  const tab = {
    id: 1,
    windowId: 1,
    url: "https://fieldnotes.example/a-small-reading-room",
    title: "A small reading room, with room to think.",
  };
  const capture = {
    ok: true,
    ...tab,
    content:
      "At the back of the library, six chairs face a long window. There is a shelf for books people are still reading, a table for unfinished notes, and a lamp someone remembered to repair.\n\nA good reading room makes it easy to return. Keep the tools within reach. Leave enough space for an open notebook. Put the books back where the next person will look.",
    completeness: "Preview sample excerpt",
    type: "web_page",
  };
  window.chrome = {
    runtime: {
      id: "preview",
      sendMessage: async (msg) => {
        switch (msg.type) {
          case "ob-conversation-outbox":
            return { ok: true, count: 0, bytes: 0, conversations: [] };
          case "ob-conversation-settings":
            return { ok: true };
          case "ob-conversation-status":
            return {
              ok: true,
              status: local.previewConversationStatus || null,
            };
          case "ob-sync":
            return { ok: true, captures: true, available: true, preview: true };
          case "ob-preview":
            return {
              ...capture,
              ...(msg.mode === "selection"
                ? {
                    content: "Leave a little room for the next thought.",
                    completeness: "Sample selection",
                  }
                : msg.mode === "structure"
                  ? {
                      type: "a11y_tree",
                      content:
                        "heading: A small reading room\nheading: Keep the useful bit",
                      tree: "heading: A small reading room\nheading: Keep the useful bit",
                      nodes: 2,
                      depth: 1,
                    }
                  : {}),
            };
          case "ob-library":
            return { ok: true, capsules: local.capsules };
          case "ob-capture": {
            const p = msg.payload;
            if (p.type === "capsule")
              local.capsules = [
                ...local.capsules.filter((c) => c.id !== p.capsule.id),
                p.capsule,
              ];
            local.activity.push({
              title: p.title,
              type: p.type,
              success: true,
              reason: "Simulated preview save; no vault files changed",
              captured_at: new Date().toISOString(),
            });
            return { ok: true };
          }
          case "ob-insert":
            return {
              ok: false,
              error:
                "Insertion needs an installed extension. This preview cannot read or edit your browser tabs.",
            };
          case "ob-blacklist-get":
            return { relay: sync.excluded_patterns };
          case "ob-blacklist-update":
            sync.excluded_patterns = msg.excluded_patterns;
            return { ok: true };
          case "ob-clear-queue":
            await chrome.storage.local.set({ queue: [] });
            return { ok: true };
          case "ob-flush":
            return { ok: true };
          case "ob-pair":
            return {
              ok: false,
              error:
                "This is the UI preview. Pair the installed extension instead.",
            };
          case "ob-forget":
            await chrome.storage.local.remove([
              "pairToken",
              "capsules",
              "appAppearance",
            ]);
            return { ok: true };
          default:
            return {
              ok: false,
              error: "This action needs the installed extension.",
            };
        }
      },
    },
    storage: {
      local: storage(local, "local"),
      sync: storage(sync, "sync"),
      onChanged: { addListener: (fn) => callbacks.push(fn) },
    },
    tabs: { query: async () => [tab], onActivated: { addListener: () => {} } },
    windows: { getCurrent: async () => ({ id: 1 }) },
    permissions: {
      contains: async (query) => permissions.has(JSON.stringify(query)),
      request: async (query) => {
        permissions.add(JSON.stringify(query));
        return true;
      },
      remove: async (query) => {
        permissions.delete(JSON.stringify(query));
        return true;
      },
    },
  };
  window.__preview = { local, sync, fire };
  window.addEventListener("message", async (e) => {
    if (
      e.origin !== location.origin ||
      e.source !== parent ||
      e.data?.type !== "preview-appearance"
    )
      return;
    await chrome.storage.local.set({ appAppearance: e.data.appearance });
  });
  parent.postMessage({ type: "preview-ready" }, location.origin);
})();
