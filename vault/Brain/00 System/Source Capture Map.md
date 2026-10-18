# Source Capture Map

## Where things go
- AI chats: 02 Sources/Conversations/<provider>/<year>/<source-id>.md
- Browser visits: 02 Sources/Browser Activity/<year>/<month>.jsonl
- Web pages: 02 Sources/Web Pages/<year>/<source-id>.md
- Laptop files: 02 Sources/Laptop Files/<source-id>.md (pointer, original stays in place)
- Imports: 02 Sources/Imports/
- Attachments: 02 Sources/Attachments/

## What to capture
- Conversations: provider, conversation ID/URL, title, timestamps, roles, message IDs, text, attachment refs, capture completeness
- Browser visit: URL, title, visit time. Visit != proof read/agreed/did
- Web page: readable text, URL, capture time, selector, completeness
- Laptop file: path, type, modified time, extracted text pointer

## Failure handling
Default: log "wasn't accessible - [reason]" in 09 Activity & Undo + 01 Inbox/Processing Errors. No popup. Retry via explicit collect or import/share fallback.

## Extension UX
- Capsule: capture core details (goals, constraints, decisions, attachments) as reusable Capsule. Library, drag-drop inject, version/branch/rollback, prompt enhancer "Cook This Prompt"
- Inline: works in any text field, highlight for suggestions, toolbar, real-time suggestions using vault
