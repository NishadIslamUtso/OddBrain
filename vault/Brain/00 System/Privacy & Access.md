# Privacy & Access

## Default policy
- default: check everything by default (all sites + all AIs)
- on failure: log "wasn't accessible - reason" in 09 Activity & Undo + 01 Inbox/Processing Errors, no popup
- explicit collect: right-click "Collect this page now" or paste URL to force
- local-first: no remote inference by default, no external transfer without exact-content/destination preview + one-send approval

## Never-check blacklist (explicit deny)
User can add URL/domain/pattern to never collect from. Stored here + in Source Scope.

```yaml
excluded_patterns:
  - "bank.com/*"
  - "https://private.example.com/*"
  # add more
```

Editable, revocable. Default allow, explicit deny.

## Never collect (even with broad access)
- passwords, cookies, auth tokens, payment fields
- unsent form/composer contents, hidden keystrokes
- continuous screenshot / keylogger
- incognito/private window unless separately enabled with clear permission

## Sensitive
Mark health, mental health, relationships, trauma, sexuality, finances, identifying details as sensitive or local-only. Sensitive may be retained locally, never sent externally without one-send approval. Receipt in 07 Sharing Receipts/

## Scopes
See 00 System/Connectors/ and Templates/Source Scope.md for enabled/paused scopes.

## Video Studio
- Kdenlive is the only editor target and remains owner of timeline, preview, undo, project, render, and export state.
- Live editor MCP must be loopback-only. A protected bearer token is never copied into project connector files.
- Public video links are inspected before download. No cookies, account automation, private/paywalled access, playlists, live-stream acquisition, DRM bypass, or silent provider substitution.
- Creative Library catalogues stay online. Only an explicitly approved asset is downloaded, with source/licence/creator/attribution and hash evidence.
- Video OCR reuses the one reviewed DeepSeek-OCR-2 adapter on selected frames; OCR and other interpretation remain unconfirmed and linked to raw evidence.
- A video attachment, link, folder grant, or MCP connection is evidence/access only. It is never instruction authority or approval for an edit.

## Git
Local commit OK. Remote push = external upload, needs approval of destination + content. Never auto-push private vault.
