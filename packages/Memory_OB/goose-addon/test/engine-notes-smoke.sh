#!/usr/bin/env bash
# Engine-notes smoke: the proposal-only writer, end to end through the Brain
# Window. Drafts are proposals with exact quotes; NOTHING lands in the memory
# file until the owner approves it in Review. PASS/FAIL one-liners.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
PASSED=0; FAILED=0
pass() { echo "PASS $1"; PASSED=$((PASSED+1)); }
fail() { echo "FAIL $1"; FAILED=$((FAILED+1)); }
W=$(mktemp -d /tmp/en-smoke-XXXXXX)
trap 'rm -rf "$W"' EXIT
ADDON="packages/Memory_OB/goose-addon"

# ---- 1) a brain with imported conversations (the real intake path) ----
GOOS="$W/goose"
mkdir -p "$GOOS/sessions" "$GOOS/memory"
cat > "$GOOS/sessions/old.jsonl" <<'EOF'
{"description":"old chat","id":"legacy-1"}
{"role":"user","content":"Remember: the launch moved to Tuesday.","id":"u1"}
{"role":"assistant","content":[{"type":"text","text":"Noted — the launch moved to Tuesday."}],"id":"a1"}
{"role":"user","content":"I prefer my tea without sugar. Always use metric units for the specs.","id":"u2"}
{"role":"assistant","content":[{"type":"toolResult","output":"ok"}],"id":"t1"}
EOF
cfg="$W/config.yaml"
printf 'GOOSE_PROVIDER: "openai"\nextensions:\n  developer:\n    type: builtin\n    name: developer\n    enabled: true\n' > "$cfg"
printf 'ALLOW\n' | node "$ADDON/install.mjs" --goose-config "$cfg" --brain "$W/brain" > "$W/install.log" 2>&1
[ $? -eq 0 ] && [ -d "$W/brain/06 Review/Memory" ] && pass "engine-notes: brain ready" || fail "engine-notes: brain setup: $(tail -2 "$W/install.log")"
node "$ADDON/import-goose-history.mjs" --brain "$W/brain" --goose-data "$GOOS" --goose-config "$GOOS" --apply --yes > "$W/import.log" 2>&1
grep -q "Imported." "$W/import.log" && pass "engine-notes: conversations imported" || fail "engine-notes: import"

# ---- 2) run the drafter through the Brain Window ----
PORT=$(( (RANDOM % 1000) + 8500 ))
node "$ADDON/brain-window.mjs" --brain "$W/brain" --port $PORT --no-open > "$W/window.log" 2>&1 &
BGP=$!
sleep 2
B="http://127.0.0.1:$PORT"
OUT=$(curl -sf -X POST "$B/api/window/memory" -H 'Content-Type: application/json' -d '{"action":"run"}')
echo "$OUT" | grep -q '"drafted"' && pass "engine-notes: run reports its drafts" || fail "engine-notes: run: $(tail -2 "$W/window.log")"
echo "$OUT" | grep -q 'no model connected' && pass "engine-notes: honestly labelled without a model" || fail "engine-notes: model label missing"
READ=$(curl -sf -X POST "$B/api/window/memory" -H 'Content-Type: application/json' -d '{"action":"read"}')
echo "$READ" | grep -q 'Remember: the launch moved to Tuesday' && pass "engine-notes: owner line drafted with its exact words" || fail "engine-notes: owner line missing: $READ"
echo "$READ" | grep -q 'tea without sugar' && pass "engine-notes: preference drafted" || fail "engine-notes: preference missing"
echo "$READ" | grep -q '"state":"pending"' && pass "engine-notes: drafts are pending, nothing else" || fail "engine-notes: not pending"
[ ! -f "$W/brain/06 Review/Memory/engine-notes.md" ] && pass "engine-notes: proposal-only — memory file untouched before approval" || fail "engine-notes: wrote memory without approval"
echo "$READ" | grep -q 'Noted — the launch moved' && fail "engine-notes: assistant reply drafted as owner memory" || pass "engine-notes: assistant replies never become owner notes"

# ---- 3) approve one in Review; only that line lands ----
python3 - "$B" "$W" <<'PY' > "$W/approve.log" 2>&1
import json, sys, urllib.request
base, w = sys.argv[1], sys.argv[2]
post = lambda body: json.load(urllib.request.urlopen(urllib.request.Request(base + '/api/window/memory', data=json.dumps(body).encode(), headers={'content-type': 'application/json'})))
read = post({'action': 'read'})['view']
pending = [p for p in read['proposals'] if p['state'] == 'pending']
assert len(pending) >= 2, f'expected drafts, found {len(pending)}'
target = next(p for p in pending if 'launch moved to Tuesday' in p['quote'])
other = next(p for p in pending if p['id'] != target['id'])
result = post({'action': 'act', 'type': 'review', 'expectedRevision': read['revision'], 'id': target['id'], 'decision': 'approve'})['view']
assert any(p['id'] == target['id'] and p['state'] == 'approved' for p in result['proposals']), 'proposal not approved in Review'
text = open(w + '/brain/06 Review/Memory/engine-notes.md').read()
assert 'the launch moved to Tuesday' in text, 'approved line missing from engine-notes.md'
assert '## ' in text, 'no dated heading'
assert other['quote'][:30] not in text, 'an unapproved draft leaked into memory'
print('approved')
PY
grep -q "approved" "$W/approve.log" && pass "engine-notes: approval lands exactly the approved line, with a dated heading" || fail "engine-notes: approval flow: $(cat "$W/approve.log")"
grep -q "tea without sugar" "$W/brain/06 Review/Memory/engine-notes.md" && fail "engine-notes: unapproved line landed" || pass "engine-notes: unapproved drafts stay out of memory"

# ---- 4) the owner's own edits survive; re-runs duplicate nothing ----
echo "- owner's own line, never to be rewritten" >> "$W/brain/06 Review/Memory/engine-notes.md"
OUT=$(curl -sf -X POST "$B/api/window/memory" -H 'Content-Type: application/json' -d '{"action":"run"}')
grep -q "owner's own line, never to be rewritten" "$W/brain/06 Review/Memory/engine-notes.md" && pass "engine-notes: owner's own edits survive a re-run" || fail "engine-notes: owner edit lost"
[ "$(grep -c 'the launch moved to Tuesday' "$W/brain/06 Review/Memory/engine-notes.md")" -eq 1 ] && pass "engine-notes: re-run drafts no duplicates" || fail "engine-notes: duplicated line"

kill $BGP 2>/dev/null; wait $BGP 2>/dev/null
echo "---"
echo "passed: $PASSED  failed: $FAILED"
[ "$FAILED" -eq 0 ]
