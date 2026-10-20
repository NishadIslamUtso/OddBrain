/* Site-specific, passive readers. No account tokens, hidden application stores,
 * clicks, scrolling, network interception, or draft reads. Add a definition here
 * and its manifest/permission entry to support another site; never eval user code.
 */
(function (root) {
  const PRIVATE =
    'form,textarea,input,select,[contenteditable]:not([contenteditable="false"]),script,style,noscript,template,[hidden],[aria-hidden="true"],[data-private],[data-view-once="true"],[data-restricted="true"],[data-oddbrain]';
  const COMMON_AI =
    '[data-message-author-role], [data-role="user"], [data-role="assistant"]';
  const sites = [
    {
      id: "chatgpt",
      name: "ChatGPT",
      hosts: ["chatgpt.com", "chat.openai.com"],
      kind: "ai",
      path: /\/(?:c|share)\/[^/]+/,
      selectors: ["[data-message-author-role]"],
    },
    {
      id: "claude",
      name: "Claude",
      hosts: ["claude.ai"],
      kind: "ai",
      path: /\/(?:chat|share)\/[^/]+/,
      selectors: [
        '[data-testid="user-message"], .font-claude-message',
        COMMON_AI,
      ],
    },
    {
      id: "gemini",
      name: "Gemini",
      hosts: ["gemini.google.com"],
      kind: "ai",
      path: /\/(?:app|share)\/[^/]+/,
      selectors: ["user-query, model-response", COMMON_AI],
    },
    {
      id: "aistudio",
      name: "Google AI Studio",
      hosts: ["aistudio.google.com"],
      kind: "ai",
      path: /\/prompts\/[^/]+/,
      selectors: ["ms-chat-turn", COMMON_AI],
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      hosts: ["chat.deepseek.com", "www.deepseek.com"],
      kind: "ai",
      path: /\/(?:a\/chat\/s|chat|share)\/[^/]+/,
      selectors: [COMMON_AI, ".ds-message"],
    },
    {
      id: "arena",
      name: "Arena",
      hosts: ["arena.ai", "www.arena.ai", "lmarena.ai"],
      kind: "ai",
      path: /\/(?:c|chat)\/[^/]+/,
      selectors: [
        COMMON_AI,
        '[data-testid="user-message"], [data-testid="assistant-message"]',
        "main ol > div.w-full.flex, main ol > div.w-full:not(.flex) .flex.flex-col.gap-3",
      ],
    },
    {
      id: "glm",
      name: "GLM / Z.ai",
      hosts: ["chat.z.ai", "chatglm.cn"],
      kind: "ai",
      path: /\/(?:c|chat|main)\/[^/]+/,
      selectors: [COMMON_AI, ".user-message, .assistant-message"],
    },
    {
      id: "kimi",
      name: "Kimi",
      hosts: ["www.kimi.com", "kimi.com", "kimi.moonshot.cn"],
      kind: "ai",
      path: /\/chat\/[^/]+/,
      selectors: [
        COMMON_AI,
        ".chat-content-item, .chat-content-item-assistant",
      ],
    },
    {
      id: "grok",
      name: "Grok",
      hosts: ["grok.com"],
      kind: "ai",
      path: /\/(?:c|chat)\/[^/]+/,
      selectors: [
        COMMON_AI,
        ".relative.group.flex.flex-col.justify-center.w-full:has(.message-bubble)",
        ".message-bubble",
      ],
    },
    {
      id: "qwen",
      name: "Qwen",
      hosts: ["chat.qwen.ai"],
      kind: "ai",
      path: /\/c\/[^/]+/,
      selectors: [
        COMMON_AI,
        ".qwen-chat-message-user, .qwen-chat-message-assistant",
        ".chat-user, .chat-assistant",
      ],
    },
    {
      id: "mistral",
      name: "Mistral Le Chat",
      hosts: ["chat.mistral.ai"],
      kind: "ai",
      path: /\/chat\/[^/]+/,
      selectors: [
        COMMON_AI,
        '[data-testid="user-message"], [data-testid="assistant-message"]',
      ],
    },
    {
      id: "perplexity",
      name: "Perplexity",
      hosts: ["www.perplexity.ai", "perplexity.ai"],
      kind: "ai",
      path: /\/search\/[^/]+/,
      selectors: [COMMON_AI, '[data-testid="query"], [data-testid="answer"]'],
    },
    {
      id: "copilot",
      name: "Copilot",
      hosts: ["copilot.microsoft.com"],
      kind: "ai",
      path: /\/(?:chats|conversations)\/[^/]+/,
      selectors: [
        COMMON_AI,
        '[data-content="user-message"], [data-content="ai-message"]',
      ],
    },
    {
      id: "poe",
      name: "Poe",
      hosts: ["poe.com"],
      kind: "ai",
      path: /\/(?:chat|s)\/[^/]+/,
      selectors: [COMMON_AI, '[class*="ChatMessage_messageRow"]'],
    },
    {
      id: "messenger",
      name: "Messenger",
      hosts: ["www.messenger.com", "messenger.com", "www.facebook.com"],
      kind: "messages",
      path: /\/(?:messages\/)?t\/[^/]+/,
      selectors: [
        '[role="main"] [data-message-id]',
        '[role="main"] [role="row"]',
      ],
    },
    {
      id: "instagram",
      name: "Instagram",
      hosts: ["www.instagram.com", "instagram.com"],
      kind: "messages",
      path: /\/direct\/t\/[^/]+/,
      selectors: [
        '[role="main"] [data-message-id]',
        '[role="main"] [role="row"]',
      ],
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      hosts: ["web.whatsapp.com"],
      kind: "messages",
      selectors: ["#main [data-id]"],
    },
    {
      id: "slack",
      name: "Slack",
      hosts: ["app.slack.com"],
      kind: "messages",
      path: /\/client\/[^/]+\/[^/]+/,
      selectors: [
        "[data-message-id]",
        "[data-item-key] .c-message_kit__message",
      ],
    },
    {
      id: "discord",
      name: "Discord",
      hosts: ["discord.com"],
      kind: "messages",
      path: /\/channels\/(?:@me|\d+)\/\d+/,
      selectors: ['[id^="chat-messages-"]'],
    },
    {
      id: "classroom",
      name: "Google Classroom",
      hosts: ["classroom.google.com"],
      kind: "classroom",
      path: /\/c\/[^/]+/,
      selectors: ["[data-stream-item-id]", "[data-announcement-id]"],
    },
  ];
  function siteFor(href) {
    try {
      const u = new URL(href);
      return u.protocol === "https:"
        ? sites.find((s) => s.hosts.includes(u.hostname)) || null
        : null;
    } catch {
      return null;
    }
  }
  function visible(el) {
    if (!el?.isConnected || el.closest(PRIVATE)) return false;
    for (let n = el; n; n = n.parentElement) {
      const style = n.ownerDocument.defaultView.getComputedStyle(n);
      const rect = n.getBoundingClientRect();
      const clipped = style.clipPath === "inset(100%)" || /rect\(0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?\)/i.test(style.clip || "");
      const transparentText = style.color === "transparent" || /rgba?\([^)]*,\s*0\s*\)$/i.test(style.color || "") || style.webkitTextFillColor === "transparent";
      const collapsedTransform = /(?:scale(?:X|Y)?\(0(?:[),])|matrix\(0,\s*0,\s*0,\s*0,)/i.test(style.transform || "");
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        style.contentVisibility === "hidden" ||
        style.opacity !== "" && Number(style.opacity) === 0 ||
        Number.parseFloat(style.fontSize || "16") < 2 ||
        clipped ||
        transparentText ||
        collapsedTransform ||
        ((rect.width <= 1 || rect.height <= 1) && [style.overflow, style.overflowX, style.overflowY].some(value => ["hidden", "clip"].includes(value)))
      )
        return false;
    }
    return true;
  }
  const select = (el, selectors) => {
    try {
      return el.querySelector(selectors);
    } catch {
      return null;
    }
  };
  const value = (el, selectors) => {
    const n = select(el, selectors);
    return n && visible(n) ? n.textContent.trim() : "";
  };
  function safeURL(raw, base, media = false) {
    try {
      const u = new URL(raw, base);
      if (media && u.protocol === "blob:")
        return u.origin === new URL(base).origin ? u.href : "";
      if (media && u.protocol === "data:")
        return /^data:(image|audio|video)\//i.test(raw) ? raw : "";
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(
          u.hostname,
        ) ||
        !u.hostname.includes(".")
      )
        return "";
      return u.href;
    } catch {
      return "";
    }
  }
  function markdown(el, base) {
    function walk(n) {
      if (n.nodeType === 3) return n.nodeValue;
      if (
        n.nodeType !== 1 ||
        !visible(n) ||
        n.matches('button,nav,svg,[role="button"],img,audio,video')
      )
        return "";
      const tag = n.tagName.toLowerCase();
      const inner = [...n.childNodes].map(walk).join("");
      if (tag === "pre") {
        const fence = "`".repeat(
          Math.max(
            3,
            ...[...inner.matchAll(/`+/g)].map((m) => m[0].length + 1),
          ),
        );
        return `\n\n${fence}\n${inner.replace(/^\n|\n$/g, "")}\n${fence}\n\n`;
      }
      if (tag === "code" && n.parentElement?.tagName !== "PRE")
        return "`" + inner + "`";
      if (tag === "br") return "\n";
      if (tag === "a") {
        const url = safeURL(n.getAttribute("href") || "", base);
        return url ? `[${inner || url}](${url})` : inner;
      }
      if (tag === "li") return `\n- ${inner.trim()}`;
      if (tag === "blockquote")
        return (
          "\n" +
          inner
            .trim()
            .split("\n")
            .map((l) => "> " + l)
            .join("\n") +
          "\n"
        );
      if (/^h[1-6]$/.test(tag))
        return (
          "\n\n" + "#".repeat(Number(tag[1])) + " " + inner.trim() + "\n\n"
        );
      if (tag === "strong" || tag === "b") return "**" + inner + "**";
      if (tag === "em" || tag === "i") return "*" + inner + "*";
      if (tag === "td" || tag === "th") return inner + " | ";
      if (tag === "tr") return "\n| " + inner;
      if (["p", "div", "section", "article"].includes(tag))
        return "\n" + inner + "\n";
      return inner;
    }
    // Do not collapse whitespace globally: indentation and blank lines in code are data.
    return walk(el).trim();
  }
  async function sha(input) {
    const bytes =
      typeof input === "string" ? new TextEncoder().encode(input) : input;
    return [
      ...new Uint8Array(await root.crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  function roleOf(el) {
    const attr = [
      el.getAttribute("data-message-author-role"),
      el.getAttribute("data-role"),
      el.getAttribute("data-author"),
    ].find((v) => ["user", "assistant", "system", "tool"].includes(v));
    if (attr) return attr;
    if (
      el.matches(".chat-content-item-assistant") ||
      el.querySelector(".ds-assistant-message-main-content")
    )
      return "assistant";
    if (el.matches(".chat-content-item") && el.querySelector(".user-content"))
      return "user";
    if (
      el.matches(
        'user-query,[data-testid="user-message"],[data-content="user-message"],.user-message,.chat-user,.qwen-chat-message-user,[data-testid="query"]',
      )
    )
      return "user";
    if (
      el.matches(
        'model-response,.font-claude-message,[data-testid="assistant-message"],[data-content="ai-message"],.assistant-message,.chat-assistant,.qwen-chat-message-assistant,[data-testid="answer"]',
      )
    )
      return "assistant";
    if (
      el.matches(".message-out") ||
      el.querySelector(".message-out") ||
      el.closest(".message-out")
    )
      return "self";
    if (
      el.matches(".message-in") ||
      el.querySelector(".message-in") ||
      el.closest(".message-in")
    )
      return "other";
    return "unknown";
  }
  function nativeId(el) {
    const attrs = [
      "data-message-id",
      "data-msg-id",
      "data-id",
      "data-stream-item-id",
      "data-announcement-id",
    ];
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (v && v.length < 900) return v;
    }
    const own = el.id;
    if (own && /(?:message|turn|query|response)/i.test(own) && own.length < 900)
      return own;
    const turn = el.closest(
      '[data-testid^="conversation-turn-"],[data-item-key]',
    );
    const shared =
      turn?.getAttribute("data-item-key") ||
      turn?.getAttribute("data-testid") ||
      "";
    return shared ? shared + ":" + roleOf(el) : "";
  }
  function titleFor(doc, site, url) {
    const explicit = value(
      doc,
      '[data-conversation-title], [data-testid="conversation-title"], #main header [title], [role="main"] header h1',
    );
    if (explicit) return { title: explicit, source: "conversation-heading" };
    // The selected conversation's sidebar title is often more accurate than the browser tab.
    const links = [...doc.querySelectorAll("a[href]")].filter(
      (n) =>
        visible(n) &&
        safeURL(n.getAttribute("href"), url)?.split("?")[0] ===
          url.split("?")[0],
    );
    const selected =
      links.find((n) => n.getAttribute("aria-current") === "page") ||
      links.find((n) => n.closest("nav,aside"));
    if (selected?.textContent.trim())
      return {
        title: selected.textContent.trim(),
        source: "conversation-link",
      };
    const tab = doc.title
      .replace(
        new RegExp(
          "\\s*[-–—|]\\s*(?:" +
            site.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            ")\\s*$",
          "i",
        ),
        "",
      )
      .trim();
    return {
      title: tab || site.name + " conversation",
      source: "browser-title",
    };
  }
  async function read(doc, href) {
    const site = siteFor(href);
    if (!site)
      return {
        supported: false,
        reason: "No conversation reader for this site yet.",
      };
    const u = new URL(href);
    let path = u.pathname.replace(/\/+$/, "") || "/";
    let key = site.path?.exec(path)?.[0] || "";
    if (site.id === "whatsapp") {
      const node = select(doc, "#main [data-id]");
      const jid = node
        ?.getAttribute("data-id")
        ?.match(/^(?:true|false)_([^_]+)_/)?.[1];
      if (jid) key = "chat/" + jid;
    }
    // Some providers put the persistent chat ID in the query rather than the path.
    if (!key && site.kind === "ai") {
      for (const param of [
        "chat",
        "chat_id",
        "conversation",
        "conversation_id",
        "cid",
      ]) {
        const v = u.searchParams.get(param);
        if (v && /^[\w-]{6,200}$/.test(v)) {
          key = path + "?" + param + "=" + v;
          break;
        }
      }
    }
    if (!key || /\/(?:new|temporary)$/.test(key))
      return {
        supported: true,
        site,
        reason:
          "Open a saved conversation. Waiting for a stable conversation address; inbox/home pages are not read.",
      };
    const canonical =
      u.origin +
      (key.startsWith("/") ? key : path) +
      (key.includes("?") && !key.startsWith("/")
        ? "?" + key.split("?")[1]
        : "");
    let elements = [];
    for (const selector of site.selectors) {
      const found = [...doc.querySelectorAll(selector)].filter(visible);
      if (found.length) {
        elements = found.filter(
          (n) => !found.some((other) => other !== n && other.contains(n)),
        );
        break;
      }
    }
    const heading = titleFor(doc, site, canonical);
    const conversation = {
      provider: site.name,
      adapter: site.id,
      key: site.id + ":" + u.origin + ":" + key,
      url: canonical,
      title: heading.title,
      title_source: heading.source,
    };
    const streaming = !![
      ...doc.querySelectorAll(
        '[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="Stop response"],button[aria-label="Stop generation"],.send-button-container.stop,.ds-loading,[data-is-streaming="true"]',
      ),
    ].find(visible);
    const messages = [],
      media = new Map(),
      occurrences = new Map();
    for (const [index, el] of elements.entries()) {
      let role = roleOf(el);
      if (site.id === "grok" && role === "unknown") {
        const wrapper = el.matches(
          ".relative.group.flex.flex-col.justify-center.w-full",
        )
          ? el
          : el.closest(".relative.group.flex.flex-col.justify-center.w-full");
        if (wrapper?.classList.contains("items-end")) role = "user";
        else if (wrapper?.classList.contains("items-start")) role = "assistant";
      }
      const body =
        (site.id === "grok" ? select(el, ".message-bubble") : null) ||
        select(
          el,
          '[data-message-content],.c-message_kit__blocks,[id^="message-content-"],.selectable-text',
        ) ||
        el;
      const content = markdown(body, href);
      const attachments = [];
      const candidates = [
        ...el.querySelectorAll(
          'img,video,audio,a[download],a[data-attachment-id],[data-attachment-name],a[href*="/backend-api/files/"],a[href*="/attachments/"],a[href^="https://drive.google.com/file/"],a[href^="https://docs.google.com/"]',
        ),
      ];
      for (const n of candidates) {
        if (
          !visible(n) ||
          n.closest("header,[data-avatar]") ||
          /avatar|profile picture/i.test(
            [n.className, n.getAttribute("alt")].join(" "),
          )
        )
          continue;
        const tag = n.tagName.toLowerCase();
        const kind =
          tag === "img"
            ? "image"
            : ["audio", "video"].includes(tag)
              ? tag
              : "file";
        let raw =
          kind === "file"
            ? n.getAttribute("href") || ""
            : n.currentSrc ||
              n.getAttribute("src") ||
              select(n, "source")?.getAttribute("src") ||
              "";
        const originalLink =
          n.closest("a[download]")?.getAttribute("href") ||
          n.getAttribute("data-original-src");
        if (originalLink) raw = originalLink;
        // Never click a download/play button or treat a thumbnail as the full video.
        raw = safeURL(raw, href, true);
        const name =
          n.getAttribute("download") ||
          n.getAttribute("data-attachment-name") ||
          n.getAttribute("alt") ||
          n.getAttribute("title") ||
          kind;
        const aid = await sha(
          `${conversation.key}\n${nativeId(el) || ""}\n${n.getAttribute("data-attachment-id") || raw || name}`,
        );
        if (attachments.some((a) => a.id === aid)) continue;
        const a = {
          id: aid,
          kind,
          name,
          url: raw.startsWith("data:") ? "inline-data:" + aid : raw,
          mime:
            n.getAttribute("type") ||
            select(n, "source")?.getAttribute("type") ||
            "",
          representation:
            originalLink || n.hasAttribute("download")
              ? "download"
              : raw
                ? "rendered-resource"
                : "reference-only",
        };
        attachments.push(a);
        media.set(aid, { url: raw, kind, name });
      }
      if (!content && !attachments.length) continue;
      let mid = nativeId(el),
        identity = "native";
      // Never invent a stable ID from a DOM position: virtualization, branches
      // and prepended history can reuse that position for a different message.
      // Without native IDs, retain explicitly uncertain content observations.
      if (!mid) {
        const fingerprint = await sha(
          role + "\n" + content + "\n" + JSON.stringify(attachments),
        );
        const count = occurrences.get(fingerprint) || 0;
        occurrences.set(fingerprint, count + 1);
        mid = "observed:" + fingerprint + ":" + count;
        identity = "content";
      }
      // Arena alternatives need separate IDs even when a shared turn wraps both models.
      const model =
        el.getAttribute("data-model-name") ||
        value(el, '[data-testid="model-name"],[data-model-name]');
      if (site.id === "arena" && role === "assistant")
        mid += ":" + (el.getAttribute("data-side") || index);
      const prePlain = (
        el.getAttribute("data-pre-plain-text") ||
        select(el, "[data-pre-plain-text]")?.getAttribute(
          "data-pre-plain-text",
        ) ||
        ""
      ).match(/^\[([^\]]+)\]\s*(.*?):\s*$/);
      const m = {
        id: mid,
        role,
        speaker:
          el.getAttribute("data-sender-name") ||
          value(
            el,
            '[data-testid="message-author"],.c-message__sender,.c-message_kit__sender,[id^="message-username-"]',
          ) ||
          prePlain?.[2] ||
          "",
        text: content,
        timestamp:
          select(el, "time")?.getAttribute("datetime") ||
          el.getAttribute("data-timestamp") ||
          prePlain?.[1] ||
          "",
        reply_to:
          el.getAttribute("data-reply-to") ||
          el.getAttribute("data-thread-ts") ||
          "",
        model,
        identity,
        status: streaming && role === "assistant" ? "streaming" : "observed",
        attachments,
      };
      messages.push(m);
    }
    return {
      supported: true,
      site,
      conversation,
      messages,
      media,
      streaming,
      uncertain:
        messages.some((m) => m.identity !== "native" || m.role === "unknown") ||
        heading.source === "browser-title",
      reason: messages.length
        ? ""
        : "No readable messages found. This layout may need an adapter update.",
    };
  }
  root.OddConversations = {
    sites,
    siteFor,
    read,
    sha,
    markdown,
    visible,
    safeURL,
  };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.OddConversations;
})(globalThis);
