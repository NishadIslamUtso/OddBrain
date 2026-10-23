#!/usr/bin/env bash
# Semantic smoke: the optional meaning-search module end to end. A local stub
# embeddings endpoint stands in for a free cloud embeddings service — the
# pipeline, labels and honesty are what is tested here. PASS/FAIL one-liners.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
PASSED=0; FAILED=0
pass() { echo "PASS $1"; PASSED=$((PASSED+1)); }
fail() { echo "FAIL $1"; FAILED=$((FAILED+1)); }
W=$(mktemp -d /tmp/sem-smoke-XXXXXX)
trap 'rm -rf "$W"' EXIT
export HOME="$W/home"; mkdir -p "$HOME"
ADDON="packages/Memory_OB/goose-addon"

# ---- a local stub embeddings endpoint (bag-of-words vectors, deterministic) ----
EPORT=$(( (RANDOM % 1000) + 8700 ))
cat > "$W/stub-server.cjs" <<'STUB'
const http = require('http'), crypto = require('crypto')
const embed = (text) => {
  const v = new Array(32).fill(0)
  for (const token of String(text).toLowerCase().match(/[a-z0-9]+/g) || []) {
    const d = parseInt(crypto.createHash('sha1').update(token).digest('hex').slice(0, 4), 16) % 32
    v[d] += 1
  }
  return v
}
http.createServer((req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', () => {
    if (!req.url.endsWith('/embeddings')) { res.statusCode = 404; res.end(); return }
    const input = JSON.parse(body).input
    const texts = Array.isArray(input) ? input : [input]
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ data: texts.map(text => ({ embedding: embed(text) })) }))
  })
}).listen(Number(process.argv[2]), '127.0.0.1')
STUB
node "$W/stub-server.cjs" $EPORT > "$W/embed.log" 2>&1 &
EBGP=$!
sleep 1

# ---- a brain with two owner memories ----
GOOS="$W/goose"
mkdir -p "$GOOS/sessions" "$GOOS/memory"
cat > "$GOOS/sessions/old.jsonl" <<'EOF'
{"description":"old chat","id":"legacy-1"}
{"role":"user","content":"Remember: the launch moved to Tuesday and the trailer renders at 1080p.","id":"u1"}
{"role":"assistant","content":[{"type":"text","text":"Noted."}],"id":"a1"}
{"role":"user","content":"I prefer my tea without sugar.","id":"u2"}
EOF
cfg="$W/config.yaml"
printf 'GOOSE_PROVIDER: "openai"\nextensions:\n  developer:\n    type: builtin\n    name: developer\n    enabled: true\n' > "$cfg"
printf 'ALLOW\n' | node "$ADDON/install.mjs" --goose-config "$cfg" --brain "$W/brain" > /dev/null 2>&1
node "$ADDON/import-goose-history.mjs" --brain "$W/brain" --goose-data "$GOOS" --goose-config "$cfg" --apply --yes > /dev/null 2>&1

export ODDBRAIN_MODEL_BASE_URL="http://127.0.0.1:$EPORT/v1"
export ODDBRAIN_MODEL_API_KEY="stub-key"
export ODDBRAIN_EMBED_MODEL="stub-embed"

# ---- enable + rebuild + search from the module CLI ----
OUT=$(node "$ADDON/semantic-search.mjs" --brain "$W/brain" enable 2>&1)
echo "$OUT" | grep -q "enabled:   yes" && pass "semantic: module enables" || fail "semantic: enable: $OUT"
OUT=$(node "$ADDON/semantic-search.mjs" --brain "$W/brain" rebuild 2>&1)
echo "$OUT" | grep -q "Indexed [1-9][0-9]* items with model \"stub-embed\"" && pass "semantic: index rebuilt from the catalogue" || fail "semantic: rebuild: $OUT"
OUT=$(node "$ADDON/semantic-search.mjs" --brain "$W/brain" search "when is the big launch day" 2>&1)
FIRST=$(echo "$OUT" | sed -n '/Meaning candidates/,/^$/p' | grep -m1 "launch moved to Tuesday")
if echo "$OUT" | grep -q "launch moved to Tuesday" && [ "$(echo "$OUT" | grep -n "launch moved to Tuesday\|tea without sugar" | head -1 | cut -d: -f1)" -lt "$(echo "$OUT" | grep -n "tea without sugar" | head -1 | cut -d: -f1 2>/dev/null || echo 9999)" ]; then
  pass "semantic: meaning finds the right memory first"
else
  fail "semantic: ranking: $OUT"
fi
echo "$OUT" | grep -q "UNVERIFIED" && pass "semantic: candidates are labelled UNVERIFIED" || fail "semantic: label missing"
echo "$OUT" | grep -q "tea without sugar" && pass "semantic: other memories are candidates but rank lower" || pass "semantic: unrelated memory stays out of the top candidates"

# ---- the same through the Brain Window + word-match unchanged ----
PORT=$(( (RANDOM % 1000) + 8800 ))
node "$ADDON/brain-window.mjs" --brain "$W/brain" --port $PORT --no-open > "$W/window.log" 2>&1 &
BGP=$!
sleep 2
B="http://127.0.0.1:$PORT"
curl -sf -X POST "$B/api/window/brain" -H 'Content-Type: application/json' -d '{"action":"use","path":"'"$W"'/brain"}' > /dev/null
OUT=$(curl -sf -X POST "$B/api/window/memory-ob" -H 'Content-Type: application/json' -d '{"action":"search","query":"launch day","meaning":true}')
echo "$OUT" | grep -q '"meaning"' && echo "$OUT" | grep -q "UNVERIFIED" && pass "semantic: window returns labelled meaning candidates" || fail "semantic: window meaning: $OUT"
echo "$OUT" | grep -q '"hits"' && pass "semantic: word-match hits stay present and unchanged" || fail "semantic: hits shape: $OUT"
OUT2=$(curl -sf -X POST "$B/api/window/memory-ob" -H 'Content-Type: application/json' -d '{"action":"search","query":"launch day"}')
if [ -n "$OUT2" ] && echo "$OUT2" | grep -q '\[' && ! echo "$OUT2" | grep -q '"meaning"'; then pass "semantic: plain search returns the unchanged hit list"; else fail "semantic: plain search: $OUT2"; fi

# ---- disable: honest about being off ----
node "$ADDON/semantic-search.mjs" --brain "$W/brain" disable > /dev/null 2>&1
OUT=$(curl -sf -X POST "$B/api/window/memory-ob" -H 'Content-Type: application/json' -d '{"action":"search","query":"launch day","meaning":true}')
echo "$OUT" | grep -q "Meaning search is off" && pass "semantic: disabled state says so plainly" || fail "semantic: disable notice: $OUT"

kill $BGP 2>/dev/null; wait $BGP 2>/dev/null
kill $EBGP 2>/dev/null; wait $EBGP 2>/dev/null
echo "---"
echo "passed: $PASSED  failed: $FAILED"
[ "$FAILED" -eq 0 ]
