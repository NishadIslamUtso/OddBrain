/* Worker-only transport. Capture writes are durable before any network await.
 * Replay never opens tabs or fetches remote attachment URLs. */
const conversationOutbox = OddConversationOutbox.create();
let conversationFlight = null,
  conversationEpoch = 0,
  conversationAbort = null;
function interruptConversations() {
  conversationEpoch++;
  conversationAbort?.abort();
}
/* The vault's own identity, not the pairing token and not the port. A rotated
 * token or a restarted app must not orphan bytes already in the outbox. */
const PAIRING_HOLD =
  "The pairing was refused or removed. Enter the current token from OddBrain; this capture was kept and nothing was sent anywhere else.";
async function conversationIdentity() {
  return OddConversations.sha((await localApiBase()) + "\n" + (await getPairToken()));
}
async function queuedDestination() {
  const stored = await chrome.storage.local.get("conversationDestination");
  const value = stored.conversationDestination;
  return value && value.identity === await conversationIdentity() && /^[a-f0-9]{64}$/.test(value.target || "") ? value : null;
}
async function rememberConversationDestination(health, identity) {
  if (identity !== await conversationIdentity()) return false;
  if (!/^[a-f0-9]{64}$/.test(health.capture_target || "") || health.available === false) {
    await chrome.storage.local.remove("conversationDestination");
    return true;
  }
  await chrome.storage.local.set({
    conversationDestination: {
      identity,
      target: health.capture_target,
      legacyTargets: Array.isArray(health.capture_legacy_targets) ? health.capture_legacy_targets.filter(t => typeof t === "string" && /^[a-f0-9]{64}$/.test(t)).slice(0, 16) : [],
      captures: health.captures !== false,
    },
  });
  return identity === await conversationIdentity();
}
function sameCaptureDestination(row, destination) {
  return destination && (row.target === destination.target || destination.legacyTargets?.includes(row.target));
}
async function conversationExcluded(url) {
  const pending = await chrome.storage.local.get("blacklistPending");
  const synced = await chrome.storage.sync.get({
    excluded_patterns: DEFAULT_PATTERNS,
  });
  return isExcluded(
    url,
    Array.isArray(pending.blacklistPending)
      ? pending.blacklistPending
      : synced.excluded_patterns,
  );
}
async function queuedConversationPermission(row) {
  const site = OddConversations.siteFor(row.url);
  const prefs = await chrome.storage.local.get({
    conversationPaused: false,
    autoCaptureAi: true,
    conversationSites: {},
  });
  if (!site || (await conversationExcluded(row.url))) return "discard";
  if (
    site.kind === "ai"
      ? prefs.autoCaptureAi === false
      : prefs.conversationSites?.[site.id] !== true
  )
    return "discard";
  if (
    !(await chrome.permissions.contains({
      origins: [new URL(row.url).origin + "/*"],
    }))
  )
    return "discard";
  return prefs.conversationPaused ? "pause" : "allow";
}
async function conversationQueueSummary() {
  const rows = await conversationOutbox.list(),
    grouped = new Map();
  for (const row of rows) {
    const key = row.target + ":" + row.conversation;
    if (!grouped.has(key))
      grouped.set(key, {
        id: row.id,
        title: row.title,
        bytes: 0,
        messages: 0,
        parts: 0,
        files: 0,
        partFiles: new Set(),
        completeFiles: new Set(),
        problem: "",
        at: row.at,
      });
    const group = grouped.get(key);
    group.bytes += row.bytes;
    if (row.op === "messages") group.messages++;
    if (row.op === "media-part") {
      group.parts++;
      group.partFiles.add(row.attachment);
    }
    if (row.op === "media-finish") group.completeFiles.add(row.attachment);
    if (row.problem) group.problem = row.problem;
  }
  const summary = {
    count: rows.length,
    bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    conversations: [...grouped.values()].map(
      ({ partFiles, completeFiles, ...group }) => ({
        ...group,
        files: completeFiles.size,
        incomplete: [...partFiles].some((id) => !completeFiles.has(id)),
      }),
    ),
  };
  // Counts only in storage.local; popup asks this worker for the safe summaries.
  const previous = await chrome.storage.local.get("conversationOutboxCount");
  if (previous.conversationOutboxCount !== summary.conversations.length)
    await chrome.storage.local
      .set({ conversationOutboxCount: summary.conversations.length })
      .catch(() => {});
  return summary;
}
async function pruneConversations() {
  const rows = await conversationOutbox.list(),
    discard = [];
  for (const row of rows)
    if ((await queuedConversationPermission(row)) === "discard")
      discard.push(row.id);
  if (discard.length) {
    await conversationOutbox.remove(discard);
    await recordActivity({
      type: "conversation",
      success: false,
      reason:
        "Waiting conversation data removed because its site access was disabled or excluded.",
      captured_at: new Date().toISOString(),
    });
  }
  return conversationQueueSummary();
}
async function clearConversations(id) {
  interruptConversations();
  if (!id) await conversationOutbox.clear();
  else {
    const rows = await conversationOutbox.list(),
      selected = rows.find((row) => row.id === id);
    if (selected)
      await conversationOutbox.remove(
        rows
          .filter(
            (row) =>
              row.target === selected.target &&
              row.conversation === selected.conversation,
          )
          .map((row) => row.id),
      );
  }
  return conversationQueueSummary();
}
async function queueConversation(payload) {
  const epoch = conversationEpoch;
  let destination = await queuedDestination();
  if (!destination) {
    const status = await connection();
    if (!status.ok)
      throw Error(
        "Connect to OddBrain once to verify the destination vault before collecting offline. Keep this tab open.",
      );
    if (status.available === false)
      throw Error(
        "Choose an available vault in OddBrain before collecting offline.",
      );
    if (status.durableCapture === false)
      throw Error(
        status.captureProblem ||
          "Update the OddBrain desktop app to use recoverable conversation saving. Nothing new was queued.",
      );
    destination = await queuedDestination();
  }
  if (!destination || !destination.captures)
    throw Error(
      "Enable browser capture in OddBrain and verify the connection before saving.",
    );
  if (epoch !== conversationEpoch)
    throw Error("Capture settings changed. Nothing new was queued.");
  const row = await conversationOutbox.enqueue(payload, destination);
  await conversationQueueSummary();
  void flushConversations().catch(() => {});
  return { ok: true, queued: true, receipt: row.id };
}
async function flushConversations() {
  if (conversationFlight) return conversationFlight;
  conversationFlight = drainConversations().finally(() => {
    conversationFlight = null;
  });
  return conversationFlight;
}
async function drainConversations() {
  const epoch = conversationEpoch;
  await pruneConversations();
  if (!(await conversationOutbox.list()).length) return;
  const status = await connection();
  if (!status.ok) {
    if (status.unpaired) {
      /* A refused token is not a reason to destroy bytes this browser already
       * holds. Rotating the pairing token is a security action the app offers;
       * the queue is addressed to the vault, not to the token, so it can finish
       * once the person pastes the current token. Explicit "forget pairing" and
       * "clear outbox" still remove it. */
      const hold = PAIRING_HOLD;
      const rows = await conversationOutbox.list();
      const changed = rows.some((row) => row.problem !== hold);
      for (const row of rows)
        if (row.problem !== hold) await conversationOutbox.mark(row.id, hold);
      if (changed)
        await recordActivity({
          type: "conversation",
          success: false,
          reason:
            "Pairing was refused. Waiting captures were kept in this browser; re-pair to finish saving. Nothing was sent anywhere else.",
          captured_at: new Date().toISOString(),
        });
    }
    return;
  }
  if (status.captures === false) {
    const destination = await queuedDestination();
    await conversationOutbox.remove((await conversationOutbox.list()).filter(row => sameCaptureDestination(row, destination)).map(row => row.id));
    await recordActivity({
      type: "conversation",
      success: false,
      reason:
        "The app disabled capture. Waiting conversation data was removed from this browser.",
      captured_at: new Date().toISOString(),
    });
    return;
  }
  if (status.available === false || epoch !== conversationEpoch) return;
  // A hold written while the token was refused is not a reason to keep blocking
  // once the app answers again; the token was the whole problem.
  for (const row of await conversationOutbox.list())
    if (row.problem === PAIRING_HOLD && epoch === conversationEpoch)
      await conversationOutbox.mark(row.id, "");
  if (!status.durableCapture) {
    const message =
      (status.captureProblem ? "Update OddBrain: " + status.captureProblem : "Update OddBrain to finish saving these protected captures.");
    for (const row of await conversationOutbox.list())
      await conversationOutbox.mark(row.id, message);
    return;
  }
  await currentPatterns(); // Refresh app exclusions before replay, including offline edits.
  await pruneConversations();
  const destination = await queuedDestination();
  const deadline = Date.now() + 4500,
    blocked = new Set();
  const rows = await conversationOutbox.list();
  let attempted = 0;
  for (const row of rows) {
    if (Date.now() > deadline || epoch !== conversationEpoch) break;
    const group = row.target + row.conversation;
    if (blocked.has(group)) continue;
    if (!sameCaptureDestination(row, destination)) {
      await conversationOutbox.mark(
        row.id,
        "Different vault. Reopen the original vault or discard this waiting capture.",
      );
      blocked.add(group);
      continue;
    }
    if (
      row.problem &&
      !row.problem.startsWith("Different vault.") &&
      !row.problem.startsWith("Update OddBrain")
    ) {
      blocked.add(group);
      continue;
    }
    if (row.problem) await conversationOutbox.mark(row.id, "");
    if ((await queuedConversationPermission(row)) !== "allow") continue;
    if (++attempted > 64) break;
    const payload = await conversationOutbox.body(row.id);
    if (!payload || epoch !== conversationEpoch) continue;
    conversationAbort = new AbortController();
    const post = (data) =>
      api("/conversation-sync", {
        method: "POST",
        body: JSON.stringify(data),
        signal: conversationAbort.signal,
      });
    try {
      let result;
      if (payload.op === "messages" && payload.messages?.length) {
        const checksums = Object.fromEntries(
          await Promise.all(
            payload.messages.map(async (m) => [
              m.id,
              await OddConversations.sha(JSON.stringify(m)),
            ]),
          ),
        );
        const known = await post({
          ...payload,
          messages: undefined,
          order: undefined,
          op: "state",
          ids: payload.messages.map((m) => m.id),
          checksums,
        });
        if (!known.ok) result = known;
        else
          payload.messages = payload.messages.filter(
            (m) =>
              known.hashes?.[m.id] !== checksums[m.id] &&
              known.seen?.[m.id] !== checksums[m.id],
          );
      }
      if (epoch !== conversationEpoch) break;
      if (!result) result = await post(payload);
      if (result.ok) {
        await conversationOutbox.remove([row.id], true);
        if (result.changed > 0 || payload.op === "media-finish")
          await recordActivity({
            type: "conversation",
            title: row.title,
            success: true,
            reason:
              payload.op === "media-finish"
                ? "Attachment saved to OddBrain"
                : result.changed + " new or changed message observations saved",
            captured_at: new Date().toISOString(),
          });
      } else if (result.status === 401) {
        // Rotation can happen after /health but before either POST. Keep every
        // byte, including attachment parts, until re-paired to the same vault.
        for (const waiting of rows) if (waiting.target === row.target)
          await conversationOutbox.mark(waiting.id, PAIRING_HOLD);
        break;
      } else if (result.status === 403 || result.skipped) {
        await conversationOutbox.remove(
          rows
            .filter(
              (other) =>
                other.target === row.target &&
                (result.reason !== "blacklist" ||
                  other.conversation === row.conversation),
            )
            .map((other) => other.id),
        );
        await recordActivity({
          type: "conversation",
          success: false,
          reason:
            "The app refused these captures. Waiting data was removed; nothing was marked saved.",
          captured_at: new Date().toISOString(),
        });
        break;
      } else if (
        result.status >= 400 &&
        result.status < 500 &&
        result.status !== 429
      ) {
        await conversationOutbox.mark(
          row.id,
          result.error ||
            result.reason ||
            "Capture refused. Check the desktop app, then retry or discard.",
        );
        blocked.add(group);
      } else break; // offline/5xx/rate limiting: retain bytes, retry on next alarm
    } catch {
      break;
    } finally {
      conversationAbort = null;
    }
  }
  await conversationQueueSummary();
}
async function conversationMediaState(payload) {
  const destination = await queuedDestination();
  const rows = (await conversationOutbox.list()).filter(
    (row) =>
      sameCaptureDestination(row, destination) &&
      row.conversation === payload.conversation.key &&
      row.attachment === payload.attachment_id,
  );
  const finished = rows.find((row) => row.op === "media-finish");
  if (finished)
    return {
      ok: true,
      queued: true,
      receipt: finished.id,
      staged: true,
      saved: null,
    };
  try {
    const result = await api("/conversation-sync", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        ...(destination ? { capture_target: destination.target } : {}),
      }),
    });
    if (result.ok)
      return {
        ...result,
        parts: [
          ...new Set([
            ...(result.parts || []),
            ...rows
              .filter((row) => row.op === "media-part")
              .map((row) => row.hash),
          ]),
        ],
      };
    if ([401, 403, 409].includes(result.status)) return result;
    // The message can still be waiting in the browser; do not treat that as a
    // file failure. Its chunks are replayed only after the message operation.
    const waitingForMessage =
      result.status === 400 &&
      String(result.error || "").includes(
        "Save the attachment reference with its message first",
      );
    if (!waitingForMessage && result.status < 500 && result.status !== 429)
      return result;
  } catch {}
  return {
    ok: true,
    saved: null,
    parts: rows.filter((row) => row.op === "media-part").map((row) => row.hash),
  };
}
