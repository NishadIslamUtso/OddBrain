/**
 * Chat history import — the history other apps hold hostage, brought into
 * the vault as plain markdown the app can already search.
 *
 * Two shapes are understood, detected per item, no settings needed:
 *  - ChatGPT's `conversations.json` (a `mapping` tree per conversation; the
 *    document follows the branch ChatGPT itself shows).
 *  - Claude's `conversations.json` (a flat `chat_messages` list per
 *    conversation, senders `human`/`assistant`).
 * Parsing is strict about shape and tolerant about content: one broken
 * conversation is reported, not fatal. Each conversation becomes one
 * markdown document under `02 Sources/Imports/<app>/`, keyed by a hash of
 * its id, so re-importing a newer export updates the same files instead of
 * duplicating them. No network, no model calls — a file becomes vault files.
 */
import { createHash } from "node:crypto";
import { InputError } from "./errors";
import type { VaultFiles } from "./files";
import { yamlDocument } from "./text";

const hash = (v: string): string => createHash("sha256").update(v).digest("hex");
const CONVERSATION_LIMIT = 10_000;
const MESSAGE_LIMIT = 5_000;
const TEXT_LIMIT = 100_000;
const IMPORTS = "02 Sources/Imports";

type Obj = Record<string, any>;

const iso = (unix: unknown): string =>
  typeof unix === "number" && Number.isFinite(unix)
    ? new Date(unix * 1000).toISOString()
    : typeof unix === "string" && unix && !Number.isNaN(Date.parse(unix))
      ? new Date(unix).toISOString()
      : "unknown";

function roleLabel(role: unknown, assistantName: string): string | null {
  if (role === "user" || role === "human") return "You";
  if (role === "assistant") return assistantName;
  if (role === "system") return "System";
  if (role === "tool" || role === "tool_result") return "Tool";
  return null;
}

function textLine(label: string, parts: unknown[], assistantName: string): { line: string; skippedParts: number } | null {
  const kept: string[] = [];
  let skippedParts = 0;
  for (const part of parts.slice(0, 50)) {
    if (typeof part === "string") {
      if (part.trim()) kept.push(part.length > TEXT_LIMIT ? `${part.slice(0, TEXT_LIMIT)}\n\n*(text kept to ${TEXT_LIMIT} characters)*` : part);
    } else if (part && typeof part === "object" && typeof (part as Obj).text === "string" && (part as Obj).text.trim()) {
      // Claude packs text as blocks.
      kept.push((part as Obj).text as string);
    } else {
      // Images, tool calls, file pointers: named honestly, never invented.
      skippedParts++;
    }
  }
  if (!kept.length) return null;
  void assistantName;
  const body = kept.join("\n\n");
  return { line: `**${label}:**\n\n${body}`, skippedParts };
}

function renderMessage(message: Obj, assistantName: string): { line: string; skippedParts: number } | null {
  const label = roleLabel(message?.author?.role, assistantName);
  if (!label) return null;
  const parts = message?.content?.parts;
  if (!Array.isArray(parts)) return null;
  return textLine(label, parts, assistantName);
}

/** The linear path ChatGPT itself shows: from the chosen leaf up to the root. */
function branchOf(mapping: Obj, current: unknown): Obj[] {
  const chain: Obj[] = [];
  let node = typeof current === "string" ? mapping[current] : null;
  let guard = 0;
  while (node && guard++ <= MESSAGE_LIMIT) {
    if (node.message) chain.push(node.message);
    node = typeof node.parent === "string" ? mapping[node.parent] : null;
  }
  return chain.reverse();
}

/** Claude's flat message list: senders human/assistant, content string or blocks. */
function claudeLines(item: Obj): { lines: string[]; skippedParts: number; count: number } | null {
  const messages = item?.chat_messages;
  if (!Array.isArray(messages) || !messages.length) return null;
  const lines: string[] = [];
  let skippedParts = 0, count = 0;
  for (const message of messages.slice(0, MESSAGE_LIMIT)) {
    const label = roleLabel(message?.sender, "Claude");
    if (!label) continue;
    const parts = Array.isArray(message?.content)
      ? message.content
      : typeof message?.content === "string"
        ? [message.content]
        : typeof message?.text === "string"
          ? [message.text]
          : [];
    const rendered = textLine(label, parts, "Claude");
    if (!rendered) continue;
    lines.push(rendered.line);
    skippedParts += rendered.skippedParts;
    count++;
  }
  return count ? { lines, skippedParts, count } : null;
}

function chatgptLines(item: Obj): { lines: string[]; skippedParts: number; count: number; total: number } | null {
  const mapping = item?.mapping;
  if (!mapping || typeof mapping !== "object") return null;
  const branch = branchOf(mapping, item?.current_node);
  const lines: string[] = [];
  let skippedParts = 0, count = 0;
  for (const message of branch) {
    if (count >= MESSAGE_LIMIT) {
      lines.push(`*(this conversation keeps ${MESSAGE_LIMIT} of ${branch.length} messages in the import)*`);
      break;
    }
    const rendered = renderMessage(message, "ChatGPT");
    if (!rendered) continue;
    lines.push(rendered.line);
    skippedParts += rendered.skippedParts;
    count++;
  }
  return count ? { lines, skippedParts, count, total: branch.length } : null;
}

