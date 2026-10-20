/** Incremental browser conversation storage. Only acknowledged writes count as saved.
 * Raw observations are immutable; current Markdown is a searchable projection.
 * No network requests, provider tokens, OCR or model calls happen in this layer.
 */
import { createHash } from "node:crypto";
import { InputError } from "./errors";
import type { VaultFiles } from "./files";
import { yamlDocument } from "./text";

const hash = (v: string | Uint8Array): string =>
  createHash("sha256").update(v).digest("hex");
const MAX_MEDIA = 256 * 1024 * 1024;
const PART = 512 * 1024;
const MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/octet-stream": "bin",
};
type Obj = Record<string, any>;
function text(v: unknown, name: string, max = 2000, empty = false): string {
  if (typeof v !== "string" || (!empty && !v) || v.length > max)
    throw new InputError(`Invalid ${name}.`);
  return v;
}
function id(v: unknown): string {
  return text(v, "id", 1000);
}
function readJSON(store: VaultFiles, path: string): Obj | null {
  const raw = store.read(path);
  if (!raw) return null;
  // A damaged checkpoint is an error, not permission to overwrite evidence.
  return JSON.parse(raw);
}
function attachment(a: Obj): Obj {
  if (!a || !["image", "audio", "video", "file"].includes(a.kind))
    throw new InputError("Invalid attachment kind.");
  return {
    id: id(a.id),
    kind: a.kind,
    name: text(a.name, "attachment name", 1000, true),
    url: text(a.url, "attachment URL", 20000, true),
    mime: text(a.mime, "attachment MIME", 200, true),
    representation: text(
      a.representation || "unknown",
      "attachment representation",
      100,
    ),
  };
}
function message(m: Obj): Obj {
  if (
    !m ||
    ![
      "user",
      "assistant",
      "system",
      "tool",
      "self",
      "other",
      "unknown",
    ].includes(m.role)
  )
    throw new InputError("Invalid message role.");
  if (!Array.isArray(m.attachments) || m.attachments.length > 100)
    throw new InputError("Invalid attachment list (maximum 100).");
  if (!["native", "position", "content"].includes(m.identity))
    throw new InputError("Invalid message identity.");
  if (!["observed", "streaming"].includes(m.status))
    throw new InputError("Invalid response status.");
  return {
    id: id(m.id),
    role: m.role,
    speaker: text(m.speaker, "speaker", 1000, true),
    text: text(
      m.text,
      "message text (maximum 8 MB; not truncated)",
      8_000_000,
      true,
    ),
    timestamp: text(m.timestamp, "source timestamp", 1000, true),
    reply_to: text(m.reply_to, "reply reference", 1000, true),
    model: text(m.model, "model", 1000, true),
    identity: m.identity,
    status: m.status,
    attachments: m.attachments.map(attachment),
  };
}
function mediaPath(base: string, key: string): string {
  return `${base}/media/${hash(key)}`;
}
function renderMessage(
  store: VaultFiles,
  base: string,
  m: Obj,
  conversation: Obj,
  observedAt: string,
): void {
  const links = m.attachments
    .map((a: Obj) => {
      const saved = readJSON(store, `${mediaPath(base, a.id)}/saved.json`);
      return saved
        ? `- ${a.kind}: [[${saved.source}]] (${a.name || "attachment"}; ${a.representation})`
        : `- ${a.kind}: ${a.name || "attachment"} — attachment bytes not saved yet (${a.representation}). Source reference is in the JSON record.`;
    })
    .join("\n");
  store.writeAtomic(
    `${base}/messages/${hash(m.id)}.md`,
    yamlDocument(
      {
        type: "conversation_message",
        conversation_id: conversation.key,
        provider: conversation.provider,
        title: conversation.title,
        url: conversation.url,
        message_id: m.id,
        role: m.role,
        speaker: m.speaker,
        source_timestamp: m.timestamp || null,
        observed_at: observedAt,
        identity: m.identity,
        response_status: m.status,
        model: m.model || null,
        reply_to: m.reply_to || null,
        completeness:
          "Observed message; unloaded history and unavailable media are not implied.",
      },
      `# ${conversation.title}\n\n## ${m.speaker || m.role}${m.model ? ` — ${m.model}` : ""}\n\n${m.text}\n\n${links ? `## Attachments\n\n${links}\n` : ""}`,
    ),
  );
}

/** Merge observed windows without throwing away messages scrolled out of view.
 * Unknown earlier messages go before the next known anchor. Conflicting branch
 * orders remain in windows/ as evidence; absence is never interpreted as deletion.
 */
function mergeOrder(previous: string[], window: string[]): string[] {
  const result = [...previous];
  for (let i = 0; i < window.length; i++) {
    const key = window[i];
    if (result.includes(key)) continue;
    const next = window.slice(i + 1).find((key) => result.includes(key));
    if (next) result.splice(result.indexOf(next), 0, key);
    else result.push(key);
  }
  return result;
}

