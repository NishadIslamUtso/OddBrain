import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVaultService } from "../src/main/vault/service";
import { importChatExport } from "../src/main/vault/imports";

const storeOf = (): { store: ReturnType<typeof createVaultService>["files"]; root: string } => {
  const root = mkdtempSync(join(tmpdir(), "ob-chatgpt-import-"));
  return { store: createVaultService({ vaultPath: root }).files(), root };
};

const conversation = (overrides: Record<string, any> = {}): Record<string, any> => ({
  title: "A real chat",
  id: "conv-1",
  create_time: 1750000000,
  update_time: 1750000300,
  current_node: "c",
  mapping: {
    a: { id: "a", parent: null, children: ["b"], message: { author: { role: "system" }, content: { content_type: "text", parts: [""] } } },
    b: {
      id: "b",
      parent: "a",
      children: ["c"],
      message: { author: { role: "user" }, content: { content_type: "text", parts: ["What is OddBrain?"] } },
    },
    c: {
      id: "c",
      parent: "b",
      children: [],
      message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["A local-first desktop assistant with a vault."] } },
    },
  },
  ...overrides,
});

describe("ChatGPT export import", () => {
  it("writes one markdown document per conversation, with the branch in order and honest metadata", () => {
    const { store, root } = storeOf();
    try {
      const answer = importChatExport(store, JSON.stringify([conversation()]), "2026-10-19T00:00:00.000Z");
      expect(answer.ok).toBe(true);
      expect(answer.imported).toBe(1);
      expect(answer.messages).toBe(2);
      expect(answer.failed).toEqual([]);
      const file = join(root, "02 Sources/Imports/ChatGPT");
      const written = require("node:fs").readdirSync(file);
      expect(written).toHaveLength(1);
      const doc = readFileSync(join(file, written[0]), "utf8");
      expect(doc).toContain("source: ChatGPT import");
      expect(doc).toContain("# A real chat");
      expect(doc.indexOf("**You:**")).toBeLessThan(doc.indexOf("**ChatGPT:**"));
      expect(doc).toContain("What is OddBrain?");
      expect(doc).not.toContain("system");
      expect(doc).toContain("created: 2025-06-15T15:06");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("follows the current branch through edits, and names non-text parts instead of inventing them", () => {
    const { store, root } = storeOf();
    try {
      const conv = {
        id: "conv-2",
        title: "Branched",
        create_time: 1750000000,
        // A real edit: the two versions of the user turn are siblings under
        // the root; the current branch runs through the newer one only.
        current_node: "d",
        mapping: {
          u1: { id: "u1", parent: null, children: ["e"], message: { author: { role: "user" }, content: { content_type: "text", parts: ["first try"] } } },
          e: { id: "e", parent: "u1", children: [], message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["old branch answer"] } } },
          u2: { id: "u2", parent: null, children: ["a"], message: { author: { role: "user" }, content: { content_type: "text", parts: ["edited try"] } } },
          a: { id: "a", parent: "u2", children: ["d"], message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["kept answer"] } } },
          d: {
            id: "d",
            parent: "a",
            children: [],
            message: {
              author: { role: "assistant" },
              content: { content_type: "multimodal_content", parts: ["here is a picture", { image_pointer: { id: "p-1" } }] },
            },
          },
        },
      };
      const answer = importChatExport(store, JSON.stringify([conv]), "2026-10-19T00:00:00.000Z");
      expect(answer.imported).toBe(1);
      expect(answer.messages).toBe(3);
      expect(answer.skippedParts).toBe(1);
      expect(answer.answer).toContain("1 non-text attachment");
      const dir = join(root, "02 Sources/Imports/ChatGPT");
      const [name] = require("node:fs").readdirSync(dir);
      const doc = readFileSync(join(dir, name), "utf8");
      // The current branch only: the "edited try" replaces "first try", and the
      // abandoned sibling never claims to be part of the story.
      expect(doc).toContain("edited try");
      expect(doc).not.toContain("first try");
      expect(doc).not.toContain("old branch answer");
      expect(doc.indexOf("**You:**")).toBeLessThan(doc.indexOf("kept answer"));
      expect(doc).toContain("here is a picture");
      expect(doc).toContain("1 non-text attachment was not part of this import");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("re-importing the same conversation updates its file instead of duplicating it", () => {
    const { store, root } = storeOf();
    try {
      const first = importChatExport(store, JSON.stringify([conversation()]), "2026-10-19T00:00:00.000Z");
      const second = importChatExport(
        store,
        JSON.stringify([conversation({ title: "A real chat (renamed)" })]),
        "2026-10-19T01:00:00.000Z",
      );
      expect(first.imported).toBe(1);
      expect(second.imported).toBe(1);
      const dir = join(root, "02 Sources/Imports/ChatGPT");
      expect(require("node:fs").readdirSync(dir)).toHaveLength(1);
      expect(readFileSync(join(dir, require("node:fs").readdirSync(dir)[0]), "utf8")).toContain("renamed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("reports broken conversations and keeps importing the healthy rest", () => {
    const { store, root } = storeOf();
    try {
      const answer = importChatExport(
        store,
        JSON.stringify([conversation(), { title: "hollow", id: "conv-9", mapping: {} }, { title: "no id", mapping: { a: {} } }]),
        "2026-10-19T00:00:00.000Z",
      );
      expect(answer.imported).toBe(1);
      expect(answer.failed).toHaveLength(2);
      expect(answer.failed.map((f) => f.title)).toEqual(["hollow", "no id"]);
      expect(answer.answer).toContain("2 unreadable");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("refuses files that are not a ChatGPT export, out loud, before writing anything", () => {
    const { store, root } = storeOf();
    try {
      expect(() => importChatExport(store, "{not json", "2026-10-19T00:00:00.000Z")).toThrow(/not valid JSON/);
      expect(() => importChatExport(store, JSON.stringify({ hello: true }), "2026-10-19T00:00:00.000Z")).toThrow(
        /not a chat export/,
      );
      expect(require("node:fs").existsSync(join(root, "02 Sources"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("recognizes a Claude export by shape: flat chat_messages, human/assistant senders, ISO dates", () => {
    const { store, root } = storeOf();
    try {
      const claude = [
        {
          uuid: "claude-conv-1",
          name: "Vault planning",
          created_at: "2026-10-01T09:00:00.000Z",
          updated_at: "2026-10-01T09:10:00.000Z",
          chat_messages: [
            { sender: "human", created_at: "2026-10-01T09:00:00.000Z", content: [{ type: "text", text: "How do imports work?" }] },
            { sender: "assistant", created_at: "2026-10-01T09:10:00.000Z", content: [{ type: "text", text: "One file becomes one document." }, { type: "tool_use", name: "reader" }] },
          ],
        },
      ];
      const answer = importChatExport(store, JSON.stringify(claude), "2026-10-19T00:00:00.000Z");
      expect(answer.imported).toBe(1);
      expect(answer.messages).toBe(2);
      expect(answer.skippedParts).toBe(1);
      expect(answer.answer).toContain("Claude: 1 conversation");
      const dir = join(root, "02 Sources/Imports/Claude");
      const [name] = require("node:fs").readdirSync(dir);
      const doc = readFileSync(join(dir, name), "utf8");
      expect(doc).toContain("source: Claude import");
      expect(doc).toContain("# Vault planning");
      expect(doc).toContain("How do imports work?");
      expect(doc).toContain("1 non-text attachment was not part of this import");
      expect(doc).toContain("created: 2026-10-01T09:00");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("one file may mix both apps; each lands in its own folder and the summary counts both", () => {
    const { store, root } = storeOf();
    try {
      const mixed = [
        conversation(),
        {
          uuid: "claude-conv-2",
          name: "Claude side",
          created_at: "2026-10-02T10:00:00.000Z",
          updated_at: "2026-10-02T10:05:00.000Z",
          chat_messages: [
            { sender: "human", content: "second app check" },
            { sender: "assistant", content: "lands beside it, not on it" },
          ],
        },
      ];
      const answer = importChatExport(store, JSON.stringify(mixed), "2026-10-19T00:00:00.000Z");
      expect(answer.imported).toBe(2);
      expect(answer.answer).toContain("ChatGPT: 1 conversation");
      expect(answer.answer).toContain("Claude: 1 conversation");
      expect(require("node:fs").existsSync(join(root, "02 Sources/Imports/ChatGPT"))).toBe(true);
      expect(require("node:fs").existsSync(join(root, "02 Sources/Imports/Claude"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("unrecognized conversations fail politely instead of guessing", () => {
    const { store, root } = storeOf();
    try {
      const answer = importChatExport(store, JSON.stringify([{ title: "mystery", some: "shape" }]), "2026-10-19T00:00:00.000Z");
      expect(answer.imported).toBe(0);
      expect(answer.failed).toHaveLength(1);
      expect(answer.failed[0].reason).toContain("no conversation id or message map");
      expect(require("node:fs").existsSync(join(root, "02 Sources"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
