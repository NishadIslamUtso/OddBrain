# Second Brain for Windows — native desktop preview

This is the **native Windows direction** for the project. The earlier `static/` dashboard is a browser prototype and is not the intended day-to-day interface. This project uses WPF/XAML for a real Windows window; it does not require a browser or Obsidian.

## What this desktop preview is designed to do

- A chat-first layout following the familiar ChatGPT/Claude conversation pattern: compact chat history on the left, a centered transcript, right-aligned user bubbles, plain assistant replies, and a bottom composer. Memory opens in a side panel so it does not squeeze the conversation. This is a native WPF implementation, not the ChatGPT or Claude product or an exact branded copy.
- A dark, warm charcoal appearance by default, with a top-bar button to switch to a light appearance; the choice is remembered.
- Run local Ollama chat from inside the app window; stream answers; stop generation; choose a model; attach local text/code files; copy or export a conversation.
- Download/select model weights in the in-app model manager after installing the local Ollama runtime once. The app can launch an installed `ollama serve` automatically.
- Store conversations and memories in a local SQLite database at `%LOCALAPPDATA%\SecondBrain\brain.sqlite3`.
- Use approved, ordinary memories as context for relevant local-model prompts. Sensitive memory inclusion requires a per-request confirmation. Model suggestions stay candidates until you approve them.
- Keep memory cleanup distinct: confirm, archive, expire currentness, or forget the derived row; forgetting does not delete the original conversation.

**Obsidian is not required.** SQLite is the operational source of truth. Markdown/Obsidian export can remain an optional portability feature; editing Obsidian files will not currently sync back to the database.

## Build on Windows

This environment has no .NET SDK or Windows runtime, so it cannot produce or verify a Windows executable here. On a Windows 10/11 x64 machine:

1. Install the .NET 8 SDK.
2. Run `build-windows.bat` from this folder.
3. Find the self-contained app under `publish\win-x64\SecondBrain.Windows.exe`.
4. Launch it. Open **Local model manager**; install Ollama once if it is not present, then use the in-app model download.

The first build restores the `Microsoft.Data.Sqlite` package from NuGet. The app does not ship model weights: they are several gigabytes and must be downloaded to the local model store. The model manager starts with `qwen2.5:3b` as an editable example, not a guarantee of best quality. On 8 GB RAM and 4 GB VRAM, choose a compact quantized model and expect speed/quality limits compared with hosted frontier models.

## Honest current status

This is a **desktop implementation preview source tree**, not yet a tested Windows release. It has not been compiled on Windows or connected to an actual Ollama installation in this workspace. Before treating it as reliable, build it on Windows and test database migration, model download, streamed chat, stop/cancel, sensitive-memory confirmation, and recovery from runtime errors.

It is also not feature parity with Claude, Gemini, or ChatGPT. Memory capture is user-triggered (for example, **Save as memory** on an assistant reply); there is no silent/background extraction, browser-history integration, dated journal generator, end-of-day follow-up scheduler, or monthly cross-check workflow yet. The earlier browser prototype's data is not automatically migrated into this desktop app. This preview also does not include voice, web search, remote provider API keys, image/video understanding, connectors, artifact canvases, sync, or a Windows installer. Local model capabilities depend on the model you download; a small local model cannot promise the abilities or quality of a frontier hosted model. The desktop UI and source-linked memory loop are the foundation to expand, not a claim that every requested feature is complete.

No prompt or memory content is sent to a cloud model by this app. Model downloads go to Ollama's configured model registry; inference runs locally through Ollama on loopback. The runtime is a sidecar process, not embedded in the executable.
