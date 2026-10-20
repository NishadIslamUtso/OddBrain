/* Durable write-ahead queue. Bodies never enter popup summaries or sync storage.
 * A transaction completion, not a successful put request, is the local receipt.
 * No credentials are stored here. The caller supplies a verified destination. */
(() => {
  function create({
    indexedDB = globalThis.indexedDB,
    name = "oddbrain-conversation-outbox",
    limit = 128 * 1024 * 1024,
    maxRows = 4096,
    digest = (value) => OddConversations.sha(value),
  } = {}) {
    let opening;
    const request = (req) =>
      new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const complete = (tx) =>
      new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () =>
          reject(
            tx.error || Error("Browser storage transaction was interrupted."),
          );
        tx.onerror = () => {};
      });
    async function open() {
      if (!indexedDB)
        throw Error("Browser storage is unavailable. Nothing was queued.");
      if (!opening)
        opening = new Promise((resolve, reject) => {
          const req = indexedDB.open(name, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            const rows = db.createObjectStore("rows", { keyPath: "id" });
            rows.createIndex("sequence", "sequence", { unique: true });
            db.createObjectStore("bodies", { keyPath: "id" });
            db.createObjectStore("meta");
            db.createObjectStore("receipts", { keyPath: "id" }).createIndex(
              "at",
              "at",
            );
          };
          req.onerror = () => {
            opening = null;
            reject(req.error);
          };
          req.onblocked = () => {
            opening = null;
            reject(
              Error(
                "Close another OddBrain extension window to update browser storage.",
              ),
            );
          };
          req.onsuccess = () => {
            req.result.onversionchange = () => {
              req.result.close();
              opening = null;
            };
            resolve(req.result);
          };
        });
      return opening;
    }
    async function transaction(stores, mode, run) {
      const db = await open(),
        tx = db.transaction(stores, mode),
        done = complete(tx);
      try {
        const result = await run(tx);
        await done;
        return result;
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        await done.catch(() => {});
        throw error;
      }
    }
    async function enqueue(payload, destination) {
      // The target is the vault's identity. A pairing token may rotate and the
      // app's port may change; neither is what this queue is addressed to.
      if (
        !["messages", "media-part", "media-finish"].includes(payload?.op) ||
        !/^[a-f0-9]{64}$/.test(destination?.target || "")
      )
        throw Error("A verified vault and a supported capture are required.");
      const body = JSON.stringify({
        ...payload,
        capture_target: destination.target,
      });
      const bytes = new TextEncoder().encode(body).byteLength;
      if (bytes > 18 * 1024 * 1024)
        throw Error(
          "This capture exceeds the 18 MB browser queue item limit. Nothing was truncated.",
        );
      const id = await digest(destination.target + "\n" + body);
      return transaction(
        ["rows", "bodies", "meta", "receipts"],
        "readwrite",
        async (tx) => {
          const rows = tx.objectStore("rows"),
            meta = tx.objectStore("meta");
          const prior = await request(rows.get(id));
          if (prior) return prior;
          const tally = (await request(meta.get("tally"))) || {
            bytes: 0,
            count: 0,
            sequence: 0,
          };
          if (tally.bytes + bytes > limit || tally.count >= maxRows)
            throw Error(
              "The conversation outbox is full. Open OddBrain to finish saving or clear waiting captures. Nothing was silently dropped.",
            );
          const row = {
            id,
            identity: destination.target,
            target: destination.target,
            conversation: payload.conversation.key,
            title: String(payload.conversation.title || "").slice(0, 500),
            url: payload.url,
            op: payload.op,
            attachment: payload.attachment_id || "",
            hash: payload.hash || "",
            bytes,
            sequence: tally.sequence + 1,
            at: Date.now(),
            problem: "",
            attempts: 0,
            lastAttempt: 0,
            retryAt: 0,
            retryReason: "",
          };
          rows.add(row);
          tx.objectStore("bodies").add({ id, body });
          tx.objectStore("receipts").delete(id);
          meta.put(
            {
              bytes: tally.bytes + bytes,
              count: tally.count + 1,
              sequence: row.sequence,
            },
            "tally",
          );
          return row;
        },
      );
    }
    const list = () =>
      transaction(["rows"], "readonly", (tx) =>
        request(tx.objectStore("rows").index("sequence").getAll()),
      );
    const body = (id) =>
      transaction(["bodies"], "readonly", async (tx) => {
        const entry = await request(tx.objectStore("bodies").get(id));
        return entry ? JSON.parse(entry.body) : null;
      });
    async function remove(ids, saved = false) {
      return transaction(
        ["rows", "bodies", "meta", "receipts"],
        "readwrite",
        async (tx) => {
          const rows = tx.objectStore("rows"),
            meta = tx.objectStore("meta"),
            receipts = tx.objectStore("receipts");
          const tally = (await request(meta.get("tally"))) || {
            bytes: 0,
            count: 0,
            sequence: 0,
          };
          for (const id of ids) {
            const row = await request(rows.get(id));
            if (!row) continue;
            tally.bytes -= row.bytes;
            tally.count--;
            rows.delete(id);
            tx.objectStore("bodies").delete(id);
            if (saved) receipts.put({ id, at: Date.now() });
            else receipts.delete(id);
          }
          meta.put(tally, "tally");
          const count = await request(receipts.count());
          if (count > 4096) {
            const old = await request(
              receipts.index("at").getAllKeys(null, count - 4096),
            );
            old.forEach((id) => receipts.delete(id));
          }
        },
      );
    }
    const mark = (id, problem) =>
      transaction(["rows"], "readwrite", async (tx) => {
        const rows = tx.objectStore("rows"),
          row = await request(rows.get(id));
        if (row) rows.put({ ...row, problem: String(problem).slice(0, 500) });
      });
    const attempt = (id) =>
      transaction(["rows"], "readwrite", async (tx) => {
        const rows = tx.objectStore("rows"), row = await request(rows.get(id));
        if (row) rows.put({ ...row, lastAttempt: Date.now(), retryAt: 0, retryReason: "" });
      });
    const retry = (id, reason) =>
      transaction(["rows"], "readwrite", async (tx) => {
        const rows = tx.objectStore("rows"), row = await request(rows.get(id));
        if (!row) return;
        const attempts = Math.min(20, Number(row.attempts || 0) + 1);
        const delay = Math.min(60 * 60 * 1000, 30_000 * (2 ** Math.min(7, attempts - 1)));
        rows.put({ ...row, attempts, retryAt: Date.now() + delay, retryReason: String(reason).slice(0, 500) });
      });
    const receipts = (ids) =>
      transaction(["rows", "receipts"], "readonly", async (tx) => {
        if (
          !Array.isArray(ids) ||
          ids.length > 4096 ||
          ids.some((id) => typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
        )
          throw Error("Invalid receipt list.");
        const result = { saved: 0, queued: 0, missing: 0, problems: [] };
        for (const id of [...new Set(ids)]) {
          const row = await request(tx.objectStore("rows").get(id));
          if (row) {
            result.queued++;
            if (row.problem && !result.problems.includes(row.problem))
              result.problems.push(row.problem);
          } else if (await request(tx.objectStore("receipts").get(id)))
            result.saved++;
          else result.missing++;
        }
        return result;
      });
    const clear = () =>
      transaction(
        ["rows", "bodies", "meta", "receipts"],
        "readwrite",
        async (tx) => {
          for (const store of ["rows", "bodies", "meta", "receipts"])
            tx.objectStore(store).clear();
        },
      );
    const close = async () => {
      if (opening) (await opening).close();
      opening = null;
    };
    return { enqueue, list, body, remove, mark, attempt, retry, receipts, clear, close };
  }
  globalThis.OddConversationOutbox = { create };
  if (typeof module !== "undefined") module.exports = { create };
})();
