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
[ -f "$cfg.oddbrain-original" ]; check "D: original config backed up" $? "no backup"
[ -f "$W/brain/adapter/goose-adapter.json" ]; check "D: receipt written" $? "no receipt"
grep -q "brain-window.mjs" "$W/install.log"; check "D: Brain Window command shown" $? "missing"

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

echo; echo "$pass passed, $fail failed"
exit $fail
