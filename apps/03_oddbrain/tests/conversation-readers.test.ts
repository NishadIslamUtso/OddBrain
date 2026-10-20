// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { webcrypto, createHash } from "node:crypto";
const require = createRequire(import.meta.url);
Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});
const reader = require("../../../extension/lib/conversation-adapters.js");
beforeEach(() => {
  document.body.innerHTML = "";
  document.title = "Chat title - ChatGPT";
});
const read = (url = "https://chatgpt.com/c/abc") => reader.read(document, url);
describe("site-specific passive conversation readers (synthetic DOM, not live sites)", () => {
  it("preserves full messages, short replies, code formatting, roles and canonical titles", async () => {
    document.body.innerHTML =
      '<nav><a href="/c/abc" aria-current="page">Real conversation title</a></nav><div data-message-id="m1" data-message-author-role="user">hi</div><div data-message-id="m2" data-message-author-role="assistant"><pre><code>  a = 1\n\n    b = 2</code></pre><p>' +
      "x".repeat(65000) +
      "</p></div>";
    const result = await read();
    expect(result.messages).toHaveLength(2);
    expect(result.conversation.title).toBe("Real conversation title");
    expect(result.messages[0].text).toBe("hi");
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[1].text).toContain("x".repeat(65000));
    expect(result.messages[1].text).toContain("a = 1\n\n    b = 2");
    expect(result.messages[0].timestamp).toBe("");
  });
  it("excludes hidden ancestors, editors and unsent drafts from text and attachments", async () => {
    document.body.innerHTML =
      '<div style="display:none"><div data-message-author-role="user">SECRET_ANCESTOR</div></div><div data-message-id="ok" data-message-author-role="user">Submitted<span style="color:rgb(0,0,0)">PUBLIC_BLACK_TEXT</span><form>SECRET_FORM<img src="https://chatgpt.com/secret.png"></form><div contenteditable="true">SECRET_DRAFT</div><span hidden>SECRET_HIDDEN</span><span data-private>SECRET_PRIVATE</span><button>SECRET_BUTTON</button><span style="visibility:hidden">SECRET_CSS</span><span style="opacity:0">SECRET_OPACITY</span><span style="font-size:0">SECRET_TINY</span><span style="color:transparent">SECRET_TRANSPARENT</span><span style="transform:scale(0)">SECRET_SCALE</span></div>';
    const result = await read();
    expect(result.messages).toHaveLength(1);
    expect(JSON.stringify(result.messages)).not.toContain("SECRET");
    expect(result.messages[0].text).toContain("PUBLIC_BLACK_TEXT");
    expect(result.messages[0].attachments).toEqual([]);
  });
  it("recognizes explicitly submitted images, video, audio and download links without mistaking links for files", async () => {
    document.body.innerHTML =
      '<div data-message-id="m" data-message-author-role="user"><img src="https://chatgpt.com/image.png" alt="Uploaded image"><video src="https://chatgpt.com/video.mp4"></video><audio src="blob:https://chatgpt.com/voice"></audio><a download="notes.pdf" href="https://chatgpt.com/notes.pdf">Notes</a><a href="https://example.com/">Citation</a><img class="avatar" src="https://chatgpt.com/avatar.png"></div>';
    const result = await read();
    expect(result.messages[0].attachments.map((a: any) => a.kind)).toEqual([
      "image",
      "video",
      "audio",
      "file",
    ]);
    expect(result.media.size).toBe(4);
  });
  it("observes text and title edits with stable native identities and streaming state", async () => {
    document.body.innerHTML =
      '<div data-message-id="m" data-message-author-role="assistant">Working</div><button data-testid="stop-button">Stop</button>';
    const first = await read();
    expect(first.streaming).toBe(true);
    document.querySelector("[data-message-id]")!.textContent = "Finished";
    document.querySelector("button")!.remove();
    document.title = "New title - ChatGPT";
    const next = await read();
    expect(next.messages[0].id).toBe(first.messages[0].id);
    expect(next.messages[0].text).toBe("Finished");
    expect(next.streaming).toBe(false);
    expect(next.conversation.title).toBe("New title");
  });
  it("reads provider-specific Grok, Qwen and Kimi role structures without inferring the first speaker", async () => {
    document.body.innerHTML =
      '<div class="relative group flex flex-col justify-center w-full items-start"><div class="message-bubble">Answer first in loaded window</div></div><div class="relative group flex flex-col justify-center w-full items-end"><div class="message-bubble">Follow-up</div></div>';
    expect(
      (await read("https://grok.com/c/test")).messages.map((m: any) => m.role),
    ).toEqual(["assistant", "user"]);
    document.body.innerHTML =
      '<div class="qwen-chat-message-user">Prompt</div><div class="qwen-chat-message-assistant">Reply</div>';
    expect(
      (await read("https://chat.qwen.ai/c/test")).messages.map(
        (m: any) => m.role,
      ),
    ).toEqual(["user", "assistant"]);
    document.body.innerHTML =
      '<div class="chat-content-item"><div class="user-content">Prompt</div></div><div class="chat-content-item-assistant">Reply</div>';
    expect(
      (await read("https://kimi.com/chat/test")).messages.map(
        (m: any) => m.role,
      ),
    ).toEqual(["user", "assistant"]);
    document.body.innerHTML =
      '<div class="ds-message"><div class="ds-assistant-message-main-content">Reply</div></div>';
    expect(
      (await read("https://chat.deepseek.com/a/chat/s/test")).messages[0].role,
    ).toBe("assistant");
  });
  it("does not read Facebook posts, Instagram feeds or inbox previews as conversations", async () => {
    document.body.innerHTML =
      '<main role="main"><div role="row">PRIVATE_FEED</div></main>';
    for (const url of [
      "https://www.facebook.com/",
      "https://www.facebook.com/messages/t",
      "https://www.instagram.com/",
      "https://www.instagram.com/direct/inbox/?hl=en",
    ]) {
      const result = await read(url);
      expect(result.messages).toBeUndefined();
      expect(result.reason).toContain("Open a saved conversation");
    }
  });
  it("keeps human messages in their named thread, with sender, time and reply reference", async () => {
    document.title = "Family chat - Messenger";
    document.body.innerHTML =
      '<main role="main"><div data-message-id="msg" data-sender-name="Sam" data-timestamp="2026-10-18T10:00:00Z" data-reply-to="earlier">Hello</div></main>';
    const result = await read(
      "https://www.facebook.com/messages/t/123?ref=hello",
    );
    expect(result.conversation.url).toBe(
      "https://www.facebook.com/messages/t/123",
    );
    expect(result.messages[0]).toMatchObject({
      id: "msg",
      speaker: "Sam",
      reply_to: "earlier",
      timestamp: "2026-10-18T10:00:00Z",
      role: "unknown",
    });
  });
  it("recognizes WhatsApp chat identity without merging people by display name", async () => {
    document.body.innerHTML =
      '<div id="main"><div data-id="false_123@c.us_message1" class="message-in"><span class="selectable-text">Hi</span></div></div>';
    const result = await read("https://web.whatsapp.com/");
    expect(result.conversation.key).toContain("123@c.us");
    expect(result.messages[0].role).toBe("other");
    document
      .querySelector("[data-id]")!
      .setAttribute("data-id", "false_456@c.us_message1");
    expect((await read("https://web.whatsapp.com/")).conversation.key).not.toBe(
      result.conversation.key,
    );
  });
  it("keeps Arena alternatives distinct and never invents a hidden model name", async () => {
    document.body.innerHTML =
      '<div data-testid="conversation-turn-1"><div data-message-author-role="user">Question</div><div data-message-author-role="assistant" data-side="left">One</div><div data-message-author-role="assistant" data-side="right">Two</div></div>';
    const result = await read("https://arena.ai/c/test");
    expect(result.messages).toHaveLength(3);
    expect(new Set(result.messages.map((m: any) => m.id)).size).toBe(3);
    expect(result.messages[1].model).toBe("");
  });
  it("has adapters for all requested AI sites plus classroom and messages; host spoofing is refused", () => {
    for (const host of [
      "chat.deepseek.com",
      "arena.ai",
      "chat.z.ai",
      "kimi.com",
      "grok.com",
      "web.whatsapp.com",
      "app.slack.com",
      "discord.com",
      "classroom.google.com",
    ])
      expect(reader.siteFor("https://" + host)).toBeTruthy();
    expect(reader.siteFor("https://chatgpt.com.evil.example/c/a")).toBeNull();
    for (const url of [
      "http://localhost/x",
      "https://127.0.0.1/a",
      "https://192.168.1.2/a",
      "https://user:pass@example.com/a",
      "javascript:alert(1)",
      "blob:https://other.example/a",
    ])
      expect(reader.safeURL(url, "https://chatgpt.com", true)).toBe("");
  });
});
