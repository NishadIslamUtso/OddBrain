#!/usr/bin/env bash
# Import smoke (the Goose-history migration must run safely, once, before install).
# A fake Goose data dir is imported into a fake brain. PASS/FAIL one-liners.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
PASSED=0; FAILED=0
pass() { echo "PASS $1"; PASSED=$((PASSED+1)); }
fail() { echo "FAIL $1"; FAILED=$((FAILED+1)); }
W=$(mktemp -d /tmp/imp-smoke-XXXXXX)
trap 'rm -rf "$W"' EXIT
ADDON="packages/Memory_OB/goose-addon"
CLI="$ADDON/import-goose-history.mjs"
CORE="apps/03_oddbrain/out/memory-ob/goose-import/goose-import-core.cjs"
[ -f "$CORE" ] || node apps/03_oddbrain/scripts/build-goose-import.mjs >/dev/null 2>&1

# ---- fixture: a plausible Goose data/config folder ----
GOOS="$W/goose"; BRAIN="$W/brain"; WORKDIR="$W/project"
mkdir -p "$GOOS/sessions" "$GOOS/memory" "$WORKDIR/.goose/memory"
cat > "$GOOS/memory/notes.txt" <<'EOF'
# notes
- The launch moved to Tuesday. [2026-05-02]
EOF
cat > "$WORKDIR/.goose/memory/local.txt" <<'EOF'
- Lantern uses tabs, not spaces.
EOF
cat > "$GOOS/sessions/legacy-chat.jsonl" <<'EOF'
{"description":"old chat","id":"legacy-1"}
{"role":"user","content":"remind me the launch date","id":"u1"}
{"role":"assistant","content":[{"type":"text","text":"The launch moved to Tuesday."}],"id":"a1"}
{"role":"assistant","content":[{"type":"toolCall","name":"remember"},{"type":"toolResult","output":"ok"}],"id":"t1"}
EOF
node - "$GOOS/sessions/sessions.db" "$WORKDIR" <<'EOF'
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT, description TEXT, session_type TEXT, working_dir TEXT, created_at INTEGER, updated_at INTEGER, extension_data TEXT, archived_at INTEGER, project_id TEXT, parent_session_id TEXT);
CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT, session_id TEXT, role TEXT, content_json TEXT, created_timestamp INTEGER, timestamp TEXT, tokens INTEGER, metadata_json TEXT);`)
db.prepare('INSERT INTO sessions (id,name,description,working_dir,created_at,updated_at) VALUES (?,?,?,?,?,?)')
  .run('sess-1','chores',"chores session", process.argv[3], 1777000000000, 1777000000000)
const insert = db.prepare('INSERT INTO messages (message_id,session_id,role,content_json,created_timestamp) VALUES (?,?,?,?,?)')
insert.run('m1','sess-1','user', JSON.stringify([{type:'text',text:"what's on my chore list"}]), 1777000000000)
insert.run('m2','sess-1','assistant', JSON.stringify([{type:'text',text:'Milk, and fix the tap.'},{type:'toolCall',name:'note'}]), 1777000001000)
insert.run('m3','sess-1','user', JSON.stringify([{type:'toolResult',output:'wrote note'}]), 1777000002000)
db.close()
EOF
[ $? -eq 0 ] || fail "fixture: sessions.db created"
BEFORE=$(find "$GOOS" "$WORKDIR/.goose" -type f -exec sha256sum {} + | sort | sha256sum)

# ---- 1) preview: finds everything, writes nothing ----
OUT=$(node "$CLI" --brain "$BRAIN" --goose-data "$GOOS" --goose-config "$GOOS" --core "$CORE" 2>&1)
echo "$OUT" | grep -q "Preview only" && pass "import: preview is the default" || fail "import: preview default: $OUT"
echo "$OUT" | grep -q "sessions.db sessions:   1" && pass "import: sessions.db session counted" || fail "import: db count: $OUT"
echo "$OUT" | grep -q "legacy .jsonl sessions: 1" && pass "import: legacy session counted" || fail "import: legacy count: $OUT"
echo "$OUT" | grep -q "sessions.db sessions:   1 (4 text messages, 2 tool-only messages skipped)" && pass "import: tool traffic never becomes memory" || fail "import: tool traffic: $OUT"
echo "$OUT" | grep -q "stock memory files:     2" && pass "import: global + working-dir stock memory counted" || fail "import: memory count: $OUT"
[ ! -e "$BRAIN" ] && pass "import: preview wrote nothing" || fail "import: preview created the brain"

# ---- 2) apply ----
OUT=$(node "$CLI" --brain "$BRAIN" --goose-data "$GOOS" --goose-config "$GOOS" --core "$CORE" --apply --yes 2>&1)
echo "$OUT" | grep -q "Imported." && pass "import: apply completes" || fail "import: apply: $OUT"
CHAT_COUNT=$(ls "$BRAIN/chats/items" | wc -l)
[ "$CHAT_COUNT" -eq 4 ] && pass "import: 4 chats (db + legacy + 2 memory categories)" || fail "import: chat count $CHAT_COUNT"
grep -q '"origin":"import"' "$BRAIN"/chats/items/*.json && pass "import: messages labelled origin import" || fail "import: origin label missing"
grep -q 'goose-' "$BRAIN"/chats/items/*.json && pass "import: deterministic goose chat ids" || fail "import: goose ids missing"
grep -q "The launch moved to Tuesday" "$BRAIN"/chats/items/*.json && pass "import: db text content preserved" || fail "import: db content missing"
grep -q "Milk, and fix the tap" "$BRAIN"/chats/items/*.json && pass "import: assistant text kept, toolCall dropped" || fail "import: assistant content"
grep -rq "imported-conversation" "$BRAIN/store/objects/" && pass "import: catalogue rows marked imported-conversation" || fail "import: catalogue label"
MEMCOPY="$BRAIN/02 Sources/Conversations/Goose Memory"
[ -f "$MEMCOPY/notes.txt" ] && cmp -s "$GOOS/memory/notes.txt" "$MEMCOPY/notes.txt" && pass "import: memory copy is byte-for-byte" || fail "import: memory copy"
[ -f "$MEMCOPY/local.txt" ] && cmp -s "$WORKDIR/.goose/memory/local.txt" "$MEMCOPY/local.txt" && pass "import: working-dir memory copy is byte-for-byte" || fail "import: working-dir memory copy"
grep -q "Lantern uses tabs" "$BRAIN"/chats/items/*.json && pass "import: working-dir .goose/memory imported" || fail "import: working-dir memory"

# ---- 3) Goose folders are read-only sources ----
AFTER=$(find "$GOOS" "$WORKDIR/.goose" -type f -exec sha256sum {} + | sort | sha256sum)
[ "$BEFORE" = "$AFTER" ] && pass "import: every Goose byte unchanged" || fail "import: Goose folders were touched"

# ---- 4) re-run is idempotent ----
OUT=$(node "$CLI" --brain "$BRAIN" --goose-data "$GOOS" --goose-config "$GOOS" --core "$CORE" --apply --yes 2>&1)
echo "$OUT" | grep -q "skipped (already imported): 4" && pass "import: re-run skips imported chats" || fail "import: re-run not idempotent: $OUT"
[ "$(ls "$BRAIN/chats/items" | wc -l)" -eq 4 ] && pass "import: no duplicate chats" || fail "import: duplicates appeared"

# ---- 5) memory copies never overwrite ----
[ "$(ls "$MEMCOPY" | wc -l)" -eq 2 ] && pass "import: memory copy area holds one copy per category" || fail "import: duplicate memory copies"

echo "---"
echo "passed: $PASSED  failed: $FAILED"
[ "$FAILED" -eq 0 ]
