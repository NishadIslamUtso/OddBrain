# Browser Visit JSONL format
File: 02 Sources/Browser Activity/<year>/<month>.jsonl
One JSON per line:

{"url":"https://example.com","title":"Example","visited_at":"2026-10-10T12:00:00+06:00","source":"history-api","capture_status":"visit-only"}
{"url":"https://claude.ai/chat/abc","title":"Claude Chat","visited_at":"2026-10-10T12:01:00+06:00","capture_status":"content-captured","source_id":"[[source-id]]"}

visit-only = URL/title/time only, not proof read.
content-captured = readable text captured, linked to source note.
wasnt-accessible = {"url":"...","capture_status":"wasnt-accessible","reason":"permission blocked | layout changed | private window"}
