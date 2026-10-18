import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { startExtensionApi } from "../src/main/extension/server";
import { createVaultService } from "../src/main/vault/service";
import { normalizeExtensionAppearance } from "../src/shared/lib/extensionAppearance";
const ext = fileURLToPath(new URL("../../../extension/", import.meta.url));
const event = () => ({ addListener: () => {}, hasListener: () => false });
async function harness() {
  const root = mkdtempSync(join(tmpdir(), "ob-worker-"));
  const vault = createVaultService({ vaultPath: root });
  const appearance = normalizeExtensionAppearance({
    version: 1,
    tokens: { "--color-bg": "#fafafa", "--color-ink": "#222222" },
  });
  let captures = true,
    offline = false;
  const app = await startExtensionApi({
    port: 0,
    vault,
    appearance: () => appearance,
    mayCapture: () => captures,
  });
  const local: Record<string, any> = {
    pairToken: app.pairToken,
    appPort: app.port,
    queue: [],
    activity: [],
  };
  const sync: Record<string, any> = { excluded_patterns: [] };
  const store = (data: Record<string, any>) => ({
    get: async (defaults: any) => {
      const keys =
        typeof defaults === "string"
          ? [defaults]
          : Array.isArray(defaults)
            ? defaults
            : Object.keys(defaults || data);
      return structuredClone(
        Object.fromEntries(
          keys.map((k: string) => [
            k,
            data[k] ?? (typeof defaults === "object" ? defaults[k] : undefined),
          ]),
        ),
      );
    },
    set: async (values: any) => {
      Object.assign(data, structuredClone(values));
    },
    remove: async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  });
  let broadGranted = false;
  let registered: any[] = [];
  const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
  const calls: string[] = [];
  const context: any = vm.createContext({
    console,
    URL,
    AbortSignal,
    TextEncoder,
    setTimeout,
    clearTimeout,
    structuredClone,
    fetch: async (url: string, options: any) => {
      calls.push(url);
      if (offline) throw Error("offline");
      return fetch(url, {
        ...options,
        headers: { ...options?.headers, origin: "chrome-extension://test" },
      });
    },
    chrome: {
      runtime: {
        id: "test",
        getManifest: () => manifest,
        onMessage: event(),
        onInstalled: event(),
        onStartup: event(),
        sendMessage: async () => undefined,
      },
      storage: { local: store(local), sync: store(sync) },
      contextMenus: { onClicked: event() },
      history: { onVisited: event() },
      alarms: { onAlarm: event() },
      permissions: {
        onAdded: event(),
        onRemoved: event(),
        contains: async (request: any) => {
          if (request.origins?.includes("<all_urls>")) return broadGranted;
          return (
            broadGranted ||
            request.origins?.every((origin: string) =>
              manifest.host_permissions.includes(origin),
            )
          );
        },
      },
      scripting: {
        getRegisteredContentScripts: async (filter: any) =>
          registered.filter((s) => !filter?.ids || filter.ids.includes(s.id)),
        registerContentScripts: async (scripts: any[]) => {
          registered.push(...scripts);
        },
        unregisterContentScripts: async (filter: any) => {
          registered = registered.filter((s) => !filter.ids.includes(s.id));
        },
      },
      tabs: {
        query: async () => [{ id: 1, url: "https://example.com/article" }],
      },
    },
  });
  context.importScripts = (...files: string[]) => {
    for (const file of files)
      vm.runInContext(readFileSync(join(ext, file), "utf8"), context, {
        filename: file,
      });
  };
  vm.runInContext(readFileSync(join(ext, "background.js"), "utf8"), context);
  return {
    local,
    sync,
    calls,
    vault,
    app,
    manifest,
    registered: () => registered,
    setBroad: async (v: boolean) => {
      broadGranted = v;
      await context.refreshBroadScript();
    },
    refreshSites: async () => context.refreshConversationScripts(),
    setOffline: (v: boolean) => {
      offline = v;
    },
    setCaptures: (v: boolean) => {
      captures = v;
    },
    dispatch: async (msg: any, sender: any = { id: "test" }) =>
      context.dispatch(msg, sender),
    dispose: async () => {
      await app.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
const page = {
  type: "web_page",
  url: "https://example.com/article",
  title: "A real test page",
  content: "PRIVATE_CAPTURE_BODY",
  completeness: "test excerpt",
};
describe("extension worker against the real paired vault API", () => {
  it("relays incremental AI messages only from an enabled, paired, matching top-level site", async () => {
    const h = await harness();
    const url = "https://chatgpt.com/c/example";
    const sender = { id: "test", url, frameId: 0, tab: { id: 7, url } };
    const conversation = {
      provider: "ChatGPT",
      adapter: "chatgpt",
      key: "chatgpt:https://chatgpt.com:/c/example",
      title: "Actual chat",
      url,
    };
    const message = {
      id: "m",
      role: "user",
      speaker: "",
      text: "PRIVATE_INCREMENTAL_BODY",
      timestamp: "",
      reply_to: "",
      model: "",
      identity: "native",
      status: "observed",
      attachments: [],
    };
    const payload = {
      url,
      conversation,
      op: "messages",
      messages: [message],
      order: ["m"],
    };
    try {
      const result = await h.dispatch(
        { type: "ob-conversation-sync", payload },
        sender,
      );
      expect(result.ok).toBe(true);
      expect(result.changed).toBe(1);
      expect(
        (await h.dispatch({ type: "ob-conversation-sync", payload }, sender))
          .changed,
      ).toBe(0);
      expect(JSON.stringify(h.local)).not.toContain(message.text);
      expect(
        (
          await h.dispatch(
            { type: "ob-conversation-sync", payload },
            { ...sender, frameId: 2 },
          )
        ).ok,
      ).toBe(false);
      expect(
        (
          await h.dispatch(
            {
              type: "ob-conversation-sync",
              payload: { ...payload, url: "https://claude.ai/chat/other" },
            },
            sender,
          )
        ).ok,
      ).toBe(false);
      h.local.autoCaptureAi = false;
      expect(
        (await h.dispatch({ type: "ob-conversation-sync", payload }, sender))
          .ok,
      ).toBe(false);
      h.local.autoCaptureAi = true;
      h.setCaptures(false);
      expect(
        (await h.dispatch({ type: "ob-conversation-sync", payload }, sender))
          .ok,
      ).toBe(false);
      h.setCaptures(true);
      h.setOffline(true);
      const offline = await h.dispatch(
        { type: "ob-conversation-sync", payload },
        sender,
      );
      expect(offline.ok).toBe(false);
      expect(offline.error).toContain("Keep the conversation open");
      expect(h.local.queue).toHaveLength(0);
    } finally {
      await h.dispose();
    }
  });
  it("registers messaging readers only after opt-in and a matching grant; revocation blocks already-loaded readers", async () => {
    const h = await harness();
    const url = "https://www.instagram.com/direct/t/123";
    const sender = { id: "test", url, frameId: 0, tab: { id: 7, url } };
    try {
      expect(
        (await h.dispatch({ type: "ob-conversation-access", url }, sender))
          .allowed,
      ).toBe(false);
      h.local.conversationSites = { instagram: true };
      await h.refreshSites();
      expect(h.registered()).toHaveLength(0);
      await h.setBroad(true);
      await h.refreshSites();
      expect(
        h.registered().some((s) => s.id === "oddbrain-conversations-instagram"),
      ).toBe(true);
      expect(
        (await h.dispatch({ type: "ob-conversation-access", url }, sender))
          .allowed,
      ).toBe(true);
      await h.setBroad(false);
      expect(
        (await h.dispatch({ type: "ob-conversation-access", url }, sender))
          .allowed,
      ).toBe(false);
      await h.refreshSites();
      expect(h.registered()).toHaveLength(0);
    } finally {
      await h.dispose();
    }
  });

  it("removes an offline capsule cache entry if the app refuses its retry", async () => {
    const h = await harness();
    try {
      h.setOffline(true);
      const capsule = {
        id: "capsule-refused",
        title: "Pending",
        background: "PRIVATE_CAPTURE_BODY",
        version: 1,
      };
      expect(
        (
          await h.dispatch({
            type: "ob-capture",
            payload: { type: "capsule", capsule, url: page.url },
          })
        ).queued,
      ).toBe(true);
      expect(h.local.capsules).toHaveLength(1);
      h.setOffline(false);
      h.setCaptures(false);
      await h.dispatch({ type: "ob-flush" });
      expect(h.local.queue).toHaveLength(0);
      expect(h.local.capsules).toHaveLength(0);
      expect(JSON.stringify(h.local.activity)).not.toContain(
        "PRIVATE_CAPTURE_BODY",
      );
    } finally {
      await h.dispose();
    }
  });

  it("registers all-site scripts only while the optional permission is granted", async () => {
    const h = await harness();
    try {
      expect(
        h.manifest.content_scripts.some((script: any) =>
          script.matches.includes("<all_urls>"),
        ),
      ).toBe(false);
      await h.setBroad(false);
      expect(h.registered()).toEqual([]);
      await h.setBroad(true);
      expect(h.registered()).toHaveLength(1);
      expect(h.registered()[0].excludeMatches).toContain("https://claude.ai/*");
      expect(h.registered()[0].excludeMatches).toContain("http://127.0.0.1/*");
      await h.setBroad(false);
      expect(h.registered()).toEqual([]);
    } finally {
      await h.dispose();
    }
  });

  it("verifies pairing and synchronizes only sanitized appearance", async () => {
    const h = await harness();
    try {
      expect((await h.dispatch({ type: "ob-sync" })).ok).toBe(true);
      expect(h.local.appAppearance.tokens["--color-bg"]).toBe("#fafafa");
      expect(JSON.stringify(h.local.appAppearance)).not.toContain(
        h.app.pairToken,
      );
      h.local.pairToken = "wrong";
      expect((await h.dispatch({ type: "ob-sync" })).unpaired).toBe(true);
    } finally {
      await h.dispose();
    }
  });
  it("saves pages and the new structure format into actual vault files", async () => {
    const h = await harness();
    try {
      expect((await h.dispatch({ type: "ob-capture", payload: page })).ok).toBe(
        true,
      );
      expect(JSON.stringify(h.local.activity)).not.toContain(
        "PRIVATE_CAPTURE_BODY",
      );
      const tree = {
        ...page,
        type: "a11y_tree",
        tree: "heading: Sample\nlink: Next",
        nodes: 2,
        depth: 1,
      };
      expect((await h.dispatch({ type: "ob-capture", payload: tree })).ok).toBe(
        true,
      );
      expect(h.vault.onui().page).toMatchObject({
        format: "a11y-tree",
        content: tree.tree,
      });
    } finally {
      await h.dispose();
    }
  });
  it("queues concurrent offline captures once each, and retries without losing one", async () => {
    const h = await harness();
    try {
      h.setOffline(true);
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          h.dispatch({
            type: "ob-capture",
            payload: { ...page, title: "Page " + i, url: page.url + "/" + i },
          }),
        ),
      );
      expect(results.every((r) => r.queued)).toBe(true);
      expect(h.local.queue).toHaveLength(8);
      expect(JSON.stringify(h.local.activity)).not.toContain(
        "PRIVATE_CAPTURE_BODY",
      );
      h.setOffline(false);
      await h.dispatch({ type: "ob-flush" });
      expect(h.local.queue).toHaveLength(0);
      expect(h.local.activity.filter((e: any) => e.success)).toHaveLength(8);
    } finally {
      await h.dispose();
    }
  });
  it("never retries excluded captures, and keeps an offline exclusion edit", async () => {
    const h = await harness();
    try {
      h.setOffline(true);
      await h.dispatch({ type: "ob-capture", payload: page });
      await h.dispatch({
        type: "ob-blacklist-update",
        excluded_patterns: ["example.com/*"],
      });
      expect((await h.dispatch({ type: "ob-blacklist-get" })).relay).toEqual([
        "example.com/*",
      ]);
      h.setOffline(false);
      await h.dispatch({ type: "ob-flush" });
      expect(h.local.queue).toEqual([]);
      expect(h.vault.blacklist()).toContain("example.com/*");
      expect(h.vault.onui().page).toBeNull();
      expect((await h.dispatch({ type: "ob-capture", payload: page })).ok).toBe(
        false,
      );
    } finally {
      await h.dispose();
    }
  });
  it("does not cache a refused capsule or expose control messages to a page", async () => {
    const h = await harness();
    try {
      h.setCaptures(false);
      const result = await h.dispatch({
        type: "ob-capture",
        payload: {
          type: "capsule",
          capsule: {
            id: "capsule-test",
            title: "Secret",
            background: "PRIVATE_CAPTURE_BODY",
          },
        },
      });
      expect(result.ok).toBe(false);
      expect(h.local.capsules).toBeUndefined();
      expect(JSON.stringify(h.local.activity)).not.toContain(
        "PRIVATE_CAPTURE_BODY",
      );
      await expect(
        h.dispatch(
          { type: "ob-forget" },
          { id: "test", tab: { url: page.url } },
        ),
      ).rejects.toThrow("extension interface");
      await expect(
        h.dispatch(
          { type: "ob-capture", payload: page },
          { id: "test", tab: { url: page.url, incognito: true } },
        ),
      ).rejects.toThrow("private windows");
      await expect(
        h.dispatch(
          { type: "ob-capture", payload: page },
          { id: "test", tab: { url: "https://other.test" } },
        ),
      ).rejects.toThrow("address changed");
    } finally {
      await h.dispose();
    }
  });
  it("preserves capsule versions in the vault and separates pairing changes from old work", async () => {
    const h = await harness();
    try {
      const capsule = {
        id: "capsule-worker-test",
        title: "A plan",
        goals: ["Read"],
        background: "Version one",
        sources: [page.url],
        version: 1,
      };
      expect(
        (
          await h.dispatch({
            type: "ob-capture",
            payload: { type: "capsule", url: page.url, capsule },
          })
        ).ok,
      ).toBe(true);
      expect(
        (
          await h.dispatch({
            type: "ob-capture",
            payload: {
              type: "capsule",
              url: page.url,
              capsule: { ...capsule, background: "Version two", version: 2 },
            },
          })
        ).ok,
      ).toBe(true);
      expect(
        (await h.dispatch({ type: "ob-library" })).capsules[0].version,
      ).toBe(2);
      h.setOffline(true);
      await h.dispatch({ type: "ob-capture", payload: page });
      await expect(
        h.dispatch({ type: "ob-pair", token: "new", port: 8765 }),
      ).rejects.toThrow("Confirm");
      await h.dispatch({
        type: "ob-pair",
        token: "new",
        port: 8765,
        confirmChange: true,
      });
      expect(h.local.queue).toEqual([]);
      expect(h.local.capsules).toEqual([]);
      expect(h.local.pairToken).toBe("new");
      expect(h.vault.capsules()[0].version).toBe(2);
    } finally {
      await h.dispose();
    }
  });
});
