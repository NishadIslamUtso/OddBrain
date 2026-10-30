# Dependencies and Checks

## Python Dependencies

Required for the Brain backend (`plugin_api.py`):

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | >=0.100.0 | Web framework for plugin API |
| uvicorn | >=0.23.0 | ASGI server (Hermes hosts the plugin) |
| pyyaml | >=6.0 | YAML frontmatter parsing (optional — regex fallback exists) |

### Install

```bash
pip install fastapi uvicorn pyyaml
```

### Verify

```bash
python -c "import fastapi, uvicorn, yaml; print('OK')"
```

## Hermes Built-in Dependencies

Brain relies on these Hermes systems:

| System | Version | Purpose |
|--------|---------|---------|
| Hermes Desktop | >=0.22.5 | Plugin host, gateway, desktop plugin SDK |
| @hermes/plugin-sdk | bundled | Desktop plugin SDK (ctx.rest, ctx.pet, ctx.runAction) |
| Gateway | bundled | FastAPI app that mounts plugin routes at `/api/plugins/brain/` |

### Verify Hermes

```bash
hermes --version
# Expected: v0.22.5 or later

hermes config check
# Expected: Config version passes
```

## File Dependencies

Brain requires these files to exist:

| File | Purpose | Required |
|------|---------|----------|
| `desktop-plugins/brain/plugin.js` | Desktop UI | Yes |
| `plugins/brain/dashboard/manifest.json` | Plugin manifest | Yes |
| `plugins/brain/dashboard/plugin_api.py` | Backend API | Yes |
| `skills/brain/SKILL.md` | Core agent skill | Yes |
| `vault/.brain/index.json` | Vault index | Yes (auto-created) |
| `vault/06 Review/proposals/` | Proposals directory | Yes (auto-created) |

## Pre-flight Checks

Run these before reporting issues:

```bash
# 1. Config valid?
hermes config check

# 2. Plugin syntax valid?
node --check desktop-plugins/brain/plugin.js

# 3. Backend syntax valid?
python -m py_compile plugins/brain/dashboard/plugin_api.py

# 4. Vault exists?
ls "C:\Users\<user>\Documents\Hermes\Memory_OB"

# 5. Plugin enabled?
grep -A5 "plugins:" config.yaml

# 6. Memory disabled?
grep "memory_enabled" config.yaml
# Expected: false

# 7. Gateway running?
curl http://127.0.0.1:9119/api/plugins/brain/health
# Expected: JSON with brain_path and total_files
```

## Common Issues

| Issue | Check | Fix |
|-------|-------|-----|
| Plugin not loading | `logs/desktop.log` for `[error-boundary:contrib:plugin:brain]` | Check JS syntax, restart Hermes |
| Backend 404 | `curl /api/plugins/brain/health` | Ensure `brain` in `plugins.enabled` |
| Config check fails | `hermes config check` output | Fix YAML syntax |
| Vault not found | Check `BRAIN_PATH` in plugin.js and plugin_api.py | Must match actual vault location |
| Import errors | `pip install fastapi uvicorn pyyaml` | Install missing packages |

## OS Compatibility

| OS | Tested | Notes |
|----|--------|-------|
| Windows 11 | Yes | Native paths with backslashes in plugin.js |
| macOS | Not tested | Paths need adjustment |
| Linux | Not tested | Paths need adjustment |

## Browser Requirements

The Brain UI uses:
- React 18+ (bundled with Hermes)
- CSS custom properties (theme tokens)
- `jsx()`/`jsxs()` calls (uncompiled, no JSX transform)

No additional browser dependencies.
