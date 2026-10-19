import { test, expect, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { create } = require("../../../extension/lib/conversation-outbox.js");
const digest = async (text: string) =>
  createHash("sha256").update(text).digest("hex");
const destination = { identity: "a".repeat(64), target: "b".repeat(64) };
const payload = (text = "PRIVATE") => ({
  op: "messages",
  url: "https://chatgpt.com/c/test",
  conversation: { key: "chatgpt:test", title: "Test" },
  messages: [{ id: "m", text }],
  order: ["m"],
});
test("acknowledges durable transactions, survives reopening and deduplicates concurrent submissions", async () => {
  const indexedDB = new IDBFactory(),
    first = create({ indexedDB, digest });
  const ids = await Promise.all(
    Array.from({ length: 12 }, () => first.enqueue(payload(), destination)),
  );
  expect(new Set(ids.map((row) => row.id)).size).toBe(1);
  await first.close();
  const second = create({ indexedDB, digest });
  const rows = await second.list();
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain("PRIVATE");
  expect((await second.body(rows[0].id)).messages[0].text).toBe("PRIVATE");
  expect(await second.receipts([rows[0].id])).toMatchObject({
    saved: 0,
    queued: 1,
    missing: 0,
  });
  await second.remove([rows[0].id], true);
  expect(await second.receipts([rows[0].id])).toMatchObject({
    saved: 1,
    queued: 0,
    missing: 0,
  });
  expect(await second.body(rows[0].id)).toBeNull();
  await second.close();
});
test("a capacity refusal preserves earlier bytes and releases quota after delivery", async () => {
  const queue = create({ indexedDB: new IDBFactory(), digest, limit: 600 });
  const first = await queue.enqueue(payload(), destination);
  await expect(
    queue.enqueue(payload("x".repeat(800)), destination),
  ).rejects.toThrow("full");
  expect(await queue.list()).toHaveLength(1);
  await queue.remove([first.id], true);
  expect((await queue.enqueue(payload("small"), destination)).id).not.toBe(
    first.id,
  );
  await queue.clear();
  expect(await queue.list()).toEqual([]);
  expect(await queue.receipts([first.id])).toMatchObject({
    saved: 0,
    missing: 1,
  });
  await queue.close();
});
test("payloads and receipts are bound to a destination, and re-observations still need a fresh server acknowledgement", async () => {
  const queue = create({ indexedDB: new IDBFactory(), digest });
  const a = await queue.enqueue(payload(), destination),
    b = await queue.enqueue(payload(), {
      ...destination,
      target: "c".repeat(64),
    });
  expect(a.id).not.toBe(b.id);
  await queue.remove([a.id], true);
  await queue.enqueue(payload(), destination);
  expect(await queue.receipts([a.id])).toMatchObject({ saved: 0, queued: 1 });
  await queue.mark(a.id, "Refused");
  expect((await queue.receipts([a.id])).problems).toEqual(["Refused"]);
  await queue.clear();
  expect(await queue.body(b.id)).toBeNull();
  await queue.close();
});

test("a browser storage write failure aborts the entire enqueue without reporting a receipt", async () => {
  const queue = create({ indexedDB: new IDBFactory(), digest });
  const original = IDBObjectStore.prototype.add;
  const fault = vi
    .spyOn(IDBObjectStore.prototype, "add")
    .mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof original>
    ) {
      if (this.name === "bodies")
        throw new DOMException("Disk quota exceeded", "QuotaExceededError");
      return original.apply(this, args);
    });
  try {
    await expect(queue.enqueue(payload(), destination)).rejects.toThrow(
      "Disk quota exceeded",
    );
  } finally {
    fault.mockRestore();
  }
  expect(await queue.list()).toEqual([]);
  const row = await queue.enqueue(payload(), destination);
  expect(await queue.receipts([row.id])).toMatchObject({ queued: 1, saved: 0 });
  await queue.close();
});
