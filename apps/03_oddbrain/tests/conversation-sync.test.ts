import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { syncConversation } from "../src/main/vault/conversations";
import { createVaultService } from "../src/main/vault/service";
import { startExtensionApi } from "../src/main/extension/server";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
function setup() {
  const root = mkdtempSync(join(tmpdir(), "ob-conversations-"));
  roots.push(root);
  const service = createVaultService({ vaultPath: root });
  const conversation = {
    provider: "ChatGPT",
    adapter: "chatgpt",
    key: "chatgpt:https://chatgpt.com:/c/abc",
    url: "https://chatgpt.com/c/abc",
    title: "A useful conversation",
    title_source: "conversation-link",
  };
  const common = { url: conversation.url, conversation };
  const m = {
    id: "native-123",
    role: "user",
    speaker: "",
    text: "Hello",
    timestamp: "",
    reply_to: "",
    model: "",
    identity: "native",
    status: "observed",
    attachments: [] as any[],
  };
  const save = (messages = [m], extra = {}) =>
    service.conversationSync({
      ...common,
      op: "messages",
      messages,
      order: messages.map((m) => m.id),
      ...extra,
    }) as any;
  return { root, service, common, m, save };
}
describe("incremental conversation vault", () => {
  it("saves full long messages, deduplicates retries, updates a title and preserves raw edits", () => {
    const h = setup();
    h.m.text = "Long prompt\n" + "x".repeat(100_000);
    const first = h.save();
    expect(first.changed).toBe(1);
    expect(first.hashes[h.m.id]).toBe(hash(JSON.stringify(h.m)));
    expect(h.save().changed).toBe(0);
    expect(
      readFileSync(
        join(h.root, first.source, "messages", hash(h.m.id) + ".md"),
        "utf8",
      ),
    ).toContain(h.m.text);
    h.m.text = "An edited prompt";
    expect(h.save().changed).toBe(1);
    h.common.conversation.title = "Renamed without a new message";
    expect(h.save().changed).toBe(0);
    expect(
      readFileSync(join(h.root, first.source, "conversation.md"), "utf8"),
    ).toContain("Renamed without a new message");
    expect(readdirSync(join(h.root, first.source, "revisions"))).toHaveLength(
      2,
    );
    // Restart creates no dependence on an extension-side checkpoint.
    const fresh = createVaultService({ vaultPath: h.root });
    expect(
      (
        fresh.conversationSync({
          ...h.common,
          op: "state",
          ids: [h.m.id],
        }) as any
      ).hashes[h.m.id],
    ).toBe(hash(JSON.stringify(h.m)));
  });
  it("merges virtualized windows and preserves known revisions when a stale tab reconnects", () => {
    const h = setup();
    const msg = (id: string) => ({ ...h.m, id, text: id });
    const first = h.save([msg("c"), msg("d")]);
    h.save([msg("a"), msg("b"), msg("c")]);
    h.save([msg("d"), msg("e")]);
    const index = JSON.parse(
      readFileSync(join(h.root, first.source, "conversation.json"), "utf8"),
    );
    expect(index.message_ids).toEqual(["a", "b", "c", "d", "e"]);
    expect(
      readFileSync(join(h.root, first.source, "conversation.md"), "utf8"),
    ).toContain("Message 5");
    h.save([{ ...msg("c"), text: "edited" }]);
    expect(h.save([msg("c")]).changed).toBe(0);
    const state = h.service.conversationSync({
      ...h.common,
      op: "state",
      ids: ["c"],
      checksums: { c: hash(JSON.stringify(msg("c"))) },
    }) as any;
    expect(state.seen.c).toBe(hash(JSON.stringify(msg("c"))));
    expect(state.hashes.c).not.toBe(state.seen.c);
    expect(
      JSON.parse(
        readFileSync(
          join(h.root, first.source, "messages", hash("c") + ".json"),
          "utf8",
        ),
      ).message.text,
    ).toBe("edited");
  });
  it("recovers a crash between immutable revision and current checkpoint without a false receipt", () => {
    const h = setup();
    h.save();
    h.m.text = "Edited after first observation";
    const payload = {
      ...h.common,
      op: "messages",
      messages: [h.m],
      order: [h.m.id],
    };
    const files = h.service.files();
    const broken = {
      ...files,
      writeAtomic(path: string, content: string) {
        if (path.endsWith("/messages/" + hash(h.m.id) + ".json"))
          throw Error("simulated disk failure");
        files.writeAtomic(path, content);
      },
    };
    expect(() =>
      syncConversation(broken, payload, new Date().toISOString()),
    ).toThrow("simulated disk failure");
    const checksum = hash(JSON.stringify(h.m));
    const state = h.service.conversationSync({
      ...h.common,
      op: "state",
      ids: [h.m.id],
      checksums: { [h.m.id]: checksum },
    }) as any;
    expect(state.seen[h.m.id]).toBeUndefined();
    expect(state.hashes[h.m.id]).not.toBe(checksum);
    expect(h.save().changed).toBe(1);
    expect(
      (
        h.service.conversationSync({
          ...h.common,
          op: "state",
          ids: [h.m.id],
        }) as any
      ).hashes[h.m.id],
    ).toBe(checksum);
  });
  it("keeps different conversations and speakers separate, and never invents source timestamps", () => {
    const h = setup();
    const first = h.save();
    const other = h.save([h.m], {
      conversation: { ...h.common.conversation, key: "another" },
    });
    expect(first.source).not.toBe(other.source);
    const stored = JSON.parse(
      readFileSync(
        join(h.root, first.source, "messages", hash(h.m.id) + ".json"),
        "utf8",
      ),
    );
    expect(stored.message.timestamp).toBe("");
    expect(stored.observed_at).toBeTruthy();
    h.save([
      { ...h.m, id: "other", role: "assistant", model: "Visible model name" },
    ]);
    expect(
      readdirSync(join(h.root, first.source, "messages")).filter((f) =>
        f.endsWith(".md"),
      ),
    ).toHaveLength(2);
  });
  it("saves attachment chunks idempotently and acknowledges only the assembled exact bytes", () => {
    const h = setup();
    h.m.attachments = [
      {
        id: "a1",
        kind: "audio",
        name: "voice.ogg",
        url: "https://chatgpt.com/file/a1",
        mime: "audio/ogg",
        representation: "download",
      },
    ];
    const saved = h.save();
    const common = { ...h.common, message_id: h.m.id, attachment_id: "a1" };
    const data = Buffer.from("OggS" + "voice bytes".repeat(20));
    expect(
      (h.service.conversationSync({ ...common, op: "media-state" }) as any)
        .saved,
    ).toBeNull();
    const chunk = {
      ...common,
      op: "media-part",
      index: 0,
      data: data.toString("base64"),
      hash: hash(data),
    };
    expect(h.service.conversationSync(chunk).ok).toBe(true);
    expect(h.service.conversationSync(chunk).ok).toBe(true);
    expect(() =>
      h.service.conversationSync({
        ...common,
        op: "media-finish",
        parts: [hash(data)],
        size: 4,
        mime: "audio/ogg",
      }),
    ).toThrow(/size mismatch/);
    const result = h.service.conversationSync({
      ...common,
      op: "media-finish",
      parts: [hash(data)],
      size: data.length,
      mime: "audio/ogg",
    }) as any;
    expect(readFileSync(join(h.root, result.saved.source))).toEqual(data);
    expect(result.saved.sha256).toBe(hash(data));
    const current = readFileSync(
      join(h.root, saved.source, "messages", hash(h.m.id) + ".md"),
      "utf8",
    );
    expect(current).toContain(result.saved.source);
    expect(current).not.toContain("not saved yet");
    expect(
      (h.service.conversationSync({ ...common, op: "media-state" }) as any)
        .saved.bytes,
    ).toBe(data.length);
  });
  it("refuses missing, corrupt, HTML and oversize media without a saved receipt", () => {
    const h = setup();
    h.m.attachments = [
      {
        id: "a",
        kind: "file",
        name: "file",
        url: "",
        mime: "",
        representation: "reference-only",
      },
    ];
    h.save();
    const common = { ...h.common, message_id: h.m.id, attachment_id: "a" };
    expect(() =>
      h.service.conversationSync({
        ...common,
        op: "media-part",
        index: 512,
        data: "YQ==",
        hash: hash("a"),
      }),
    ).toThrow(/256 MB/);
    expect(() =>
      h.service.conversationSync({
        ...common,
        op: "media-part",
        index: 0,
        data: "YQ==",
        hash: hash("wrong"),
      }),
    ).toThrow(/checksum/);
    expect(() =>
      h.service.conversationSync({
        ...common,
        op: "media-finish",
        parts: [hash("missing")],
        size: 7,
        mime: "image/png",
      }),
    ).toThrow(/missing/);
    const data = Buffer.from("<!DOCTYPE html><html>Sign in</html>");
    h.service.conversationSync({
      ...common,
      op: "media-part",
      index: 0,
      data: data.toString("base64"),
      hash: hash(data),
    });
    expect(() =>
      h.service.conversationSync({
        ...common,
        op: "media-finish",
        parts: [hash(data)],
        size: data.length,
        mime: "application/octet-stream",
      }),
    ).toThrow(/web page/);
    expect(
      (h.service.conversationSync({ ...common, op: "media-state" }) as any)
        .saved,
    ).toBeNull();
  });
  it("validates whole batches, blocks excluded sites, and hashes untrusted IDs into safe paths", () => {
    const h = setup();
    expect(() => h.save([h.m, { ...h.m, role: "bogus" }])).toThrow(/role/);
    expect(readdirSync(h.root)).toEqual([]);
    h.m.id = "../../outside";
    h.save();
    expect(readdirSync(h.root)).toEqual(["02 Sources"]);
    h.service.updateBlacklist({ excluded_patterns: ["chatgpt.com/*"] });
    expect(h.save().skipped).toBe(true);
    expect(
      h.service.conversationSync({ ...h.common, op: "state", ids: [h.m.id] })
        .ok,
    ).toBe(false);
  });
  it("rejects symlink escapes for atomic checkpoints and attachment reads", () => {
    const h = setup();
    const outside = mkdtempSync(join(tmpdir(), "ob-outside-"));
    roots.push(outside);
    mkdirSync(join(h.root, "02 Sources"));
    symlinkSync(outside, join(h.root, "02 Sources", "Conversations"), "dir");
    expect(() => h.save()).toThrow(/Symlink/);
    expect(readdirSync(outside)).toEqual([]);
  });
  it("gates state, messages and media through origin, pairing and capture permission", async () => {
    const h = setup();
    let allowed = true;
    const api = await startExtensionApi({
      vault: h.service,
      port: 0,
      mayCapture: () => allowed,
    });
    try {
      const call = (origin: string, token: string) =>
        fetch(api.url + "/conversation-sync", {
          method: "POST",
          headers: {
            origin,
            "x-oddbrain-pair": token,
            "content-type": "application/json",
          },
          body: JSON.stringify({ ...h.common, op: "state", ids: [] }),
        });
      expect((await call("https://chatgpt.com", api.pairToken)).status).toBe(
        403,
      );
      expect((await call("chrome-extension://test", "wrong")).status).toBe(401);
      expect(
        (await call("chrome-extension://test", api.pairToken)).status,
      ).toBe(200);
      allowed = false;
      expect(
        (await call("chrome-extension://test", api.pairToken)).status,
      ).toBe(403);
    } finally {
      await api.close();
    }
  });
});
