#!/usr/bin/env bash
# Brain Window smoke: starts the window on a throwaway brain, checks the named
# screens' real data paths, stops. Run from the repository root.
set -u
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
PORT=${PORT:-8795}
B=http://127.0.0.1:$PORT
W=$(mktemp -d /tmp/brain-window-smoke-XXXX)
pass=0; fail=0
check() { if [ "$2" = "0" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 — $3"; fi }

node "$ROOT/packages/Memmory_OB/goose-addon/brain-window.mjs" --brain "$W/brain" --port $PORT --no-open > "$W/window.log" 2>&1 &
P=$!
sleep 2

curl -sf "$B/" | grep -q "__ODDBRAIN_BRAIN_HOST__ = true"; check "index marks the real brain host" $? "flag missing"
curl -sf -X POST $B/api/window/ping -H 'Content-Type: application/json' -d '{}' | grep -q '"ok":true'; check "ping answers with the brain root" $? "$(cat "$W/window.log" | tail -2)"

OUT=$(curl -sf -X POST $B/api/window/brain -H 'Content-Type: application/json' -d '{"action":"use","path":"'"$W"'/brain"}')
echo "$OUT" | grep -q '"ok":true'; check "folder decide prepares the brain" $? "$OUT"
echo "$OUT" | grep -q '"written"'; check "structure files written, not promised" $? "$OUT"

curl -sf -X POST $B/api/window/projects -H 'Content-Type: application/json' -d '{"projects":[{"id":"p-1","name":"Smoke","instruction":"","folder":"","createdAt":"2026-10-23T00:00:00.000Z","goals":[],"references":[]}]}' > /dev/null
curl -sf -X POST $B/api/window/projects -H 'Content-Type: application/json' -d '{}' | grep -q 'Smoke'; check "Projects screen persists and reads back" $? "read-back failed"
curl -sf -X POST $B/api/window/projects -H 'Content-Type: application/json' -d '{"action":"attach","projectId":"p-1","reference":{"id":"r-1","path":"'"$W"'/brain/note.md","label":"note","addedAt":"2026-10-23T00:00:00.000Z","includeInContext":true}}' | grep -q 'note'; check "Project reference attaches" $? "attach failed"

curl -sf -X POST $B/api/window/memory -H 'Content-Type: application/json' -d '{"action":"read"}' | grep -q '"proposals"'; check "Review screen reads the memory workspace" $? "memory read failed"
curl -sf -X POST $B/api/window/structure -H 'Content-Type: application/json' -d '{"action":"linkCheck"}' | grep -q '"edges"\|"checked"'; check "memory graph link check runs" $? "linkCheck failed"
curl -sf $B/api/vault/status | grep -q '"available":true'; check "vault screen reaches the real brain" $? "vault status failed"
curl -sf "$B/api/vault/files" | grep -q '"files"'; check "vault file tree lists brain files" $? "files failed"

kill $P 2>/dev/null; wait $P 2>/dev/null
echo; echo "$pass passed, $fail failed"
exit $fail
