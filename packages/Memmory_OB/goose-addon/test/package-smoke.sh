#!/usr/bin/env bash
# Package smoke: the ready-to-download folder must work STANDALONE.
# It is built fresh, copied to a clean place (as if downloaded), then import +
# install + Brain Window are run from the copy alone. PASS/FAIL one-liners.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
PASSED=0; FAILED=0
pass() { echo "PASS $1"; PASSED=$((PASSED+1)); }
fail() { echo "FAIL $1"; FAILED=$((FAILED+1)); }
W=$(mktemp -d /tmp/pkg-smoke-XXXXXX)
trap 'rm -rf "$W"' EXIT

# ---- 1) build the package fresh ----
node apps/03_oddbrain/scripts/package-addon.mjs > "$W/package.log" 2>&1 || fail "package: packager failed: $(tail -3 "$W/package.log")"
PKG="packages/Memmory_OB/dist-addon/Memmory_OB-addon"
[ -f "$PKG/MANIFEST.md" ] && [ -d "$PKG/dist" ] && [ -d "$PKG/ui" ] && [ -f "$PKG/goose-skill/SKILL.md" ] && pass "package: folder has manifest, dist, ui, skill" || fail "package: folder incomplete"

# ---- 2) copy it somewhere clean — the owner's machine ----
cp -r "$PKG" "$W/Memmory_OB-addon"
P="$W/Memmory_OB-addon"

# ---- 3) manifest checksums verify ----
python3 - "$P" <<'PY' > "$W/sums.log" 2>&1
import hashlib, os, re, sys
root = sys.argv[1]
bad = 0
for name, digest in re.findall(r'\| `([^`]+)` \| \d+ \| `([0-9a-f]{64})` \|', open(os.path.join(root, 'MANIFEST.md')).read()):
    path = os.path.join(root, name)
    got = hashlib.sha256(open(path, 'rb').read()).hexdigest() if os.path.isfile(path) else 'MISSING'
    if got != digest:
        bad += 1
        print(f'mismatch: {name}')
print('verified')
sys.exit(1 if bad else 0)
PY
[ $? -eq 0 ] && grep -q "verified" "$W/sums.log" && pass "package: every MANIFEST checksum verifies" || fail "package: checksums: $(cat "$W/sums.log")"

# ---- 4) import from the copy alone (no --core; resolution must find dist/) ----
GOOS="$W/goose"
mkdir -p "$GOOS/sessions" "$GOOS/memory" "$W/project/.goose/memory"
cat > "$GOOS/memory/notes.txt" <<'EOF'
- The launch moved to Tuesday. [2026-05-02]
EOF
cat > "$GOOS/sessions/old.jsonl" <<'EOF'
{"description":"old chat","id":"legacy-1"}
{"role":"user","content":"remind me the launch date","id":"u1"}
{"role":"assistant","content":[{"type":"text","text":"The launch moved to Tuesday."}],"id":"a1"}
EOF
OUT=$(node "$P/import-goose-history.mjs" --brain "$W/brain" --goose-data "$GOOS" --goose-config "$GOOS" 2>&1)
echo "$OUT" | grep -q "Preview only" && pass "package: import previews from the copy" || fail "package: import preview: $OUT"
OUT=$(node "$P/import-goose-history.mjs" --brain "$W/brain" --goose-data "$GOOS" --goose-config "$GOOS" --apply --yes 2>&1)
echo "$OUT" | grep -q "Imported." && pass "package: import applies from the copy" || fail "package: import apply: $OUT"
grep -rq '"origin":"import"' "$W/brain/chats/items/" 2>/dev/null && pass "package: imported messages labelled origin import" || fail "package: origin label"

# ---- 5) install from the copy alone (no --adapter/--skill; finds dist/ + goose-skill/) ----
cfg="$W/config.yaml"
cat > "$cfg" <<'YAML'
GOOSE_PROVIDER: "openai"
extensions:
  developer:
    type: builtin
    name: developer
    enabled: true
YAML
printf 'ALLOW\n' | node "$P/install.mjs" --goose-config "$cfg" --brain "$W/brain" > "$W/install.log" 2>&1
[ $? -eq 0 ] && grep -q "Installed" "$W/install.log" || grep -q "install" "$W/install.log"
grep -q "memmory_ob_status" "$cfg" && pass "package: installer found its bundled adapter + skill" || fail "package: install: $(tail -3 "$W/install.log")"
grep -q "enabled: false" "$cfg" && pass "package: stock memory switched off" || fail "package: stock memory still on"
[ -f "$W/brain/adapter/goose-adapter.json" ] && pass "package: adapter receipt written" || fail "package: receipt missing"
[ -f "$cfg.oddbrain-original" ] && pass "package: original config backed up" || fail "package: no backup"

# ---- 6) Brain Window from the copy alone (finds brain-window-server.cjs + ui/) ----
PORT=$(( (RANDOM % 1000) + 8200 ))
node "$P/brain-window.mjs" --brain "$W/brain" --port $PORT --no-open > "$W/window.log" 2>&1 &
BGP=$!
sleep 2
curl -sf "http://127.0.0.1:$PORT/" | grep -q "__ODDBRAIN_BRAIN_HOST__ = true" && pass "package: Brain Window serves the built interface" || fail "package: window index: $(tail -2 "$W/window.log")"
curl -sf -X POST "http://127.0.0.1:$PORT/api/window/ping" -H 'Content-Type: application/json' -d '{}' | grep -q '"ok":true' && pass "package: Brain Window answers on the brain" || fail "package: window ping"
kill $BGP 2>/dev/null; wait $BGP 2>/dev/null

# ---- 7) the zip exists and holds the folder ----
ZIP=$(ls packages/Memmory_OB/dist-addon/*.zip | head -1)
python3 -c "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert any(n.endswith('MANIFEST.md') for n in z.namelist()); print('zip-ok')" "$ZIP" | grep -q zip-ok && pass "package: zip contains the folder" || fail "package: zip bad"

echo "---"
echo "passed: $PASSED  failed: $FAILED"
[ "$FAILED" -eq 0 ]
