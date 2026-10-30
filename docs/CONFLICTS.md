# Conflicts with Hermes Built-in Systems

## Summary

Brain replaces Hermes's built-in memory system. Running both causes duplicate
memory, conflicting context injection, and confused tool surfaces.

## Conflicts

| System | Conflict | Resolution |
|--------|----------|------------|
| `memory:` config (memory_enabled) | Injects ~800 tokens of recalled memory into every session | Set `memory_enabled: false` |
| `memory:` config (user_profile_enabled) | Stores user preferences separately from Brain | Set `user_profile_enabled: false` |
| `memory:` config (nudge_interval) | Nudges agent to save memories every N turns | Set `nudge_interval: 0` |
| `memory` CLI tool | Writes to Hermes's store, not Brain vault | Removed from `cli:` tools list |
| `skills/memory/deep-review/` | Own memory review workflow | Use Brain's Review tab instead |
| `session_search` tool | Recalls past conversations | Overlaps with Brain vault search; Brain handles this |
| Compression/context management | Long sessions get compressed; Brain capture must happen first | Capture before compression; Brain reads from vault on demand |

## What Was Disabled

In `config.yaml`:

```yaml
memory:
  memory_enabled: false
  user_profile_enabled: false
  nudge_interval: 0

platform_toolsets:
  cli: [browser, clarify, code_execution, computer_use, connections, cronjob, delegation, file, image_gen, session_search, skills, terminal, todo, tts, video, vision, web]
  # Note: 'memory' removed from cli list
```

## What Was NOT Disabled

| System | Reason |
|--------|--------|
| `session_search` tool | Still useful for finding past chat sessions; Brain handles memory, session_search handles sessions |
| Compression/context management | Hermes needs this for long sessions; Brain reads from vault on demand |
| `skills/memory/deep-review/` | Left in place; can be disabled if it conflicts with Brain Review |

## Recommended Actions

1. **Verify config**: run `hermes config check` after applying changes
2. **Restart Hermes**: config changes only apply on restart
3. **Monitor logs**: check `logs/desktop.log` for memory-related errors
4. **Test memory flow**: propose a memory, approve in Review, verify it appears in vault

## Reverting

If you want to restore Hermes's built-in memory:

1. Set `memory_enabled: true`, `user_profile_enabled: true`, `nudge_interval: 10`
2. Add `memory` back to `cli:` tools list
3. Remove or disable the Brain plugin
4. Restart Hermes

**Warning**: Running both systems will create duplicate and conflicting memory.
