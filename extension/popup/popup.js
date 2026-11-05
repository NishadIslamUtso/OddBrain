/* One interface for the toolbar popup, persistent side panel and settings tab. */
"use strict";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
document.body.classList.toggle("panel", params.has("panel"));
document.body.classList.toggle("options", params.has("settings"));
let mode = "page",
  draft = null,
  busy = false,
  capsules = [],
  currentAppearance = null,
  scenes = [],
  sceneWords = {},
  activeView = "save",
  sceneSequence = 0,
  syncBusy = false,
  windowId = null;
const api = (msg) => chrome.runtime.sendMessage(msg);
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = String(text);
  if (cls) n.className = cls;
  return n;
};
function action(text, fn, cls = "") {
  const b = node("button", text, cls);
  b.type = "button";
  b.addEventListener("click", () =>
    Promise.resolve()
      .then(fn)
      .catch((error) => notice(error.message, true)),
  );
  return b;
}
function notice(text, error = false) {
  $("notice").textContent = text;
  $("notice").hidden = !text;
  $("notice").dataset.error = String(error);
}
function bind(id, fn) {
  $(id).addEventListener("click", () =>
    Promise.resolve()
      .then(fn)
      .catch((e) => notice(e.message, true)),
  );
}
function confirmAction(title, message, label = "Continue") {
  const dialog = $("confirm-dialog");
  $("confirm-title").textContent = title;
  $("confirm-message").textContent = message;
  $("confirm-ok").textContent = label;
  dialog.showModal();
  return new Promise((resolve) => {
    const done = (answer) => {
      dialog.close();
      $("confirm-ok").onclick = null;
      $("confirm-cancel").onclick = null;
      dialog.oncancel = null;
      resolve(answer);
    };
    $("confirm-ok").onclick = () => done(true);
    $("confirm-cancel").onclick = () => done(false);
    dialog.oncancel = (e) => {
      e.preventDefault();
      done(false);
    };
    $("confirm-cancel").focus();
  });
}
async function scene(role = "idle", specific) {
  const sequence = ++sceneSequence;
  const fallback = {
    idle: "idle",
    searching: "lens-inspector",
    working: "type",
    done: "self-hug",
    waiting: "eye-roll",
  };
  let name = specific || currentAppearance?.roles?.[role];
  if (!scenes.includes(name)) name = fallback[role] || "idle";
  let svg;
  try {
    const response = await fetch("../assets/motion/" + name + ".svg");
    if (!response.ok) return;
    svg = await response.text();
  } catch {
    return;
  }
  const scale =
    (currentAppearance?.motion === "calm"
      ? 1.6
      : currentAppearance?.motion === "playful"
        ? 0.85
        : 1) / (currentAppearance?.speed || 1);
  // Only bundled original SVG is parsed. No page, capsule or server HTML here.
  svg = svg.replace(
    /(\d+(?:\.\d+)?)s(?=[\s;,)])/g,
    (_, seconds) => (Number(seconds) * scale).toFixed(3) + "s",
  );
  if (sequence !== sceneSequence) return;
  $("brain-art").innerHTML = svg;
  if (document.documentElement.dataset.still === "true") {
    // A newly mounted one-shot must not freeze with its limbs offscreen.
    // The original SVG's base pose is also its reduced-motion pose.
    $("brain-art")
      .querySelectorAll("*")
      .forEach((el) => el.style?.setProperty("animation", "none", "important"));
  }
  $("brain-word").textContent = currentAppearance?.words
    ? sceneWords[name] || ""
    : "";
  $("brain").disabled = currentAppearance?.interactions === false;
}
async function applyAppearance(value) {
  currentAppearance = OddAppearance.apply(value);
  await scene();
  $("brain-caption").textContent = "I’ll remember. You can close the tab.";
  $("appearance-status").textContent = currentAppearance
    ? "Following your app’s saved appearance. Cached here for when the app is closed."
    : "Open the paired desktop app to share its appearance. Using a neutral browser default for now.";
}
async function sync() {
  if (syncBusy) return;
  syncBusy = true;
  try {
    const result = await api({ type: "ob-sync" });
    $("connection").textContent = result.preview
      ? "UI preview · simulated connection"
      : result.ok
        ? result.captures === false
          ? "Connected · captures off in app"
          : result.available === false
            ? "Connected · choose a vault in app"
            : "Connected to OddBrain"
        : result.unpaired
          ? "Pair with desktop app"
          : result.offline
            ? "App offline · captures can wait"
            : "Connection needs attention";
    $("connection").title =
      result.error || "Connection verified with the paired desktop app";
    const stored = await chrome.storage.local.get({
      appAppearance: null,
      queue: [],
      conversationOutboxCount: 0,
    });
    if (
      JSON.stringify(stored.appAppearance) !== JSON.stringify(currentAppearance)
    )
      await applyAppearance(stored.appAppearance);
    $("outbox-footer").textContent =
      stored.queue.length + stored.conversationOutboxCount
        ? `${stored.queue.length + stored.conversationOutboxCount} waiting`
        : "";
    return result;
  } finally {
    syncBusy = false;
  }
}
function tab(name) {
  activeView = name;
  notice("");
  document.querySelectorAll("[data-tab]").forEach((b) => {
    if (b.dataset.tab === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  document
    .querySelectorAll(".view")
    .forEach((v) => (v.hidden = v.id !== name + "-view"));
  document.querySelector("main").scrollTop = 0;
  if (name === "library") void loadLibrary();
  if (name === "activity") void loadActivity();
  if (name === "settings") void loadSettings();
}
function setDraft(value) {
  draft = value;
  $("review").hidden = !value;
  $("discard").hidden = !value;
  $("capsule-fields").hidden = mode !== "capsule";
  $("capture-content").readOnly = mode === "structure";
  if (value) {
    $("capture-title").value = value.title || "";
    $("capture-content").value = value.content || "";
    $("capture-scope").textContent = value.completeness || "";
    $("page-title").textContent = value.title || "Untitled page";
    try {
      $("page-site").textContent = new URL(value.url).hostname;
    } catch {}
    $("page-hint").textContent = "Review and edit. Only this content is saved.";
    updateSize();
  }
  $("capture-current").textContent = value
    ? mode === "capsule"
      ? "Save capsule to vault"
      : "Save to vault"
    : "Review " +
      (mode === "selection"
        ? "selected text"
        : mode === "capsule"
          ? "page as capsule"
          : mode === "structure"
            ? "page structure"
            : "page");
}
function updateSize() {
  $("capture-size").textContent =
    $("capture-content").value.length.toLocaleString() + " chars";
}
$("capture-content").addEventListener("input", updateSize);
async function review() {
  if (busy) return;
  busy = true;
  $("capture-current").disabled = true;
  notice("Reading the active tab…");
  void scene("searching");
  try {
    const result = await api({
      type: "ob-preview",
      mode: mode === "capsule" ? "page" : mode,
    });
    if (!result?.ok) {
      notice(result?.error || "This page could not be read.", true);
      return;
    }
    setDraft(result);
    notice("");
    $("capture-title").focus();
  } finally {
    busy = false;
    $("capture-current").disabled = false;
    void scene();
  }
}
async function save() {
  if (!draft) return review();
  if (busy) return;
  const title = $("capture-title").value.trim(),
    content = $("capture-content").value.trim();
  if (!title || !content) {
    notice("Give this capture a title and some content.", true);
    return;
  }
  busy = true;
  $("capture-current").disabled = true;
  void scene("working");
  try {
    const payload = {
      type: draft.type,
      url: draft.url,
      title,
      content,
      completeness: draft.completeness,
    };
    if (mode === "structure") {
      payload.tree = draft.tree;
      payload.nodes = draft.nodes;
      payload.depth = draft.depth;
    }
    if (mode === "capsule") {
      payload.type = "capsule";
      payload.capsule = {
        id: "capsule-" + crypto.randomUUID(),
        title,
        background: content,
        goals: $("capture-goal").value.trim()
          ? [$("capture-goal").value.trim()]
          : [],
        constraints: $("capture-constraint").value.trim()
          ? [$("capture-constraint").value.trim()]
          : [],
        decisions: [],
        sources: [draft.url],
        version: 1,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        status: "active",
      };
      delete payload.content;
    }
    const result = await api({ type: "ob-capture", payload });
    if (result?.ok || result?.queued) {
      setDraft(null);
      notice(
        result.ok
          ? "Saved to your vault. One less thing to remember."
          : "Waiting in this browser. It will retry when the app reconnects.",
      );
      void scene(result.ok ? "done" : "waiting");
      $("capture-goal").value = "";
      $("capture-constraint").value = "";
      await sync();
    } else
      notice(
        result?.error ||
          (result?.unpaired
            ? "The app refused the pairing token. Check Settings."
            : "Nothing was saved. Check the connection and try again."),
        true,
      );
  } finally {
    busy = false;
    $("capture-current").disabled = false;
  }
}
async function pageHeading() {
  try {
    const [current] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (current?.url && /^https?:/.test(current.url)) {
      $("page-site").textContent = new URL(current.url).hostname;
      $("page-title").textContent = current.title || "Current page";
    } else {
      $("page-site").textContent = "Choose a website";
      $("page-title").textContent = "Browser pages stay in the browser.";
    }
  } catch {
    $("page-site").textContent = "Your current tab";
  }
}
function capsuleText(c) {
  return [
    c.title,
    c.goals?.length ? "Goals\n" + c.goals.join("\n") : "",
    c.constraints?.length ? "Constraints\n" + c.constraints.join("\n") : "",
    c.background || "",
    c.decisions?.length ? "Decisions\n" + c.decisions.join("\n") : "",
    c.sources?.length ? "Sources\n" + c.sources.join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
function empty(target, title, detail) {
  const box = node("div", undefined, "empty");
  box.append(node("h2", title), node("p", detail));
  target.append(box);
}
function renderLibrary() {
  const list = $("capsule-list");
  list.replaceChildren();
  const q = $("search").value.trim().toLowerCase();
  const items = capsules
    .filter((c) =>
      (
        String(c.title || "") +
        " " +
        String(c.background || "") +
        " " +
        (c.goals || []).join(" ")
      )
        .toLowerCase()
        .includes(q),
    )
    .slice()
    .reverse();
  for (const c of items) {
    const row = node("article", undefined, "capsule");
    row.draggable = true;
    row.append(
      action(c.title || "Untitled capsule", () => openCapsule(c)),
      node(
        "p",
        String(
          c.background || (c.goals || []).join(", ") || "Saved context",
        ).slice(0, 125),
      ),
      node(
        "div",
        `Version ${c.version || 1} · ${formatDate(c.updated || c.captured_at || c.created)}`,
        "meta",
      ),
    );
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-capsule", JSON.stringify(c));
      // No text/plain fallback: an uninstrumented editor must not silently
      // insert private capsule text without our confirmation preview.
    });
    list.append(row);
  }
  if (!items.length)
    empty(
      list,
      q ? "Nothing by that name." : "A good memory starts somewhere.",
      q
        ? "Try another word from its title or background."
        : "Save a page as a capsule. Its context will be here when you need it.",
    );
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
async function loadLibrary() {
  $("capsule-detail").hidden = true;
  $("capsule-list").hidden = false;
  $("search").hidden = false;
  $("research-saved").hidden = false;
  try {
    const result = await api({ type: "ob-library" });
    capsules = (result.capsules || []).filter(
      (c) => c && typeof c.title === "string",
    );
    $("library-source").textContent = result.cached
      ? "Cached in this browser. Open the app to refresh."
      : `${capsules.length} capsule${capsules.length === 1 ? "" : "s"} · from your vault`;
    renderLibrary();
  } catch (e) {
    notice(e.message, true);
  }
}
async function researchSaved() {
  const query = $("search").value.trim();
  if (!query) { notice("Enter saved-source search words first.", true); $("search").focus(); return; }
  const button = $("research-saved"); button.disabled = true; notice("Reading current saved originals…");
  try {
    const result = await api({ type: "ob-research", query });
    if (!result?.ok || !result.packet) { notice(result?.notices?.join(" ") || result?.error || "No matching saved original could be placed in a packet.", true); return; }
    const detail = $("capsule-detail"); detail.hidden = false; $("capsule-list").hidden = true; $("search").hidden = true; button.hidden = true; detail.replaceChildren();
    const back = action("← Capsule library", () => loadLibrary(), "text-button");
    detail.append(back, node("h2", `Cited packet · ${result.sources.length} source(s)`), node("p", "Local lexical retrieval over already-saved originals, not live web research. Review the exact packet before using it.", "small muted"), node("pre", result.packet));
    detail.append(action("Copy exact packet", async () => { await navigator.clipboard.writeText(result.packet); notice("Cited packet copied. Nothing was sent."); }));
    for (const source of result.sources) detail.append(node("p", `${source.id} · ${source.title} · ${source.url || source.path}`, "small muted"));
    for (const message of result.notices || []) detail.append(node("p", message, "small muted"));
    notice(""); back.focus();
  } catch (error) {
    notice(error?.message || "The saved-source packet could not be built.", true);
  } finally { button.disabled = false; }
}
async function openCapsule(c) {
  const detail = $("capsule-detail");
  detail.hidden = false;
  $("capsule-list").hidden = true;
  $("search").hidden = true;
  detail.replaceChildren();
  const back = action("← All capsules", () => loadLibrary(), "text-button");
  detail.append(
    back,
    node("h2", c.title),
    node("div", `Version ${c.version || 1}`, "meta"),
    node("pre", capsuleText(c)),
  );
  const actions = node("div", undefined, "button-row");
  actions.append(
    action("Copy context", async () => {
      await navigator.clipboard.writeText(capsuleText(c));
      notice("Context copied.");
    }),
    action("Preview in page", async () => {
      const result = await api({ type: "ob-insert", capsule: c });
      notice(
        result.ok
          ? "Review the insertion on the page. Nothing has been sent."
          : result.error || "The page refused insertion.",
        !result.ok,
      );
    }),
  );
  detail.append(
    actions,
    c.memory_approved
      ? node(
          "p",
          "Reviewed memory. Make corrections in OddBrain → Brain → Memory inbox.",
          "small muted",
        )
      : action("Edit as a new version", () => editCapsule(c), "text-button"),
  );
  if (c.attachments?.length)
    detail.append(
      node(
        "p",
        `${c.attachments.length} attachment reference(s). Original files stay in their source app.`,
        "small muted",
      ),
    );
  back.focus();
}
function editCapsule(c) {
  const detail = $("capsule-detail");
  detail.replaceChildren(node("h2", "Keep the next version."));
  const title = node("input");
  title.value = c.title;
  title.maxLength = 250;
  const titleLabel = node("label", "Title");
  titleLabel.append(title);
  const background = node("textarea");
  background.value = c.background || "";
  background.maxLength = 60000;
  const bodyLabel = node("label", "Background");
  bodyLabel.append(background);
  const goals = node("textarea");
  goals.value = (c.goals || []).join("\n");
  goals.style.minHeight = "75px";
  const goalsLabel = node("label", "Goals, one per line");
  goalsLabel.append(goals);
  const constraints = node("textarea");
  constraints.value = (c.constraints || []).join("\n");
  constraints.style.minHeight = "75px";
  const constraintsLabel = node("label", "Constraints, one per line");
  constraintsLabel.append(constraints);
  const actions = node("div", undefined, "button-row");
  const saveButton = action(
    "Save new version",
    async () => {
      if (!title.value.trim()) {
        title.focus();
        return;
      }
      saveButton.disabled = true;
      try {
        const updated = {
          ...c,
          title: title.value.trim(),
          background: background.value,
          goals: goals.value
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean),
          constraints: constraints.value
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean),
          version: (Number(c.version) || 1) + 1,
          parent_id: c.id,
          updated: new Date().toISOString(),
        };
        const result = await api({
          type: "ob-capture",
          payload: {
            type: "capsule",
            capsule: updated,
            title: updated.title,
            url: c.sources?.find((s) => /^https?:\/\//.test(s)),
          },
        });
        if (result.ok || result.queued) {
          notice(
            result.ok
              ? "New version saved. Earlier vault captures stay intact."
              : "New version waiting in this browser.",
          );
          await loadLibrary();
        } else notice(result.error || "The app refused this version.", true);
      } finally {
        saveButton.disabled = false;
      }
    },
    "primary",
  );
  actions.append(
    saveButton,
    action("Cancel", () => openCapsule(c)),
  );
  detail.append(titleLabel, bodyLabel, goalsLabel, constraintsLabel, actions);
  title.focus();
}
async function loadActivity() {
  const {
    queue = [],
    activity = [],
    diagnosticEntry = null,
  } = await chrome.storage.local.get({
    queue: [],
    activity: [],
    diagnosticEntry: null,
  });
  const conversations = await api({ type: "ob-conversation-outbox" });
  const groups = conversations.conversations || [];
  const count = queue.length + groups.length;
  $("queue-count").textContent = count
    ? `${count} waiting for the app`
    : "Outbox is clear";
  $("clear-queue").hidden = !count;
  $("retry-queue").disabled = !count;
  const waiting = $("queue-list");
  waiting.replaceChildren();
  for (const entry of queue) {
    const row = node("div", undefined, "activity-item");
    row.append(
      node(
        "strong",
        entry.title || entry.capsule?.title || entry.url || "Capture",
      ),
      node("p", entry.type + " · waiting in this browser"),
    );
    waiting.append(row);
  }
  for (const entry of groups) {
    const row = node("div", undefined, "activity-item");
    row.append(
      node("strong", entry.title || "Conversation"),
      node(
        "p",
        entry.problem ||
          `${entry.messages ? "Conversation text is queued on this browser. " : ""}${entry.files ? entry.files + " downloaded file" + (entry.files === 1 ? " is" : "s are") + " waiting for OddBrain. " : ""}${entry.incomplete ? "Some file downloads are incomplete. Reopen the source conversation to finish them." : ""}`,
      ),
    );
    const discard = node("button", "Discard waiting capture", "text-button");
    discard.type = "button";
    discard.onclick = async () => {
      if (
        !(await confirmAction(
          "Discard this waiting conversation?",
          "Only its unsaved browser copies will be removed. Your vault is unchanged. An open conversation can queue again unless you pause capture.",
          "Discard waiting capture",
        ))
      )
        return;
      const result = await api({
        type: "ob-conversation-discard",
        id: entry.id,
      });
      if (!result.ok) {
        notice(
          result.error || "The waiting capture could not be removed.",
          true,
        );
        return;
      }
      await loadActivity();
      await sync();
    };
    row.append(discard);
    waiting.append(row);
  }
  if (!count)
    empty(
      waiting,
      "Nothing waiting.",
      "Captures that cannot reach the app will appear here.",
    );
  const log = $("activity-log");
  log.replaceChildren();
  for (const entry of [...activity].reverse().slice(0, 30)) {
    const row = node("div", undefined, "activity-item");
    row.append(
      node(
        "span",
        entry.success
          ? "Saved"
          : entry.queued
            ? "Queued at capture time"
            : "Not saved",
        "state",
      ),
      node("p", entry.title || entry.url || entry.type || "Capture"),
      node(
        "p",
        (entry.reason || "") + " · " + formatDate(entry.captured_at),
        "small",
      ),
    );
    log.append(row);
  }
  if (diagnosticEntry)
    log.prepend(
      node(
        "p",
        "Diagnostic: simulated offline entry. Never sent.",
        "small muted",
      ),
    );
  if (!activity.length && !diagnosticEntry)
    empty(log, "No receipts yet.", "Your next capture will leave one here.");
}
async function loadConversationSettings() {
  const { conversationSites = {} } = await chrome.storage.local.get({
    conversationSites: {},
  });
  const list = $("conversation-sites");
  list.replaceChildren();
  for (const site of OddConversations.sites.filter((s) => s.kind !== "ai")) {
    const label = node("label", undefined, "switch-row");
    const span = node("span", site.name);
    span.append(
      node(
        "small",
        site.id === "discord"
          ? "Passive reading of the opened channel only. No user tokens or self-bot."
          : "Save messages and accessible attachments while this site is open.",
      ),
    );
    const input = node("input");
    input.type = "checkbox";
    input.setAttribute("aria-label", site.name + " conversation memory");
    input.checked =
      conversationSites[site.id] === true &&
      (await chrome.permissions.contains({
        origins: site.hosts.map((h) => "https://" + h + "/*"),
      }));
    input.addEventListener("change", async () => {
      try {
        const wanted = input.checked;
        const granted = wanted
          ? await chrome.permissions.request({
              origins: site.hosts.map((h) => "https://" + h + "/*"),
            })
          : false;
        const latest = await chrome.storage.local.get({
          conversationSites: {},
        });
        await chrome.storage.local.set({
          conversationSites: {
            ...latest.conversationSites,
            [site.id]: granted,
          },
        });
        input.checked = granted;
        const registered = await api({ type: "ob-conversation-settings" });
        if (!registered?.ok)
          throw Error(
            registered?.error || "Could not start this site’s reader.",
          );
        if (granted)
          notice(
            "Enabled. Reload this site’s open tabs once to start conversation saving.",
          );
      } catch (e) {
        input.checked = false;
        const latest = await chrome.storage.local.get({
          conversationSites: {},
        });
        await chrome.storage.local.set({
          conversationSites: { ...latest.conversationSites, [site.id]: false },
        });
        notice(e.message, true);
      }
    });
    label.append(span, input);
    list.append(label);
  }
  $("conversation-ai-sites").textContent = OddConversations.sites
    .filter((s) => s.kind === "ai")
    .map((s) => s.name)
    .join(" · ");
}
async function loadConversationProgress() {
  const [{ conversationPaused = false }, result] = await Promise.all([
    chrome.storage.local.get({ conversationPaused: false }),
    api({ type: "ob-conversation-status" }),
  ]);
  const state = result?.status;
  $("conversation-progress").hidden = !state && !conversationPaused;
  $("conversation-pause").textContent = conversationPaused ? "Resume" : "Pause";
  $("conversation-state").textContent = conversationPaused
    ? "Collection paused"
    : state?.state || "Conversation memory";
  $("conversation-detail").textContent = state
    ? (Date.now() - state.at > 20000 ? "Last report: " : "") + state.detail
    : "Resume to collect on enabled sites.";
  $("conversation-bar").max = Math.max(1, state?.total || 0);
  $("conversation-bar").value = state?.saved || 0;
  $("conversation-bar").hidden = !state?.total;
}
$("conversation-pause").addEventListener("click", async () => {
  const { conversationPaused = false } = await chrome.storage.local.get({
    conversationPaused: false,
  });
  await chrome.storage.local.set({ conversationPaused: !conversationPaused });
  await loadConversationProgress();
});
async function loadSettings() {
  await loadConversationSettings();
  const data = await chrome.storage.local.get({
    pairToken: "",
    appPort: 8765,
    autoCaptureAi: true,
    companionEnabled: true,
    inlineSuggestions: false,
  });
  $("pair-token").value = data.pairToken;
  $("app-port").value = data.appPort;
  $("auto-ai").checked = data.autoCaptureAi;
  $("companion-enabled").checked = data.companionEnabled;
  $("inline-suggestions").checked = data.inlineSuggestions;
  $("broad-access").checked = await chrome.permissions.contains({
    origins: ["<all_urls>"],
  });
  await loadBlacklist();
}
async function loadBlacklist() {
  const result = await api({ type: "ob-blacklist-get" });
  const data = await chrome.storage.sync.get({
    excluded_patterns: ["bank.com/*"],
  });
  const patterns = Array.isArray(result?.relay)
    ? result.relay
    : data.excluded_patterns;
  const list = $("blacklist-list");
  list.replaceChildren();
  for (const pattern of patterns) {
    const row = node("div", undefined, "blacklist-item");
    row.append(
      node("span", pattern),
      action("Remove", async () => {
        const latest = await chrome.storage.sync.get({ excluded_patterns: [] });
        const answer = await api({
          type: "ob-blacklist-update",
          excluded_patterns: latest.excluded_patterns.filter(
            (p) => p !== pattern,
          ),
        });
        $("blacklist-status").textContent = answer.ok
          ? "Updated in the app and this browser."
          : answer.error || "Saved here; app sync is pending.";
        await loadBlacklist();
      }),
    );
    list.append(row);
  }
  if (!patterns.length)
    list.append(
      node(
        "p",
        "No excluded sites. Capture still follows your permissions above.",
        "small muted",
      ),
    );
}
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => b.addEventListener("click", () => tab(b.dataset.tab)));
document.querySelectorAll("[data-mode]").forEach((b) =>
  b.addEventListener("click", async () => {
    if (busy) return;
    if (
      draft &&
      !(await confirmAction(
        "Change capture format?",
        "This discards the current preview. Nothing has been saved.",
        "Change format",
      ))
    )
      return;
    mode = b.dataset.mode;
    setDraft(null);
    document
      .querySelectorAll("[data-mode]")
      .forEach((n) => n.setAttribute("aria-pressed", String(n === b)));
  }),
);
bind("brand", () => tab("save"));
bind("connection", () => tab("settings"));
bind("capture-current", save);
bind("discard", async () => {
  if (
    await confirmAction(
      "Discard preview?",
      "Nothing from this preview has been saved.",
      "Discard",
    )
  ) {
    setDraft(null);
    await pageHeading();
  }
});
bind("refresh-page", async () => {
  if (
    draft &&
    !(await confirmAction(
      "Read the current tab?",
      "This replaces your unsaved preview.",
      "Read current tab",
    ))
  )
    return;
  setDraft(null);
  await pageHeading();
  await review();
});
bind("refresh-library", loadLibrary);
bind("research-saved", researchSaved);
$("search").addEventListener("input", renderLibrary);
bind("sync-appearance", async () => {
  const result = await sync();
  notice(
    result?.ok
      ? "Appearance checked against the desktop app."
      : result?.error || "Connection check already in progress.",
    !result?.ok,
  );
});
bind("pair-save", async () => {
  const value = $("pair-token").value.trim(),
    port = Number($("app-port").value);
  if (!value || value.length > 256 || /\s/.test(value)) {
    notice("Paste a valid pairing token from the app.", true);
    return;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    notice("Use a port from 1 to 65535.", true);
    return;
  }
  const previous = await chrome.storage.local.get({
    pairToken: "",
    appPort: 8765,
  });
  if (
    previous.pairToken &&
    (previous.pairToken !== value || previous.appPort !== port)
  ) {
    if (
      !(await confirmAction(
        "Change paired app?",
        "Waiting conversation captures stay bound to their original vault and resume only after it is verified. Other queued page captures and cached capsules are cleared. Site exclusions stay.",
        "Change pairing",
      ))
    )
      return;
    await applyAppearance(null);
  }
  const paired = await api({
    type: "ob-pair",
    token: value,
    port,
    confirmChange: true,
  });
  if (!paired.ok) {
    notice(paired.error, true);
    return;
  }
  const result = await sync();
  $("pair-status").textContent = result?.ok
    ? "Connection verified. This browser is paired."
    : result?.error || "Checking connection…";
  notice(
    result?.ok
      ? "Paired. Your app’s look comes with it."
      : "Token stored, but the connection is not verified yet.",
    !result?.ok,
  );
});
bind("pair-clear", async () => {
  if (
    !(await confirmAction(
      "Forget this pairing?",
      "Clear the token, waiting captures, activity and cached capsules in this browser. Your vault is not changed.",
      "Forget pairing",
    ))
  )
    return;
  await api({ type: "ob-forget" });
  await applyAppearance(null);
  await loadSettings();
  await sync();
  $("pair-status").textContent =
    "Pairing forgotten. Vault files were not changed.";
});
bind("retry-queue", async () => {
  $("retry-queue").disabled = true;
  const result = await api({ type: "ob-flush" });
  await loadActivity();
  await sync();
  notice(
    result.ok
      ? "Retry finished. Any captures still waiting are listed above."
      : result.error ||
          "The app is still unreachable. Captures remain in the outbox.",
    !result.ok,
  );
});
bind("clear-queue", async () => {
  if (
    await confirmAction(
      "Clear waiting captures?",
      "These captures have not reached your vault. Their content will be removed from this browser. Open conversations can queue again unless you pause capture.",
      "Clear outbox",
    )
  ) {
    await api({ type: "ob-clear-queue" });
    await loadActivity();
    await sync();
  }
});
bind("clear-activity", async () => {
  if (
    await confirmAction(
      "Clear activity history?",
      "This clears receipts, not waiting captures or vault files.",
      "Clear history",
    )
  ) {
    await chrome.storage.local.set({ activity: [], diagnosticEntry: null });
    await loadActivity();
  }
});
bind("test-offline", async () => {
  await chrome.storage.local.set({ diagnosticEntry: true });
  await loadActivity();
});
$("blacklist-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = $("blacklist-input").value.trim();
  if (!value) return;
  try {
    const data = await chrome.storage.sync.get({
      excluded_patterns: ["bank.com/*"],
    });
    const answer = await api({
      type: "ob-blacklist-update",
      excluded_patterns: [...new Set([...data.excluded_patterns, value])],
    });
    $("blacklist-status").textContent = answer.ok
      ? "Updated in the app and this browser."
      : answer.error || "App sync is pending.";
    $("blacklist-input").value = "";
    await loadBlacklist();
  } catch (e) {
    notice(e.message, true);
  }
});
for (const [id, key] of [
  ["auto-ai", "autoCaptureAi"],
  ["companion-enabled", "companionEnabled"],
  ["inline-suggestions", "inlineSuggestions"],
])
  $(id).addEventListener("change", () =>
    chrome.storage.local.set({ [key]: $(id).checked }),
  );
// Permission requests and sidePanel.open happen directly inside the user gesture.
$("broad-access").addEventListener("change", async () => {
  const requested = $("broad-access").checked;
  try {
    const granted = requested
      ? await chrome.permissions.request({ origins: ["<all_urls>"] })
      : !(await chrome.permissions.remove({ origins: ["<all_urls>"] }));
    $("broad-access").checked = granted;
    await chrome.storage.local.set({ autoCapturePages: granted });
  } catch (e) {
    $("broad-access").checked = false;
    notice(e.message, true);
  }
});
$("open-panel").addEventListener("click", () => {
  if (!chrome.sidePanel || windowId === null) {
    notice("Side panels need a supported Chromium browser.", true);
    return;
  }
  chrome.sidePanel
    .open({ windowId })
    .then(() => {
      if (!params.has("panel")) window.close();
    })
    .catch((e) => notice(e.message, true));
});
if (params.has("panel")) $("open-panel").hidden = true;
let pokes = 0;
bind("brain", () => {
  if (currentAppearance?.interactions === false) return;
  const quiet = currentAppearance?.mischief === "quiet";
  void scene(
    "idle",
    quiet
      ? "boop"
      : currentAppearance?.mischief === "extra"
        ? ["shimmy", "chaos", "hula-hoop"][pokes++ % 3]
        : ["boop", "eye-roll", "glasses-clean", "shoe-phone"][pokes++ % 4],
  );
  if (currentAppearance?.captions !== false && !quiet)
    $("brain-caption").textContent = [
      "I’m collecting context, not pokes.",
      "These glasses are doing most of the work.",
      "Fine. One more. Then we save something.",
    ][pokes % 3];
});
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () =>
  OddAppearance.apply(currentAppearance),
);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" || changes.conversationPaused)
    void loadConversationProgress();
  if (area !== "local") return;
  if (changes.appAppearance)
    void applyAppearance(changes.appAppearance.newValue);
  if (changes.conversationOutboxCount) {
    void sync();
    if (activeView === "activity") void loadActivity();
  }
  if (changes.queue) {
    $("outbox-footer").textContent = changes.queue.newValue?.length
      ? changes.queue.newValue.length + " waiting"
      : "";
    if (activeView === "activity") void loadActivity();
  }
});
if (chrome.tabs.onActivated)
  chrome.tabs.onActivated.addListener(() => {
    if (!draft) void pageHeading();
    else
      notice(
        "Your preview is still here. Refresh to read the newly selected tab.",
      );
  });
(async () => {
  windowId = (await chrome.windows.getCurrent()).id;
  const data = await chrome.storage.local.get({ appAppearance: null });
  scenes = await (await fetch("../assets/scenes.json")).json();
  sceneWords = await (await fetch("../assets/scene-words.json")).json();
  const wordmark = await fetch("../assets/wordmark.svg");
  if (wordmark.ok) $("wordmark").innerHTML = await wordmark.text();
  await applyAppearance(data.appAppearance);
  await pageHeading();
  await loadConversationProgress();
  setInterval(() => {
    if (!document.hidden) void loadConversationProgress();
  }, 5000);
  if (params.has("settings")) tab("settings");
  await sync();
  setInterval(() => {
    if (!document.hidden) void sync().catch(() => {});
  }, 15000);
})().catch((e) => notice(e.message, true));
