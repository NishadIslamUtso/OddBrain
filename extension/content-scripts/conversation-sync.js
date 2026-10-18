/* Passive, resumable open-conversation sync. The app's disk receipts, not a
 * browser cache, decide what is saved. The tab must stay open for unsent data. */
(() => {
  if (globalThis.__oddConversationSync || chrome.extension?.inIncognitoContext)
    return;
  globalThis.__oddConversationSync = true;
  const reader = globalThis.OddConversations;
  if (!reader?.siteFor(location.href)) return;
  let dirty = true,
    busy = false,
    stopped = false,
    timer,
    observer,
    host,
    shadow,
    label,
    detail,
    bar,
    pause;
  let prefs = {},
    pending = false,
    run = 0,
    seenURL = location.href,
    lastCheck = 0;
  let activeAbort = null;
  const retryAt = new Map();
  const send = (msg) => chrome.runtime.sendMessage(msg);
  const el = (tag, text) => {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    return n;
  };
  function enabled(site) {
    if (!site) return false;
    return (
      prefs.conversationPaused !== true &&
      (site.kind === "ai"
        ? prefs.autoCaptureAi !== false
        : prefs.conversationSites?.[site.id] === true)
    );
  }
  async function mount() {
    if (host?.isConnected) return;
    host = el("div");
    host.dataset.oddbrain = "conversation-progress";
    shadow = host.attachShadow({ mode: "closed" });
    const style = el("style");
    style.textContent = `:host{all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483645;--color-bg:#fff;--color-ink:#25262b;--color-muted:#646771;--color-line:#d8dadc;--color-accent:#333943;--font-sans:system-ui,sans-serif;color:var(--color-ink);font:12px var(--font-sans)}*{box-sizing:border-box}.box{width:min(330px,calc(100vw - 32px));padding:12px 14px;background:var(--color-bg);border:1px solid var(--color-line);border-radius:var(--ob-control-radius,8px)}.row{display:flex;gap:10px;align-items:baseline;justify-content:space-between}strong{font-weight:600;font-size:13px}p{line-height:1.5;margin:7px 0 0;color:var(--color-muted);overflow-wrap:anywhere}progress{display:block;width:100%;height:5px;accent-color:var(--color-accent);margin-top:10px}button{font:inherit;color:inherit;background:none;border:0;text-decoration:underline;cursor:pointer;padding:4px}button:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}`;
    const box = el("section");
    box.className = "box";
    box.setAttribute("aria-label", "OddBrain conversation saving");
    const row = el("div");
    row.className = "row";
    label = el("strong", "OddBrain · Checking conversation");
    pause = el("button", "Pause");
    pause.type = "button";
    pause.onclick = async () => {
      await chrome.storage.local.set({
        conversationPaused: !prefs.conversationPaused,
      });
    };
    row.append(label, pause);
    detail = el("p");
    detail.setAttribute("role", "status");
    bar = el("progress");
    bar.max = 1;
    bar.value = 0;
    bar.setAttribute("aria-label", "Observed messages saved");
    box.append(row, bar, detail);
    shadow.append(style, box);
    document.documentElement.append(host);
    if (globalThis.OddAppearance)
      OddAppearance.apply(prefs.appAppearance, host);
  }
  async function status(state, text, done = 0, total = 0, media = "") {
    await mount();
    label.textContent = "OddBrain · " + state;
    detail.textContent = text;
    bar.max = Math.max(1, total);
    bar.value = Math.min(done, total || 0);
    bar.hidden = !total;
    pause.textContent = prefs.conversationPaused ? "Resume" : "Pause";
    // Progress metadata only, in session storage. No message bodies or attachment URLs.
    await send({
      type: "ob-conversation-progress",
      status: {
        state,
        detail: text,
        saved: done,
        total,
        media,
        at: Date.now(),
        url: location.href,
      },
    }).catch(() => {});
  }
  function current(epoch, url) {
    return (
      !stopped &&
      epoch === run &&
      location.href === url &&
      enabled(reader.siteFor(url))
    );
  }
  async function request(payload, epoch, url) {
    if (!current(epoch, url))
      throw Error(
        "Page changed or collection paused. Resume on the conversation to continue.",
      );
    const result = await send({
      type: "ob-conversation-sync",
      payload: { ...payload, url },
    });
    if (!result?.ok)
      throw Error(
        result?.error ||
          result?.reason ||
          "App unavailable. Keep this tab open; saving will retry.",
      );
    return result;
  }
  function base64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  async function saveMedia(snapshot, message, attachment, epoch, url) {
    const common = {
      conversation: snapshot.conversation,
      message_id: message.id,
      attachment_id: attachment.id,
    };
    const before = await request({ ...common, op: "media-state" }, epoch, url);
    if (before.saved) return true;
    const original = snapshot.media.get(attachment.id)?.url;
    if (!original)
      throw Error("The attachment has no accessible download address.");
    if (!reader.safeURL(original, url, true))
      throw Error("The attachment address is not safe to fetch.");
    const controller = new AbortController();
    activeAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let response;
    try {
      // Content-script fetch obeys the site's origin/CORS rules. No credentials
      // are extracted, and no worker proxy bypasses an inaccessible attachment.
      response = await fetch(original, {
        credentials: "same-origin",
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok)
        throw Error("Attachment download refused (" + response.status + ").");
      const expected = Number(response.headers.get("content-length")) || 0;
      if (expected > 256 * 1024 * 1024)
        throw Error("Attachment is over the 256 MB transfer limit.");
      const mime = (
        response.headers.get("content-type") ||
        attachment.mime ||
        "application/octet-stream"
      )
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (
        /text\/html|application\/xhtml/i.test(mime) ||
        (mime === "application/json" && !/\.json$/i.test(attachment.name))
      )
        throw Error("The site returned a page, not the original attachment.");
      const stream = response.body?.getReader();
      if (!stream)
        throw Error("This attachment cannot be streamed by the browser.");
      const partSize = 512 * 1024,
        parts = [];
      let pendingBytes = new Uint8Array(0),
        size = 0;
      const part = async (bytes) => {
        const checksum = await reader.sha(bytes);
        await request(
          {
            ...common,
            op: "media-part",
            index: parts.length,
            hash: checksum,
            data: base64(bytes),
          },
          epoch,
          url,
        );
        parts.push(checksum);
      };
      try {
        while (true) {
          if (!current(epoch, url))
            throw Error("Collection paused or conversation changed.");
          const { done, value } = await stream.read();
          if (done) break;
          size += value.byteLength;
          if (size > 256 * 1024 * 1024)
            throw Error("Attachment is over the 256 MB transfer limit.");
          const bytes = new Uint8Array(pendingBytes.length + value.length);
          bytes.set(pendingBytes);
          bytes.set(value, pendingBytes.length);
          let offset = 0;
          while (bytes.length - offset >= partSize) {
            await part(bytes.subarray(offset, offset + partSize));
            offset += partSize;
          }
          pendingBytes = bytes.slice(offset);
        }
        if (pendingBytes.length) await part(pendingBytes);
      } finally {
        await stream.cancel().catch(() => {});
      }
      if (!size) throw Error("The attachment was empty.");
      await request(
        { ...common, op: "media-finish", mime, size, parts },
        epoch,
        url,
      );
      return true;
    } finally {
      clearTimeout(timeout);
      controller.abort();
      if (activeAbort === controller) activeAbort = null;
    }
  }
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    dirty = false;
    const epoch = run,
      url = location.href;
    try {
      prefs = await chrome.storage.local.get({
        autoCaptureAi: true,
        conversationSites: {},
        conversationPaused: false,
        appAppearance: null,
      });
      const site = reader.siteFor(url);
      if (!site || !enabled(site)) {
        pending = false;
        if (host && prefs.conversationPaused)
          await status(
            "Paused",
            "Resume to save new messages and attachments.",
          );
        else {
          host?.remove();
          host = null;
        }
        return;
      }
      const access = await send({ type: "ob-conversation-access", url });
      if (!access?.allowed) {
        pending = false;
        if (access?.excluded) {
          host?.remove();
          host = null;
          return;
        }
        await status(
          "Not saving",
          access?.error || "Pair with the desktop app to start saving.",
        );
        return;
      }
      const snapshot = await reader.read(document, url);
      if (!current(epoch, url)) return;
      if (!snapshot.messages?.length) {
        pending = false;
        await status("Waiting", snapshot.reason || "Open a conversation.");
        return;
      }
      const messages = snapshot.messages,
        total = messages.length;
      pending = true;
      let done = 0;
      await status(
        "Saving conversation",
        `${snapshot.conversation.title}\nChecking saved messages…`,
        done,
        total,
      );
      // Ask the vault on every scan. A vault switch, cleared data or worker restart
      // cannot make a stale browser-side checkpoint suppress a write.
      for (let start = 0; start < total; start += 40) {
        const batch = messages.slice(start, start + 40);
        const checksums = Object.fromEntries(
          await Promise.all(
            batch.map(async (m) => [m.id, await reader.sha(JSON.stringify(m))]),
          ),
        );
        const known = await request(
          {
            op: "state",
            conversation: snapshot.conversation,
            ids: batch.map((m) => m.id),
            checksums,
          },
          epoch,
          url,
        );
        const changed = batch.filter(
          (m) =>
            known.hashes[m.id] !== checksums[m.id] &&
            known.seen?.[m.id] !== checksums[m.id],
        );
        // Small transport batches, but no substring cap. A very large message
        // is submitted alone; a refusal is shown, never disguised as a save.
        let group = [],
          bytes = 0;
        async function flush() {
          await request(
            {
              op: "messages",
              conversation: snapshot.conversation,
              messages: group,
              order: batch.map((m) => m.id),
            },
            epoch,
            url,
          );
          group = [];
          bytes = 0;
        }
        for (const m of changed) {
          const size = new TextEncoder().encode(JSON.stringify(m)).length;
          if (group.length && bytes + size > 1_000_000) await flush();
          group.push(m);
          bytes += size;
        }
        // Empty updates also carry title changes and observed ordering.
        await flush();
        done += batch.length;
        await status(
          "Messages saved",
          `${done} of ${total} loaded messages saved. Checking attachments…`,
          done,
          total,
        );
      }
      const attachments = messages.flatMap((m) =>
        m.attachments.map((a) => ({ m, a })),
      );
      let savedMedia = 0,
        missing = 0,
        problem = "";
      for (const { m, a } of attachments) {
        if (!current(epoch, url)) return;
        const retryKey = snapshot.conversation.key + ":" + a.id;
        const failure = retryAt.get(retryKey);
        if (failure && failure.at > Date.now()) {
          missing++;
          problem = failure.reason;
          continue;
        }
        await status(
          "Saving attachments",
          `${savedMedia} of ${attachments.length} files saved. Keep this tab open.`,
          done,
          total,
        );
        try {
          await saveMedia(snapshot, m, a, epoch, url);
          savedMedia++;
          retryAt.delete(retryKey);
        } catch (error) {
          if (!current(epoch, url)) return;
          missing++;
          problem = error.message;
          retryAt.set(retryKey, { at: Date.now() + 60_000, reason: problem });
        }
      }
      pending = missing > 0 || snapshot.streaming;
      const coverage = snapshot.uncertain
        ? "Some speaker, title or message identities are unverified. "
        : "";
      await status(
        missing
          ? "Attachments pending"
          : snapshot.streaming
            ? "Response arriving"
            : "Saved what’s loaded",
        `${total} messages · ${savedMedia}/${attachments.length} attachment files saved. ${missing ? problem + " " : ""}${coverage}Saved media is the resource exposed by the site; previews may not be originals. Older history and other conversations are not checked.`,
        done,
        total,
        `${savedMedia}/${attachments.length}`,
      );
    } catch (error) {
      if (current(epoch, url)) {
        pending = true;
        await status(
          "Saving interrupted",
          error.message + " Keep this tab open; OddBrain will retry.",
        );
      }
    } finally {
      busy = false;
      lastCheck = Date.now();
    }
  }
  function schedule() {
    clearTimeout(timer);
    // Continuous streaming cannot postpone a checkpoint forever.
    timer = setTimeout(
      () => void tick(),
      Math.max(600, 3000 - (Date.now() - lastCheck)),
    );
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (
      changes.conversationPaused ||
      changes.autoCaptureAi ||
      changes.conversationSites ||
      changes.pairToken ||
      changes.appPort
    ) {
      run++;
      dirty = true;
      activeAbort?.abort();
      for (const [k, v] of Object.entries(changes)) prefs[k] = v.newValue;
      schedule();
    }
    if (changes.appAppearance && host && globalThis.OddAppearance)
      OddAppearance.apply(changes.appAppearance.newValue, host);
  });
  observer = new MutationObserver((records) => {
    if (
      records.some(
        (r) =>
          !(
            r.target.nodeType === 1 ? r.target : r.target.parentElement
          )?.closest(
            '[data-oddbrain],form,textarea,input,[contenteditable]:not([contenteditable="false"])',
          ),
      )
    ) {
      dirty = true;
      if (host && enabled(reader.siteFor(location.href))) {
        pending = true;
        if (!busy) {
          label.textContent = "OddBrain · Changes detected";
          detail.textContent =
            "Checking new content. Keep this tab open while it is saved.";
        }
      }
      schedule();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "src",
      "href",
      "data-is-streaming",
      "data-message-id",
      "aria-busy",
    ],
  });
  const interval = setInterval(() => {
    if (!chrome.runtime?.id) {
      stopped = true;
      observer.disconnect();
      clearInterval(interval);
      host?.remove();
      return;
    }
    if (location.href !== seenURL) {
      seenURL = location.href;
      run++;
      activeAbort?.abort();
      pending = false;
      retryAt.clear();
      dirty = true;
    }
    if (dirty || pending || Date.now() - lastCheck > 30000) void tick();
  }, 6000);
  // Best-effort close warning, not a promise that a browser will keep a tab alive.
  window.addEventListener("beforeunload", (event) => {
    if (pending) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("pagehide", () => {
    run++;
    activeAbort?.abort();
  });
  void tick();
})();