function writeDocument(
  store: VaultFiles,
  folder: string,
  key: string,
  title: string,
  metadata: Record<string, unknown>,
  body: string,
  now: string,
): void {
  store.writeAtomic(
    `${folder}/${hash(key)}.md`,
    yamlDocument({ ...metadata, title, imported_at: now }, body),
  );
}

export function importChatExport(store: VaultFiles, raw: string, now: string): {
  ok: true;
  imported: number;
  messages: number;
  skippedParts: number;
  failed: Array<{ title: string; reason: string }>;
  answer: string;
} {
  let parsed: unknown;
  try {
    // Windows "Export data" archives sometimes hand over a file that starts
    // with an invisible byte-order mark; JSON.parse refuses it. Strip it —
    // the person chose the right file and should not learn about encodings.
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new InputError("That file is not valid JSON. ChatGPT and Claude exports ship a conversations.json — choose that file.");
  }
  if (!Array.isArray(parsed))
    throw new InputError("That JSON is not a chat export (expected a list of conversations). No files were written.");
  if (parsed.length > CONVERSATION_LIMIT)
    throw new InputError(`That export holds more than ${CONVERSATION_LIMIT} conversations. Import it in parts. Nothing was written.`);

  const failed: Array<{ title: string; reason: string }> = [];
  const counts = new Map<string, { imported: number; messages: number }>();
  let skippedParts = 0;

  for (const item of parsed) {
    const title = typeof item?.title === "string" && item.title.trim() ? item.title.slice(0, 2_000) : typeof item?.name === "string" && item.name.trim() ? item.name.slice(0, 2_000) : "Untitled conversation";
    try {
      if (Array.isArray(item?.chat_messages)) {
        // Claude's shape.
        const id = typeof item?.uuid === "string" && item.uuid ? item.uuid : null;
        if (!id) throw new InputError("conversation has no id");
        const rendered = claudeLines(item);
        if (!rendered) throw new InputError("no readable messages");
        const folder = `${IMPORTS}/Claude`;
        writeDocument(
          store,
          folder,
          id,
          title,
          {
            source: "Claude import",
            conversation_id: hash(id),
            created: iso(item?.created_at),
            updated: iso(item?.updated_at),
            messages: rendered.count,
          },
          `# ${title}\n\n${rendered.lines.join("\n\n")}${rendered.skippedParts ? `\n\n*(${rendered.skippedParts} non-text attachment${rendered.skippedParts === 1 ? " was" : "s were"} not part of this import.)*` : ""}`,
          now,
        );
        const tally = counts.get("Claude") || { imported: 0, messages: 0 };
        tally.imported++; tally.messages += rendered.count;
        counts.set("Claude", tally);
        skippedParts += rendered.skippedParts;
      } else {
        // ChatGPT's shape.
        const id = typeof item?.id === "string" && item.id ? item.id : null;
        if (!id) throw new InputError("no conversation id or message map");
        const rendered = chatgptLines(item);
        if (!rendered) throw new InputError("no readable messages on the current branch");
        const folder = `${IMPORTS}/ChatGPT`;
        writeDocument(
          store,
          folder,
          id,
          title,
          {
            source: "ChatGPT import",
            conversation_id: hash(id),
            created: iso(item?.create_time),
            updated: iso(item?.update_time),
            messages: rendered.count,
          },
          `# ${title}\n\n${rendered.lines.join("\n\n")}${rendered.skippedParts ? `\n\n*(${rendered.skippedParts} non-text attachment${rendered.skippedParts === 1 ? " was" : "s were"} not part of this import.)*` : ""}`,
          now,
        );
        const tally = counts.get("ChatGPT") || { imported: 0, messages: 0 };
        tally.imported++; tally.messages += rendered.count;
        counts.set("ChatGPT", tally);
        skippedParts += rendered.skippedParts;
      }
    } catch (error) {
      failed.push({ title, reason: error instanceof Error ? error.message : "unreadable conversation" });
    }
  }

  const where = [...counts.keys()].map((app) => `${app}: ${counts.get(app)!.imported} conversation${counts.get(app)!.imported === 1 ? "" : "s"} (${counts.get(app)!.messages} message${counts.get(app)!.messages === 1 ? "" : "s"})`).join("; ");
  const parts = [`${where || "nothing"} into ${IMPORTS}/`];
  if (skippedParts) parts.push(`${skippedParts} non-text attachment${skippedParts === 1 ? "" : "s"} named but not imported`);
  if (failed.length) parts.push(`${failed.length} unreadable: ${failed.slice(0, 3).map((f) => `"${f.title}" (${f.reason})`).join(", ")}${failed.length > 3 ? "…" : ""}`);
  const imported = [...counts.values()].reduce((sum, c) => sum + c.imported, 0);
  const messages = [...counts.values()].reduce((sum, c) => sum + c.messages, 0);
  return { ok: true, imported, messages, skippedParts, failed, answer: parts.join("; ") + "." };
}
