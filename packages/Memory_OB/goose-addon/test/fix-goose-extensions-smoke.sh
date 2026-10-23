#!/usr/bin/env bash
# fix-goose-extensions: restore extensions that Goose dropped from its config.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
FIX="$HERE/../fix-goose-extensions.mjs"
W="$(mktemp -d /tmp/fix-ext-XXXXXX)"
trap 'rm -rf "$W"' EXIT
pass=0; fail=0
check() { if [ "$2" -eq 0 ]; then pass=$((pass+1)); echo "PASS $1"; else fail=$((fail+1)); echo "FAIL $1 — $3"; fi }

cfg="$W/config.yaml"
cat > "$cfg" <<'EOF'
provider: goose
extensions:
  developer:
    type: builtin
    name: developer
    enabled: true
  memory_ob:
    type: stdio
    name: "memory_ob"
    display_name: "Memory_OB"
    enabled: true
    cmd: "node"
    args:
      - "C:\\brain\\adapter\\memory-ob-mcp.cjs"
    env_keys: []
    envs: {}
    timeout: 30
GANDALF: 1
EOF

cat > "$cfg.oddbrain-original" <<'EOF'
provider: goose
extensions:
  fetch:
    command: "npx -y fetch-mcp"
    timeout: "2m"
    enabled: "true"
  playwright:
    type: stdio
    cmd: node
    args:
      - C:\tools\playwright-mcp\server.js
    timeout: 90
  youtubetranscript:
    type: stdio
    command: [node, yt.js, --fast]
  custom_ollama_cloud:
    type: streamable_http
    url: https://example.test/mcp
    headers:
      Authorization: "Bearer abc"
    timeout: 60
  tom:
    type: builtin
    name: tom
    enabled: true
  weirdthing:
    type: mystery
    enabled: true
  developer:
    type: builtin
    name: developer
    enabled: true
  memory_ob:
    type: stdio
    name: memory_ob
    enabled: true
GANDALF: 1
EOF

# 1) preview shows the normalized restorations
node "$FIX" --goose-config "$cfg" > "$W/preview.txt" 2>&1
grep -q 'fetch, playwright, youtubetranscript, custom_ollama_cloud' "$W/preview.txt"; check "A: all four missing names reported" $? "$(head -20 "$W/preview.txt")"
grep -q 'cmd: "npx"' "$W/preview.txt"; check "B: string command split into cmd" $? "$(grep -A6 'extensions.fetch' "$W/preview.txt")"
grep -q -- '- "-y"' "$W/preview.txt" && grep -q -- '- "fetch-mcp"' "$W/preview.txt"; check "C: command remainder became args" $? "$(grep -A8 'extensions.fetch' "$W/preview.txt")"
grep -q 'timeout: 120' "$W/preview.txt"; check "D: 2m timeout read as 120 seconds" $? "$(grep -B2 -A2 'timeout: 120' "$W/preview.txt")"
grep -q 'uri: "https://example.test/mcp"' "$W/preview.txt"; check "E: url promoted to uri for streamable_http" $? "$(grep -A8 'extensions.custom_ollama_cloud' "$W/preview.txt")"
grep -q 'weirdthing: unknown extension type' "$W/preview.txt"; check "F: unknown type skipped with a reason" $? "$(tail -5 "$W/preview.txt")"
grep -q "tom: Goose manages built-in" "$W/preview.txt"; check "G: builtin entries are left to Goose" $? "$(tail -5 "$W/preview.txt")"
grep -q 'Preview only' "$W/preview.txt"; check "H: preview writes nothing" $? "$(tail -2 "$W/preview.txt")"
grep -q 'memory_ob' "$cfg" && ! grep -q 'fetch:' "$cfg"; check "I: config untouched after preview" $? "$(cat "$cfg")"

# 2) cancel path writes nothing
echo "no" | node "$FIX" --goose-config "$cfg" --apply > "$W/cancel.txt" 2>&1
grep -q 'Cancelled' "$W/cancel.txt" && ! grep -q 'fetch:' "$cfg"; check "J: cancel writes nothing" $? "$(tail -3 "$W/cancel.txt")"

# 3) ALLOW restores everything rebuilt
echo "ALLOW" | node "$FIX" --goose-config "$cfg" --apply > "$W/apply.txt" 2>&1
grep -q 'Restored: fetch, playwright, youtubetranscript, custom_ollama_cloud' "$W/apply.txt"; check "K: apply reports the restorations" $? "$(tail -4 "$W/apply.txt")"
grep -q 'fetch:' "$cfg" && grep -q 'playwright:' "$cfg" && grep -q 'youtubetranscript:' "$cfg" && grep -q 'custom_ollama_cloud:' "$cfg"; check "L: restored entries are in the config" $? "$(cat "$cfg")"
grep -q 'memory_ob:' "$cfg" && grep -q 'developer:' "$cfg" && grep -q 'GANDALF: 1' "$cfg"; check "M: existing entries and other sections intact" $? "$(cat "$cfg")"
grep -q 'cmd: "npx"' "$cfg"; check "N: restored block uses the typed schema" $? "$(grep -A8 'fetch:' "$cfg")"

# 4) idempotent: nothing restorable remains (only skip notes for builtins/unknown)
node "$FIX" --goose-config "$cfg" > "$W/again.txt" 2>&1
grep -q 'None of the missing entries could be rebuilt automatically' "$W/again.txt" && ! grep -q 'Restored:' "$W/again.txt"; check "O: second run restores nothing more" $? "$(cat "$W/again.txt")"

# 5) a backup was kept
ls "$cfg".oddbrain-original* > "$W/backups.txt" 2>&1
[ "$(wc -l < "$W/backups.txt")" -ge 2 ]; check "P: a fresh backup was written beside the old ones" $? "$(cat "$W/backups.txt")"

echo "---"
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
