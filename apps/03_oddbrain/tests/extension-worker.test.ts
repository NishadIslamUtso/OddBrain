import { IDBFactory } from "fake-indexeddb";
import { createHash, webcrypto } from "node:crypto";
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
  let rotateOnPost = false
  let captures = true,
    offline = false,
    loseAcknowledgement = false,
    legacy = false;
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
  const indexedDB = new IDBFactory();
  let context: any;
  function boot() {
    context = vm.createContext({
      indexedDB,
      crypto: webcrypto,
      console,
      URL,
      AbortSignal,
      AbortController,
      TextEncoder,
      setTimeout,
      clearTimeout,
      structuredClone,
      fetch: async (url: string, options: any) => {
        calls.push(url);
        if (offline) throw Error("offline");
        if (rotateOnPost && url.endsWith('/conversation-sync')) { rotateOnPost = false; app.setPairToken('r'.repeat(48)) }
        const response = await fetch(url, {
          ...options,
          headers: { ...options?.headers, origin: "chrome-extension://test" },
        });
        if (
          loseAcknowledgement &&
          options?.body &&
          JSON.parse(options.body).op === "messages"
        ) {
          loseAcknowledgement = false;
          throw Error("Response lost after commit");
        }
        if (legacy && url.endsWith("/health")) {
          const data = await response.json();
          delete data.capture_target;
          return new Response(JSON.stringify(data), {
            status: response.status,
          });
        }
        return response;
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
  }
  boot();
  return {
    local,
    rotateOnPost: () => { rotateOnPost = true },
    // Seed the exact previous IndexedDB v1 row/body schema, including its old
    // credential-bound ID, without calling the new enqueue implementation.
    seedLegacy: async (payload: any, override?: string) => {
      await vm.runInContext("conversationOutbox.list()", context)
      const sha = (v: string) => createHash('sha256').update(v).digest('hex')
      const target = override || sha(app.pairToken + '\n' + vault.root + '\n' + vault.files().read('.oddbrain/capture-destination').trim())
      const identity = sha(app.url + '\n' + app.pairToken), body = JSON.stringify({...payload,capture_target:target}), id = sha(identity + '\n' + body)
      await new Promise<void>((yes,no) => {
        const open = indexedDB.open('oddbrain-conversation-outbox',1)
        open.onerror = () => no(open.error)
        open.onsuccess = () => {
          const db=open.result,tx=db.transaction(['rows','bodies','meta'],'readwrite'), meta=tx.objectStore('meta'), tally=meta.get('tally')
          tally.onsuccess=()=>{
            const old=tally.result || {bytes:0,count:0,sequence:0},bytes=Buffer.byteLength(body)
            tx.objectStore('rows').add({id,identity,target,conversation:payload.conversation.key,title:payload.conversation.title,url:payload.url,op:payload.op,attachment:payload.attachment_id||'',hash:payload.hash||'',bytes,sequence:old.sequence+1,at:Date.now(),problem:''})
            tx.objectStore('bodies').add({id,body}); meta.put({bytes:old.bytes+bytes,count:old.count+1,sequence:old.sequence+1},'tally')
          }
          tx.oncomplete=()=>{db.close();yes()};tx.onabort=()=>{db.close();no(tx.error)}
        }
      })
      return {id,target}
    },
    restart: async () => {
      await context.flushConversations();
      await vm.runInContext("conversationOutbox.close()", context);
      boot();
    },
    drain: () => context.flushConversations(),
    queued: () => vm.runInContext("conversationOutbox.list()", context),
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
    setLegacy: (value: boolean) => {
      legacy = value;
    },
    loseAck: () => {
      loseAcknowledgement = true;
    },
    setOffline: (v: boolean) => {
      offline = v;
    },
    setCaptures: (v: boolean) => {
      captures = v;
    },
    dispatch: async (msg: any, sender: any = { id: "test" }) =>
      context.dispatch(msg, sender),
    dispose: async () => {
      await context.flushConversations();
      await vm.runInContext("conversationOutbox.close()", context);
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
      expect(result.queued).toBe(true);
      await h.drain();
      expect(
        (
          await h.dispatch(
            {
              type: "ob-conversation-sync",
              payload: {
                url,
                conversation,
                op: "delivery",
                receipts: [result.receipt],
              },
            },
            sender,
          )
        ).saved,
      ).toBe(1);
      const again = await h.dispatch(
        { type: "ob-conversation-sync", payload },
        sender,
      );
      await h.drain();
      expect(
        (
          await h.dispatch(
            {
              type: "ob-conversation-sync",
              payload: {
                url,
                conversation,
                op: "delivery",
                receipts: [again.receipt],
              },
            },
            sender,
          )
        ).saved,
      ).toBe(1);
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
      await h.dispatch({ type: "ob-sync" });
      await expect(
        h.dispatch({ type: "ob-conversation-sync", payload }, sender),
      ).rejects.toThrow("Enable browser capture");
      h.setCaptures(true);
      await h.dispatch({ type: "ob-sync" });
      h.setOffline(true);
      const offline = await h.dispatch(
        { type: "ob-conversation-sync", payload },
        sender,
      );
      expect(offline.ok).toBe(true);
      expect(offline.queued).toBe(true);
      await h.drain();
      expect(await h.queued()).toHaveLength(1);
      await h.restart();
      expect(await h.queued()).toHaveLength(1);
      h.setOffline(false);
      await h.drain();
      expect(await h.queued()).toHaveLength(0);
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
  it("refuses captures past the outbox cap (200) instead of growing without bound, and recovers", async () => {
    const h = await harness();
    try {
      h.setOffline(true);
      for (let i = 0; i < 200; i++) {
        const r = await h.dispatch({
          type: "ob-capture",
          payload: { ...page, title: "Page " + i, url: page.url + "/" + i },
        });
        expect(r.queued).toBe(true);
      }
      expect(h.local.queue).toHaveLength(200);
      // One past the cap: refused out loud — queued:false with a reason the
      // person can read — and the queue does not grow. chrome.storage.local
      // is a bounded jar; silently overflowing it would lose captures.
      const over = await h.dispatch({
        type: "ob-capture",
        payload: { ...page, title: "One past the cap", url: page.url + "/over" },
      });
      expect(over).toMatchObject({ ok: false, queued: false });
      expect(String(over.error)).toContain("Outbox full");
      expect(h.local.queue).toHaveLength(200);
      // The cap does not wedge the outbox: online again, everything drains.
      // The flush is deliberately budgeted (20 delivered per call, to keep
      // the handler responsive), so drain it until it is empty.
      h.setOffline(false);
      for (let i = 0; i < 12 && h.local.queue.length > 0; i++) {
        await h.dispatch({ type: "ob-flush" });
      }
      expect(h.local.queue).toHaveLength(0);
      expect(
        h.local.activity.filter((e: any) => e.success).length,
      ).toBeGreaterThan(0);
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

const queuedUrl = "https://chatgpt.com/c/durable";
const queuedConversation = {
  provider: "ChatGPT",
  adapter: "chatgpt",
  key: "chatgpt:durable",
  url: queuedUrl,
  title: "Durability fixture",
};
const queuedSender = {
  id: "test",
  frameId: 0,
  url: queuedUrl,
  tab: { id: 3, url: queuedUrl, incognito: false },
};
const queuedMessage = {
  id: "msg",
  role: "user",
  speaker: "",
  text: "DURABLE_PRIVATE_TEXT",
  timestamp: "",
  reply_to: "",
  model: "",
  identity: "native",
  status: "observed",
  attachments: [],
};
const queuedPayload = {
  url: queuedUrl,
  conversation: queuedConversation,
  op: "messages",
  messages: [queuedMessage],
  order: ["msg"],
};
async function offlineQueue(h: Awaited<ReturnType<typeof harness>>) {
  await h.dispatch({ type: "ob-sync" });
  h.setOffline(true);
  const receipt = await h.dispatch(
    { type: "ob-conversation-sync", payload: queuedPayload },
    queuedSender,
  );
  await h.drain();
  return receipt;
}
it("durable replay survives a lost acknowledgement without a second immutable message revision", async () => {
  const h = await harness();
  try {
    await offlineQueue(h);
    const delayed = await h.queued()
    expect(delayed[0].attempts).toBeGreaterThan(0)
    expect(delayed[0].retryAt).toBeGreaterThan(delayed[0].lastAttempt)
    expect(delayed[0].retryReason).toMatch(/unavailable|connection|confirm/i)
    h.setOffline(false);
    h.loseAck();
    await h.drain();
    expect(await h.queued()).toHaveLength(1);
    const files = h.vault.files(),
      before = files.walkFiles(
        "02 Sources/Conversations/Browser",
        ".json",
      ).files;
    await h.restart();
    await h.drain();
    expect(await h.queued()).toHaveLength(0);
    expect(
      files.walkFiles("02 Sources/Conversations/Browser", ".json").files,
    ).toEqual(before);
    expect(JSON.stringify(h.local.activity)).not.toContain(queuedMessage.text);
  } finally {
    await h.dispose();
  }
});
it("pause retains bytes, exclusion removes them, and a page cannot inspect or discard the outbox", async () => {
  const h = await harness();
  try {
    await offlineQueue(h);
    h.local.conversationPaused = true;
    h.setOffline(false);
    await h.drain();
    expect(await h.queued()).toHaveLength(1);
    expect(
      h.vault.files().walkFiles("02 Sources/Conversations/Browser", ".json")
        .files,
    ).toHaveLength(0);
    for (const type of [
      "ob-conversation-outbox",
      "ob-conversation-discard",
      "ob-clear-queue",
    ])
      await expect(h.dispatch({ type }, queuedSender)).rejects.toThrow(
        "extension interface",
      );
    await h.dispatch({
      type: "ob-blacklist-update",
      excluded_patterns: ["chatgpt.com/*"],
    });
    expect(await h.queued()).toHaveLength(0);
  } finally {
    await h.dispose();
  }
});
it("a refused pairing holds the bytes and sends them nowhere, and re-pairing finishes the save", async () => {
  const h = await harness();
  try {
    await offlineQueue(h);
    h.local.pairToken = "revoked";
    h.setOffline(false);
    await h.drain();
    const held = await h.queued();
    expect(held).toHaveLength(1);
    expect(held[0].problem).toContain("Enter the current token");
    expect(
      h.vault.files().walkFiles("02 Sources/Conversations/Browser", ".json")
        .files,
    ).toHaveLength(0);
    expect(JSON.stringify(h.local.activity)).not.toContain(queuedMessage.text);
    // Pasting the current token is all it takes; the queued bytes were never
    // addressed to the old token.
    h.local.pairToken = h.app.pairToken;
    await h.drain();
    expect(await h.queued()).toHaveLength(0);
    expect(
      h.vault.files().walkFiles("02 Sources/Conversations/Browser", ".json")
        .files.length,
    ).toBeGreaterThan(0);
  } finally {
    await h.dispose();
  }
});
it("rotating the pairing token does not orphan captures already waiting in the browser", async () => {
  const h = await harness();
  try {
    await offlineQueue(h);
    // The app's own Rotate action: a new token, the same vault.
    const rotated = "r".repeat(48);
    h.app.setPairToken(rotated);
    h.local.pairToken = rotated;
    h.setOffline(false);
    await h.drain();
    expect(await h.queued()).toHaveLength(0);
    expect(
      h.vault.files().walkFiles("02 Sources/Conversations/Browser", ".json")
        .files.length,
    ).toBeGreaterThan(0);
  } finally {
    await h.dispose();
  }
});
it("a new vault identity holds queued conversations and the server rejects their old target", async () => {
  const h = await harness();
  try {
    await offlineQueue(h);
    const oldTarget = h.local.conversationDestination.target;
    h.vault.files().write(".oddbrain/capture-destination", "c".repeat(64));
    h.setOffline(false);
    await h.drain();
    expect((await h.queued())[0].problem).toContain("Different vault");
    const result = await fetch(h.app.url + "/conversation-sync", {
      method: "POST",
      headers: {
        origin: "chrome-extension://test",
        "content-type": "application/json",
        "x-oddbrain-pair": h.app.pairToken,
      },
      body: JSON.stringify({ ...queuedPayload, capture_target: oldTarget }),
    });
    expect(result.status).toBe(409);
    expect(
      h.vault.files().walkFiles("02 Sources/Conversations/Browser", ".json")
        .files,
    ).toHaveLength(0);
    const summary = await h.dispatch({ type: "ob-conversation-outbox" });
    expect(JSON.stringify(summary)).not.toContain(queuedMessage.text);
    await h.dispatch({
      type: "ob-conversation-discard",
      id: summary.conversations[0].id,
    });
    expect(await h.queued()).toHaveLength(0);
  } finally {
    await h.dispose();
  }
});
it("completed attachment bytes replay from the queue with no source tab or remote fetch", async () => {
  const h = await harness();
  try {
    await h.dispatch({ type: "ob-sync" });
    h.setOffline(true);
    const attachment = {
      id: "file",
      kind: "file",
      name: "note.txt",
      url: "https://chatgpt.com/file",
      mime: "text/plain",
      representation: "original",
    };
    const message = { ...queuedMessage, attachments: [attachment] };
    const bytes = Buffer.from("DURABLE FILE");
    const hash = await webcrypto.subtle
      .digest("SHA-256", bytes)
      .then((data) => Buffer.from(data).toString("hex"));
    await h.dispatch(
      {
        type: "ob-conversation-sync",
        payload: { ...queuedPayload, messages: [message] },
      },
      queuedSender,
    );
    const common = {
      url: queuedUrl,
      conversation: queuedConversation,
      message_id: "msg",
      attachment_id: "file",
    };
    await h.dispatch(
      {
        type: "ob-conversation-sync",
        payload: {
          ...common,
          op: "media-part",
          index: 0,
          hash,
          data: bytes.toString("base64"),
        },
      },
      queuedSender,
    );
    expect(
      (await h.dispatch({ type: "ob-conversation-outbox" })).conversations[0]
        .incomplete,
    ).toBe(true);
    const finish = await h.dispatch(
      {
        type: "ob-conversation-sync",
        payload: {
          ...common,
          op: "media-finish",
          mime: "text/plain",
          size: bytes.length,
          parts: [hash],
        },
      },
      queuedSender,
    );
    expect(
      (await h.dispatch({ type: "ob-conversation-outbox" })).conversations[0]
        .incomplete,
    ).toBe(false);
    await h.restart();
    expect(await h.queued()).toHaveLength(3);
    h.setOffline(false);
    await h.drain();
    expect(await h.queued()).toHaveLength(0);
    const result = await h.dispatch(
      {
        type: "ob-conversation-sync",
        payload: { ...common, op: "media-state" },
      },
      queuedSender,
    );
    expect(result.saved.bytes).toBe(bytes.length);
    expect(h.vault.files().read(result.saved.source)).toBe("DURABLE FILE");
    expect(h.calls.every((url) => url.startsWith(h.app.url))).toBe(true);
    expect(
      (
        await h.dispatch(
          {
            type: "ob-conversation-sync",
            payload: { ...common, op: "delivery", receipts: [finish.receipt] },
          },
          queuedSender,
        )
      ).saved,
    ).toBe(1);
  } finally {
    await h.dispose();
  }
});

it("an older desktop cannot silently receive queued writes without the destination guard", async () => {
  const h = await harness();
  try {
    await offlineQueue(h);
    h.setLegacy(true);
    h.setOffline(false);
    await h.drain();
    expect((await h.queued())[0].problem).toContain("Update OddBrain");
    expect(
      h.vault.files().walkFiles("02 Sources/Conversations/Browser", ".json")
        .files,
    ).toHaveLength(0);
    h.setLegacy(false);
    await h.drain();
    expect(await h.queued()).toHaveLength(0);
  } finally {
    await h.dispose();
  }
});

it('the actual pairing action holds the queue, including a token refused during a POST', async () => {
  const h=await harness()
  try {
    await offlineQueue(h); h.setOffline(false); h.rotateOnPost(); await h.drain()
    expect(await h.queued()).toHaveLength(1); expect((await h.queued())[0].problem).toContain('Enter the current token')
    const paired=await h.dispatch({type:'ob-pair',token:h.app.pairToken,port:h.app.port,confirmChange:true})
    expect(paired.ok).toBe(true); expect(await h.queued()).toHaveLength(1)
    await h.drain(); expect(await h.queued()).toHaveLength(0)
  } finally {await h.dispose()}
})
it('legacy message and attachment rows survive restart and real re-pairing with their old receipts', async () => {
  const h=await harness()
  try {
    h.setOffline(true)
    const attachment={id:'file',kind:'file',name:'legacy.txt',url:'https://chatgpt.com/file',mime:'text/plain',representation:'original'}
    const bytes=Buffer.from('LEGACY ATTACHMENT'),hash=createHash('sha256').update(bytes).digest('hex')
    const common={url:queuedUrl,conversation:queuedConversation,message_id:'msg',attachment_id:'file'}
    const receipts=[]
    receipts.push(await h.seedLegacy({...queuedPayload,messages:[{...queuedMessage,attachments:[attachment]}]}))
    receipts.push(await h.seedLegacy({...common,op:'media-part',index:0,hash,data:bytes.toString('base64')}))
    receipts.push(await h.seedLegacy({...common,op:'media-finish',mime:'text/plain',size:bytes.length,parts:[hash]}))
    await h.restart(); expect(await h.queued()).toHaveLength(3)
    h.app.setPairToken('n'.repeat(48)); await h.dispatch({type:'ob-pair',token:h.app.pairToken,port:h.app.port,confirmChange:true})
    h.setOffline(false); await h.drain(); expect(await h.queued()).toHaveLength(0)
    const result=await h.dispatch({type:'ob-conversation-sync',payload:{...common,op:'media-state'}},queuedSender)
    expect(h.vault.files().read(result.saved.source)).toBe('LEGACY ATTACHMENT')
    const delivery=await h.dispatch({type:'ob-conversation-sync',payload:{...queuedPayload,op:'delivery',receipts:receipts.map(r=>r.id)}},queuedSender)
    expect(delivery.saved).toBe(3)
    expect(h.calls.every(url=>url.startsWith(h.app.url))).toBe(true)
  } finally {await h.dispose()}
})
it('research reads current saved originals only after an explicit, non-excluded request and never substitutes a cache offline', async () => {
  const h=await harness()
  try {
    h.vault.files().writeAtomic('Notes/research.md','A cobalt windmill needs a direct saved-source citation.')
    const sender={id:'test',tab:{id:1,url:'https://example.com/article'}}
    const result=await h.dispatch({type:'ob-research',query:'cobalt windmill'},sender)
    expect(result.ok).toBe(true); expect(result.packet).toContain('[S1]'); expect(result.sources[0].excerpt).toContain('cobalt windmill')
    await h.dispatch({type:'ob-blacklist-update',excluded_patterns:['example.com/*']}); const before=h.calls.filter(url=>url.includes('/research?')).length
    const excluded=await h.dispatch({type:'ob-research',query:'cobalt windmill'},sender)
    expect(excluded.ok).toBe(false); expect(excluded.error).toContain('excluded'); expect(h.calls.filter(url=>url.includes('/research?'))).toHaveLength(before)
    const popupExcluded=await h.dispatch({type:'ob-research',query:'cobalt windmill'}); expect(popupExcluded.ok).toBe(false); expect(popupExcluded.error).toMatch(/excluded|Never-check/i)
    await h.dispatch({type:'ob-blacklist-update',excluded_patterns:[]}); h.setOffline(true)
    const offline=await h.dispatch({type:'ob-research',query:'cobalt windmill'},sender)
    expect(offline.ok).toBe(false); expect(offline.offline).toBe(true); expect(offline.error).toContain('No cached packet')
  } finally {await h.dispose()}
})
it('unknown legacy addresses stay held, and returning to the original vault releases only its own queue', async () => {
  const h=await harness()
  try {
    await offlineQueue(h); await h.seedLegacy(queuedPayload,'e'.repeat(64))
    const original=h.vault.files().read('.oddbrain/capture-destination')
    h.vault.files().writeAtomic('.oddbrain/capture-destination','f'.repeat(64))
    h.setOffline(false); await h.drain(); expect(await h.queued()).toHaveLength(2)
    h.vault.files().writeAtomic('.oddbrain/capture-destination',original)
    await h.drain(); const held=await h.queued(); expect(held).toHaveLength(1)
    expect(held[0].target).toBe('e'.repeat(64)); expect(held[0].problem).toContain('Different vault')
  } finally {await h.dispose()}
})
