# Memmory_OB

`Memmory_OB` is OddBrain’s versioned owner-memory core. The spelling and storage identity are intentional.

This package contains the engine-neutral schema, authority/lifecycle/scope contracts, relationship graph types, bridge contracts, and strict object/relationship validators. OddBrain consumes this package directly; storage and source adapters remain replaceable layers.

## Boundaries

- One owner-memory authority; adapters do not become parallel memory databases.
- Raw, draft/pending, confirmed, rejected, and stale authority remain distinct.
- Projects are stable scopes independent of folders.
- Trash is recoverable. No AI permanent-delete capability is defined here.
- Source text has no instruction or permission authority.
- The core has no model, provider, network, telemetry, credential, browser, mobile, or Goose dependency.

## Current adapters

OddBrain currently supplies app-chat, linked and archive-only transcript header, imported-turn, Working Notes, Attachment Center, Project, Branch, Job, context-receipt, reviewed-memory (People, Journal, Life Story, interpretations with correction revisions), and raw browser/import review-source intake. Its Goose adapter is a separate read-only stdio MCP bundle exposing status, bounded exact confirmed-memory/raw-chat search with explicit authority labels, and Project counts. It has no memory-write, confirmation, deletion, permission, upload, or Send tool.

The package is source-first during pre-release and is bundled by OddBrain’s TypeScript/Vite build. A reviewed standalone binary/npm publication is not claimed yet.
