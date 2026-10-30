"""
Brain plugin config — single source of truth for paths and settings.
Both plugin_api.py and plugin.js (via manifest/constants) should reference this.
"""
from __future__ import annotations

from pathlib import Path

# Vault path (hardcoded per user decision; can be overridden by env var)
BRAIN_PATH = Path(
    __import__("os").environ.get("BRAIN_PATH")
    or r"C:\Users\Nishad Islam Utso\Documents\Hermes\Memory_OB"
)

# API token (shared secret for local write auth)
BRAIN_TOKEN = __import__("os").environ.get("BRAIN_TOKEN") or "brain-local-token"

# File cache TTL (seconds)
CACHE_TTL_SECS = 5

# Vault folder allowlist
ALLOWED_FOLDERS = {
    "00 System", "01 Inbox", "02 Sources", "03 Memory",
    "04 Working Memory", "05 Knowledge", "06 Review",
    "06 Review/proposals", "07 Sharing Receipts", "08 Journal",
    "09 Activity & Undo", "10 People", "90 Archive",
}

# Safe filename regex
SAFE_NAME_RE = r"^[A-Za-z0-9._-]+$"

# Vault file extensions to index
VAULT_EXTS = {".md", ".txt", ".json"}

# Prefixes/dirs to skip when scanning
SKIP_PREFIXES = {".brain", ".git", "__pycache__"}

# Timezone for timestamps
TIMEZONE_OFFSET = "+06:00"  # Asia/Dhaka
