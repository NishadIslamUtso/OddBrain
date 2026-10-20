/* Passive conversation capture. Writes receive durable browser receipts first;
 * only the desktop acknowledgement means saved to OddBrain. */
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
    unsafeToClose = false,
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
    bar.setAttribute("aria-label", "Capture progress");
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
          "Saving could not be confirmed. Keep this tab open and check the extension outbox.",
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
    if (before.saved) return { saved: true };
    if (before.staged) return { receipt: before.receipt };
    const knownParts = new Set(before.parts || []);
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
        lastProgress = 0,
        size = 0;
      const part = async (bytes) => {
        const checksum = await reader.sha(bytes);
        if (!knownParts.has(checksum))
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
        if (Date.now() - lastProgress > 700) {
          lastProgress = Date.now();
          await status(
            "Protecting attachment",
            `${attachment.name || "Attachment"}: ${(size / 1024 / 1024).toFixed(1)} MB read${expected ? " of " + (expected / 1024 / 1024).toFixed(1) + " MB" : ""}. Keep this tab open until the complete file is queued or saved.`,
            Math.min(size, expected),
            expected,
          );
        }
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
      const result = await request(
        { ...common, op: "media-finish", mime, size, parts },
        epoch,
        url,
      );
      return { receipt: result.receipt };
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
        unsafeToClose = false;
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
        unsafeToClose = false;
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
        unsafeToClose = false;
        await status("Waiting", snapshot.reason || "Open a conversation.");
        return;
      }
      const messages = snapshot.messages,
        total = messages.length;
      pending = true;
      unsafeToClose = true;
      let done = 0;
      const receipts = [];
      await status(
        "Saving conversation",
        `${snapshot.conversation.title}\nProtecting messages in this browser…`,
        done,
        total,
      );
      // Queue all observed text before waiting for the desktop. Replay checks
      // the vault's hashes and sends only changed bodies, not cached guesses.
      for (let start = 0; start < total; start += 40) {
        const batch = messages.slice(start, start + 40);
        const changed = batch;
        // Small transport batches, but no substring cap. A very large message
        // is submitted alone; a refusal is shown, never disguised as a save.
        let group = [],
          bytes = 0;
        async function flush() {
          const result = await request(
            {
              op: "messages",
              conversation: snapshot.conversation,
              messages: group,
              order: batch.map((m) => m.id),
            },
            epoch,
            url,
          );
          if (result.receipt) receipts.push(result.receipt);
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
          "Queued on this browser",
          `${done} of ${total} loaded messages protected in this browser. Checking attachments…`,
          done,
          total,
        );
      }
      const attachments = messages.flatMap((m) =>
        m.attachments.map((a) => ({ m, a })),
      );
      let savedMedia = 0,
        queuedMedia = 0,
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
          const result = await saveMedia(snapshot, m, a, epoch, url);
          if (result.saved) savedMedia++;
          else {
            queuedMedia++;
            receipts.push(result.receipt);
          }
          retryAt.delete(retryKey);
        } catch (error) {
          if (!current(epoch, url)) return;
          missing++;
          problem = error.message;
          retryAt.set(retryKey, { at: Date.now() + 60_000, reason: problem });
        }
      }
      const delivery = await request(
        { op: "delivery", conversation: snapshot.conversation, receipts },
        epoch,
        url,
      );
      const waiting = delivery.queued > 0;
      const receiptProblem = delivery.missing > 0 || delivery.problems?.length;
      if (!waiting && !receiptProblem) {
        savedMedia += queuedMedia;
        queuedMedia = 0;
      }
      pending = missing > 0 || snapshot.streaming || waiting || receiptProblem;
      unsafeToClose = missing > 0 || snapshot.streaming || receiptProblem;
      const coverage = snapshot.uncertain
        ? "Some speaker, title or message identities are unverified. "
        : "";
      await status(
        receiptProblem
          ? "Needs attention"
          : waiting
            ? "Queued on this browser"
            : missing
              ? "Attachments pending"
              : snapshot.streaming
                ? "Response arriving"
                : "Saved what’s loaded",
        `${total} loaded messages. ${waiting ? "Waiting captures are protected in this browser and will retry when OddBrain reconnects. " : receiptProblem ? "Some captures were cleared or refused; check the extension outbox. " : "Messages saved to OddBrain. "}${savedMedia}/${attachments.length} attachment files saved${queuedMedia ? "; " + queuedMedia + " complete files queued" : ""}. ${missing ? problem + " Reopen or keep this conversation open to finish missing files. " : ""}${delivery.problems?.[0] || ""} ${coverage}Older history and other conversations are not checked. Media may be previews, not originals.`,
        done,
        total,
        `${savedMedia}/${attachments.length}`,
      );
    } catch (error) {
      if (current(epoch, url)) {
        pending = true;
        await status(
          "Saving interrupted",
          error.message +
            " Already queued captures remain in this browser. Keep this tab open for anything not yet queued.",
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
      unsafeToClose = false;
      retryAt.clear();
      dirty = true;
    }
    if (dirty || pending || Date.now() - lastCheck > 30000) void tick();
  }, 6000);
  // Best-effort close warning, not a promise that a browser will keep a tab alive.
  window.addEventListener("beforeunload", (event) => {
    if (unsafeToClose) {
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
