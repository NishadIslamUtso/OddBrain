# Memory_OB provider

The pipe between Hermes and the Memory_OB engine. Hermes calls the
`MemoryProvider` hooks every turn; this plugin hands them to the engine, which
files everything by itself. The provider holds no rules of its own.

`host/install.py` copies this directory to `$HERMES_HOME/plugins/memory_ob/`.
Then switch it on:

```bash
hermes config set memory.provider memory_ob
```

## Hooks

| Hook | What it does |
|---|---|
| `prefetch(query)` | Recall before a turn: what is remembered (each line says who said it), then anything not yet filed, marked UNVERIFIED. Everything passes the engine's exit gate first — "never send" memories and hazardous text never leave. |
| `sync_turn(...)` | After a turn, gives what the owner said to the engine in the background. The engine files it, skips repeats, and turns a contradiction into a question for the owner. |
| `on_pre_compress(messages)` | Captures what compression is about to discard and returns a short digest for the summary prompt. |
| `on_session_end(messages)` | The same capture at a real session boundary. |

Passwords, API keys and card numbers are replaced with `[hidden]` by the engine
before anything is stored, so the provider never has to think about them.

At the start of a session the system prompt also lists the owner's open to-dos
and any "come back to" dates that have arrived. They go through the same exit
gate, are labelled as data rather than instructions, and are left out entirely in
anonymous mode.

## Tools

| Tool | Use |
|---|---|
| `memory_ob_search` | Search the memories — the agent's own recall. |
| `memory_ob_capture` | Give Memory_OB something the owner said. It is filed by itself (in the background). |
| `memory_ob_review` | List the questions waiting for the owner, or put one off with `later`. The agent can **never** answer one. |
| `memory_ob_stats` | How much is remembered and how many questions are waiting. |
| `memory_ob_anonymous` | Check, turn on or turn off anonymous mode (nothing recalled, nothing saved). While it is on, `memory_ob_search`, `memory_ob_capture` and `memory_ob_review` refuse. The agent should turn it off only when the user asks. |

## Finding the engine

In this order: the `MEMORY_OB_HOME` environment variable, the
`.memory_ob_home` pointer file the installer writes beside the plugin, then
`~/Documents/Hermes/Workspace/Memory_OB`. `is_available()` says whether one was
found; when none is, Hermes says so once instead of silently running without
memory.

## Config (`memory.memory_ob`)

| Key | Default | Meaning |
|---|---|---|
| `auto_extract` | `true` | Capture turns and pre-compression context automatically, and recall before turns. Set `false` and only the explicit tools work. |
