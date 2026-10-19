/**
 * ChatGPT history import — the history other apps hold hostage, brought into
 * the vault as plain markdown the app can already search.
 *
 * The file is the `conversations.json` from ChatGPT's own "Export data"
 * archive. Parsing is strict about shape and tolerant about content: one
 * broken conversation is reported, not fatal. Each conversation becomes one
 * markdown document under `02 Sources/Imports/ChatGPT/`, keyed by a hash of
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
const BASE = "02 Sources/Imports/ChatGPT";

type Obj = Record<string, any>;

const iso = (unix: unknown): string =>
  typeof unix === "number" && Number.isFinite(unix)
    ? new Date(unix * 1000).toISOString()
    : "unknown";

function roleLabel(role: unknown): string | null {
  if (role === "user") return "You";
  if (role === "assistant") return "ChatGPT";
  if (role === "system") return "System";
  if (role === "tool") return "Tool";
  return null;
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

function renderMessage(message: Obj): { line: string; skippedParts: number } | null {
  const label = roleLabel(message?.author?.role);
  if (!label) return null;
  const parts = message?.content?.parts;
  const kept: string[] = [];
  let skippedParts = 0;
  if (Array.isArray(parts)) {
    for (const part of parts.slice(0, 50)) {
      if (typeof part === "string") {
        if (part.trim()) kept.push(part.length > TEXT_LIMIT ? `${part.slice(0, TEXT_LIMIT)}\n\n*(text kept to ${TEXT_LIMIT} characters)*` : part);
      } else {
        // Image generations, file pointers, audio: named honestly, never invented.
        skippedParts++;
      }
    }
  }
  if (!kept.length) return null;
  const body = kept.join("\n\n");
  return { line: `**${label}:**\n\n${body}`, skippedParts };
}

export function importChatGPTExport(store: VaultFiles, raw: string, now: string): {
  ok: true;
  imported: number;
  messages: number;
  skippedParts: number;
  failed: Array<{ title: string; reason: string }>;
  answer: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InputError("That file is not valid JSON. ChatGPT's export ships conversations.json — choose that file.");
  }
  if (!Array.isArray(parsed))
    throw new InputError("That JSON is not a ChatGPT export (expected a list of conversations). No files were written.");
  if (parsed.length > CONVERSATION_LIMIT)
    throw new InputError(`That export holds more than ${CONVERSATION_LIMIT} conversations. Import it in parts. Nothing was written.`);

  const failed: Array<{ title: string; reason: string }> = [];
  let imported = 0, messages = 0, skippedParts = 0;

  for (const item of parsed) {
    const title = typeof item?.title === "string" && item.title.trim() ? item.title.slice(0, 2_000) : "Untitled conversation";
    try {
      const conversationId = typeof item?.id === "string" && item.id ? item.id : null;
      const mapping = item?.mapping;
      if (!conversationId || !mapping || typeof mapping !== "object")
        throw new InputError("no conversation id or message map");
      const branch = branchOf(mapping, item?.current_node);
      const lines: string[] = [];
      let conversationSkips = 0;
      let count = 0;
      for (const message of branch) {
        if (count >= MESSAGE_LIMIT) {
          lines.push(`*(this conversation keeps ${MESSAGE_LIMIT} of ${branch.length} messages in the import)*`);
          break;
        }
        const rendered = renderMessage(message);
        if (!rendered) continue;
        lines.push(rendered.line);
        conversationSkips += rendered.skippedParts;
        count++;
      }
      if (!count) throw new InputError("no readable messages on the current branch");
      const metadata = {
        source: "ChatGPT import",
        title,
        conversation_id: hash(conversationId),
        created: iso(item?.create_time),
        updated: iso(item?.update_time),
        imported_at: now,
        messages: count,
      };
      const body = `# ${title}\n\n${lines.join("\n\n")}${conversationSkips ? `\n\n*(${conversationSkips} non-text attachment${conversationSkips === 1 ? " was" : "s were"} not part of this import.)*` : ""}`;
      store.writeAtomic(`${BASE}/${hash(conversationId)}.md`, yamlDocument(metadata, body));
      imported++;
      messages += count;
      skippedParts += conversationSkips;
    } catch (error) {
      failed.push({ title, reason: error instanceof Error ? error.message : "unreadable conversation" });
    }
  }

  const parts = [
    `${imported} conversation${imported === 1 ? "" : "s"} (${messages} message${messages === 1 ? "" : "s"}) into ${BASE}/`,
  ];
  if (skippedParts) parts.push(`${skippedParts} non-text attachment${skippedParts === 1 ? "" : "s"} named but not imported`);
  if (failed.length) parts.push(`${failed.length} unreadable: ${failed.slice(0, 3).map((f) => `"${f.title}" (${f.reason})`).join(", ")}${failed.length > 3 ? "…" : ""}`);
  return { ok: true, imported, messages, skippedParts, failed, answer: parts.join("; ") + "." };
}
