#!/usr/bin/env bash
# Installer smoke: run from the repository root. Creates throwaway fixtures in /tmp only.
set -u
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
ADDON=$ROOT/packages/Memory_OB/goose-addon/install.mjs
ADAPTER=$ROOT/apps/03_oddbrain/out/memory-ob/memory-ob-mcp.cjs
pass=0; fail=0
check() { if [ "$2" = "0" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 — $3"; fi }
W=$(mktemp -d /tmp/goose-smoke-XXXX)
cfg="$W/config.yaml"
cat > "$cfg" <<'YAML'
GOOSE_PROVIDER: "openai"
extensions:
  developer:
    type: builtin
    name: developer
    enabled: true
# secret: TOKEN=sk-not-a-real-16charsecret
YAML
cp "$cfg" "$W/config.orig"

node "$ADDON" --print-only --goose-config "$cfg" --brain "$W/brain" --adapter "$ADAPTER" > "$W/print.log" 2>&1
check "A: print-only exits cleanly" $? "$(cat "$W/print.log")"
[ ! -e "$W/brain" ]; check "A: print-only creates no brain" $? "brain exists"
cmp -s "$cfg" "$W/config.orig"; check "A: print-only leaves config untouched" $? "config changed"
grep -q "import-goose-history" "$W/print.log"; check "A: import-first warning in the PRE-ALLOW preview" $? "preview warning missing"

printf 'no\n' | node "$ADDON" --goose-config "$cfg" --brain "$W/brain" --adapter "$ADAPTER" > "$W/cancel.log" 2>&1
grep -q "Cancelled. Nothing was changed." "$W/cancel.log"; check "B: cancel message" $? "$(tail -2 "$W/cancel.log")"
[ ! -e "$W/brain" ]; check "B: cancel creates no brain" $? "brain exists"
cmp -s "$cfg" "$W/config.orig"; check "B: cancel leaves config untouched" $? "config changed"

rm -f "$W/fifo"; mkfifo "$W/fifo"
node "$ADDON" --goose-config "$cfg" --brain "$W/brain" --adapter "$ADAPTER" < "$W/fifo" > "$W/toctou.log" 2>&1 &
P=$!
exec 3>"$W/fifo"
sleep 1
[ ! -e "$W/brain" ]; check "C: zero writes before ALLOW" $? "brain exists at prompt"
echo "# injected-after-preview" >> "$cfg"
printf 'ALLOW\n' >&3
exec 3>&-
wait $P
grep -q "changed since this preview" "$W/toctou.log"; check "C: TOCTOU change refused at write time" $? "$(tail -3 "$W/toctou.log")"
grep -q "injected-after-preview" "$cfg"; check "C: injected external edit intact" $? "injection lost"
[ ! -e "$W/brain" ]; check "C: refused install wrote nothing at all" $? "brain exists"

cp "$W/config.orig" "$cfg"
printf 'ALLOW\n' | node "$ADDON" --goose-config "$cfg" --brain "$W/brain" --adapter "$ADAPTER" > "$W/install.log" 2>&1
check "D: full install exits cleanly" $? "$(tail -3 "$W/install.log")"
for d in "05 Knowledge" "05 Workspace" "06 Review/Memory" "07 Sharing Receipts" "08 Journal" "09 Activity & Undo" "10 People" "store" "chats" "adapter"; do
  [ -d "$W/brain/$d" ]; check "D: brain area $d" $? "missing"
done
node -e "const m=require('$W/brain/store/manifest.json'); if(m.format!=='oddbrain-memory-ob'||m.revision!==0||m.records!==0) process.exit(1)" 2>/dev/null
check "D: empty valid catalogue manifest created" $? "manifest bad"
grep -q "memory_ob_status" "$cfg" && grep -q "enabled: false" "$cfg"; check "D: tools added and stock memory off" $? "config wrong"
grep -q "TOKEN=sk-not-a-real-16charsecret" "$cfg"; check "D: secrets preserved" $? "secret lost"
[ "$(tr -dc '\0' < "$cfg" | wc -c | tr -d ' ')" = "0" ]; check "D: written config has no NUL bytes (Goose can parse it)" $? "NUL bytes found"
[ -f "$cfg.oddbrain-original" ]; check "D: original config backed up" $? "no backup"
[ -f "$W/brain/adapter/goose-adapter.json" ]; check "D: receipt written" $? "no receipt"
grep -q "show my memory screens" "$W/install.log"; check "D: in-Goose screens instructions shown" $? "missing"

cp "$cfg" "$W/config.before-rerun"
printf 'ALLOW\n' | node "$ADDON" --goose-config "$cfg" --brain "$W/brain" --adapter "$ADAPTER" > "$W/reinstall.log" 2>&1
check "E: re-run exits cleanly" $? "$(tail -3 "$W/reinstall.log")"
cmp -s "$cfg" "$W/config.before-rerun"; check "E: identical re-run leaves config byte-identical" $? "config drifted"
printf 'ALLOW\n' | node "$ADDON" --goose-config "$cfg" --brain "$W/brain2" --adapter "$ADAPTER" > "$W/move.log" 2>&1
check "E: changed brain path updates config" $? "$(tail -3 "$W/move.log")"
ls "$cfg".oddbrain-original-* >/dev/null 2>&1; check "E: timestamped second backup created" $? "no second backup"

echo "not ours" > "$W/brain/adapter/memory-ob-mcp.cjs"
printf 'ALLOW\n' | node "$ADDON" --goose-config "$cfg" --brain "$W/brain" --adapter "$ADAPTER" > "$W/foreign.log" 2>&1
[ $? -ne 0 ]; check "F: foreign adapter file refused" $? "installer accepted"
grep -q "not ours" "$W/brain/adapter/memory-ob-mcp.cjs"; check "F: foreign file intact" $? "foreign file clobbered"

# G: the Apps-page copy — only in the nested Goose layout, beside the owner's apps.
grep -q 'no Goose data folder found' "$W/install.log"; check "G: flat layout skips the Apps copy with a note" $? "$(grep 'Screens app' "$W/install.log" 2>&1)"
mkdir -p "$W/nested/config" "$W/nested/data"
cat > "$W/nested/config/config.yaml" <<'YAML'
extensions:
  memory:
    type: builtin
    name: memory
    enabled: true
YAML
printf 'ALLOW\n' | node "$ADDON" --goose-config "$W/nested/config/config.yaml" --brain "$W/nested/brain" --adapter "$ADAPTER" > "$W/nested.log" 2>&1
check "G: nested install writes the Apps-page copy" $? "$(tail -3 "$W/nested.log")"
grep -q 'Memory_OB' "$W/nested/data/apps/memory-ob.html" 2>/dev/null && grep -qi 'captured when the installer ran' "$W/nested/data/apps/memory-ob.html" 2>/dev/null; check "G: screens app carries the name and the stamp" $? "$(ls "$W/nested/data/apps" 2>&1)"
grep -q 'Screens app written' "$W/nested.log"; check "G: install reports the screens app" $? "$(grep 'Screens app' "$W/nested.log" 2>&1)"

# H: repair of the duplicate-block damage a broken earlier installer leaves
# behind (two memory blocks can silently re-enable stock memory).
mkdir -p "$W/dup"
cat > "$W/dup/config.yaml" <<'YAML'
extensions:
  memory_ob:
    type: stdio
    name: memory_ob
    enabled: true
    cmd: node
    args:
      - "C:\\broken\\memory-mcp.cjs"
  apps:
    type: builtin
    name: apps
    display_name: Apps
    enabled: true
  memory:
    type: builtin
    name: memory
    enabled: false
  memory:
    enabled: true
    type: builtin
    name: memory
    description: Teach goose your preferences as you go.
    display_name: Memory
    timeout: 300
    bundled: true
  apps:
    enabled: true
    type: platform
    name: apps
    description: Create and manage custom Goose apps through chat.
    display_name: Apps
    bundled: true
YAML
printf 'ALLOW\n' | node "$ADDON" --goose-config "$W/dup/config.yaml" --brain "$W/dup/brain" --adapter "$ADAPTER" > "$W/dup.log" 2>&1
check "H: install on a duplicated config exits cleanly" $? "$(tail -3 "$W/dup.log")"
[ "$(grep -c '^  memory:' "$W/dup/config.yaml")" = "1" ]; check "H: exactly one stock memory block remains" $? "count $(grep -c '^  memory:' "$W/dup/config.yaml")"
[ "$(grep -c '^  apps:' "$W/dup/config.yaml")" = "1" ]; check "H: exactly one apps block remains" $? "count $(grep -c '^  apps:' "$W/dup/config.yaml")"
[ "$(grep -c '^  memory_ob:' "$W/dup/config.yaml")" = "1" ]; check "H: exactly one memory_ob block remains" $? "count $(grep -c '^  memory_ob:' "$W/dup/config.yaml")"
awk '/^  memory:/{f=1} f&&/^  [A-Za-z0-9_]+:/&&!/^  memory:/{exit} f' "$W/dup/config.yaml" | grep -q "enabled: false"; check "H: stock memory ends up off" $? "memory block: $(awk '/^  memory:/{f=1} f&&/^  [A-Za-z0-9_]+:/&&!/^  memory:/{exit} f' "$W/dup/config.yaml")"
awk '/^  memory:/{f=1} f&&/^  [A-Za-z0-9_]+:/&&!/^  memory:/{exit} f' "$W/dup/config.yaml" | grep -q "Teach goose"; check "H: the fullest memory block was kept" $? "block lost"
grep -q "duplicate repair" "$W/dup.log"; check "H: the repair is reported" $? "not reported"
grep -q "dup/brain/adapter/memory-ob-mcp.cjs" "$W/dup/config.yaml" && ! grep -aq "broken" "$W/dup/config.yaml"; check "H: the broken memory_ob block was replaced" $? "broken block survived"
[ "$(tr -dc '\0' < "$W/dup/config.yaml" | wc -c | tr -d ' ')" = "0" ]; check "H: repaired config has no NUL bytes" $? "NUL bytes found"

echo; echo "$pass passed, $fail failed"
exit $fail