export function syncConversation(
  store: VaultFiles,
  data: Obj,
  now: string,
): Obj {
  if (
    !data ||
    ![
      "state",
      "messages",
      "media-state",
      "media-part",
      "media-finish",
    ].includes(data.op)
  )
    throw new InputError("Invalid sync operation.");
  const c = data.conversation;
  if (!c || typeof c !== "object")
    throw new InputError("Conversation metadata is required.");
  const provider = text(c.provider, "provider", 100);
  const key = id(c.key);
  const title = text(c.title, "title", 2000);
  const url = text(data.url, "page URL", 10000);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InputError("Invalid conversation URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new InputError("Conversation URL must be HTTPS.");
  const canonical = text(c.url, "conversation URL", 10000);
  let canonicalURL: URL;
  try {
    canonicalURL = new URL(canonical);
  } catch {
    throw new InputError("Invalid canonical conversation URL.");
  }
  if (canonicalURL.origin !== parsed.origin)
    throw new InputError("Conversation origin mismatch.");
  const base = `02 Sources/Conversations/Browser/${hash(`${provider}\n${key}`)}`;
  const metadata = {
    provider,
    key,
    title,
    url: canonical,
    title_source: text(c.title_source || "unknown", "title source", 100),
  };
  const metaPath = `${base}/conversation.json`;
  const previous = readJSON(store, metaPath);
  if (
    previous &&
    (previous.provider !== provider ||
      previous.key !== key ||
      new URL(previous.url).origin !== parsed.origin)
  )
    throw new InputError("Conversation identity mismatch.");
  const messagePath = (key: string): string =>
    `${base}/messages/${hash(key)}.json`;
  if (data.op === "state") {
    if (!Array.isArray(data.ids) || data.ids.length > 100)
      throw new InputError("Query at most 100 message IDs per batch.");
    const seen: Record<string, string> = Object.create(null);
    return {
      ok: true,
      source: base,
      seen,
      hashes: Object.fromEntries(
        data.ids.map((key: unknown) => {
          const checksum = data.checksums?.[id(key)];
          const saved = readJSON(store, messagePath(id(key)));
          if (
            saved &&
            typeof checksum === "string" &&
            /^[a-f0-9]{64}$/.test(checksum) &&
            store.size(`${base}/receipts/${hash(id(key))}-${checksum}`)
          )
            seen[id(key)] = checksum;
          return [key, saved?.hash || ""];
        }),
      ),
    };
  }
  if (data.op === "messages") {
    if (!Array.isArray(data.messages) || data.messages.length > 50)
      throw new InputError("Save at most 50 messages per batch.");
    const messages = data.messages.map(message); // Validate the entire batch before writing.
    if (
      !Array.isArray(data.order) ||
      data.order.length > 5000 ||
      data.order.some((v: unknown) => typeof v !== "string" || v.length > 1000)
    )
      throw new InputError("Invalid observed message order.");
    const hashes: Record<string, string> = Object.create(null);
    let changed = 0;
    for (const m of messages) {
      const checksum = hash(JSON.stringify(m));
      const current = readJSON(store, messagePath(m.id));
      hashes[m.id] = checksum;
      if (
        current?.hash !== checksum &&
        !(current && store.size(`${base}/receipts/${hash(m.id)}-${checksum}`))
      ) {
        const record = { message: m, hash: checksum, observed_at: now };
        store.writeOnce(
          `${base}/revisions/${hash(m.id)}-${checksum}.json`,
          JSON.stringify(record),
        );
        renderMessage(store, base, m, metadata, now);
        store.writeAtomic(messagePath(m.id), JSON.stringify(record));
        store.writeOnce(
          `${base}/receipts/${hash(m.id)}-${checksum}`,
          "committed",
        );
        changed++;
      }
    }
    // Observed windows preserve order without inventing a global order in a virtualized chat.
    const window = {
      order: data.order,
      observed_at: now,
      coverage: "loaded-window-only",
    };
    if (data.order.length)
      store.writeOnce(
        `${base}/windows/${hash(JSON.stringify(data.order))}.json`,
        JSON.stringify(window),
      );
    const order = mergeOrder(
      previous?.message_ids || [],
      data.order.filter((key: string) => store.size(messagePath(key)) > 0),
    );
    const updated = {
      ...metadata,
      message_ids: order,
      updated_at: now,
      coverage: "loaded-window-only",
      adapter: text(c.adapter || provider, "adapter", 100),
    };
    if (
      !previous ||
      previous.title !== title ||
      previous.url !== canonical ||
      changed ||
      JSON.stringify(order) !== JSON.stringify(previous.message_ids)
    ) {
      store.writeOnce(
        `${base}/metadata/${hash(JSON.stringify(metadata))}.json`,
        JSON.stringify({ ...metadata, observed_at: now }),
      );
      const links = order
        .map(
          (key, index) =>
            `- [[${base}/messages/${hash(key)}.md|Message ${index + 1}]]`,
        )
        .join("\n");
      store.writeAtomic(
        `${base}/conversation.md`,
        yamlDocument(
          { type: "conversation", ...updated },
          `# ${title}\n\nProvider: ${provider}\nURL: ${canonical}\n\nMessages are stored individually in the messages folder. The windows folder records observed ordering. Revisions preserve edits and streamed responses.\n\nCoverage: messages observed while this conversation was open. No account-wide or older-history completeness is claimed.\n\nAttachment files appear in the media folder only after all their bytes have been saved. Rendered resources can be previews rather than originals.\n\n## Saved messages\n\n${links}`,
        ),
      );
      store.writeAtomic(metaPath, JSON.stringify(updated));
    }
    return { ok: true, hashes, changed, source: base };
  }
  // Media is only accepted for a saved message and a declared attachment. No arbitrary writes.
  const owner = readJSON(store, messagePath(id(data.message_id)));
  const a = owner?.message?.attachments.find(
    (v: Obj) => v.id === data.attachment_id,
  );
  if (!owner || !a)
    throw new InputError(
      "Save the attachment reference with its message first.",
    );
  const media = mediaPath(base, a.id);
  const saved = readJSON(store, `${media}/saved.json`);
  if (saved) {
    if (!store.size(saved.source))
      throw new InputError(
        "A saved attachment is missing from the vault. Restore it or remove its saved.json receipt before retrying.",
      );
    if (!saved.projected) {
      renderMessage(store, base, owner.message, metadata, owner.observed_at);
      saved.projected = true;
      store.writeAtomic(`${media}/saved.json`, JSON.stringify(saved));
    }
    return { ok: true, saved };
  }
  if (data.op === "media-state") {
    const parts = store.walkFiles(`${media}/parts`, '.part', 513).files.map(path => path.split('/').pop()!.replace(/\.part$/, '')).filter(part => /^[a-f0-9]{64}$/.test(part));
    return { ok: true, saved: null, parts };
  }
  if (data.op === "media-part") {
    if (
      !Number.isInteger(data.index) ||
      data.index < 0 ||
      data.index >= MAX_MEDIA / PART
    )
      throw new InputError(
        "Attachment exceeds the 256 MB transfer limit; nothing is silently truncated.",
      );
    if (
      typeof data.data !== "string" ||
      data.data.length > Math.ceil(PART / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data.data)
    )
      throw new InputError("Invalid attachment chunk.");
    const bytes = Buffer.from(data.data, "base64");
    if (
      !bytes.length ||
      bytes.length > PART ||
      bytes.toString("base64") !== data.data
    )
      throw new InputError("Invalid attachment bytes.");
    const checksum = hash(bytes);
    if (data.hash !== checksum)
      throw new InputError("Attachment chunk checksum mismatch.");
    // Content-addressed chunks are restart-safe even if a source URL later changes its bytes.
    store.writeOnce(`${media}/parts/${checksum}.part`, bytes);
    return { ok: true, hash: checksum };
  }
  if (
    !Array.isArray(data.parts) ||
    !data.parts.length ||
    data.parts.length > MAX_MEDIA / PART ||
    data.parts.some(
      (v: unknown) => typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v),
    )
  )
    throw new InputError("Invalid attachment manifest.");
  const mime = text(data.mime, "attachment MIME", 200)
    .split(";")[0]
    .toLowerCase();
  if (
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime) ||
    ["text/html", "application/xhtml+xml"].includes(mime)
  )
    throw new InputError(
      "The site did not return a safe attachment content type.",
    );
  if (!Number.isInteger(data.size) || data.size < 1 || data.size > MAX_MEDIA)
    throw new InputError("Invalid attachment size.");
  const chunks = data.parts.map((part: string) => {
    const bytes = store.readBytes(`${media}/parts/${part}.part`);
    if (!bytes.length || bytes.length > PART || hash(bytes) !== part)
      throw new InputError(
        "An attachment chunk is missing or damaged. Retry with the site open.",
      );
    return bytes;
  });
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== data.size || bytes.length > MAX_MEDIA)
    throw new InputError("Attachment size mismatch.");
  // Refuse login/error HTML returned as an alleged file; never execute captured markup.
  if (
    /^\s*(?:<!doctype html|<html)/i.test(
      bytes.subarray(0, 256).toString("utf8"),
    )
  )
    throw new InputError(
      "The site returned a web page instead of the attachment.",
    );
  const checksum = hash(bytes);
  const source = `${media}/${checksum}.${MIME[mime] || "bin"}`;
  store.writeOnce(source, bytes);
  const receipt = {
    source,
    bytes: bytes.length,
    mime,
    sha256: checksum,
    saved_at: now,
    projected: false,
  };
  store.writeAtomic(`${media}/saved.json`, JSON.stringify(receipt));
  renderMessage(store, base, owner.message, metadata, owner.observed_at);
  receipt.projected = true;
  store.writeAtomic(`${media}/saved.json`, JSON.stringify(receipt));
  return { ok: true, saved: receipt };
}
