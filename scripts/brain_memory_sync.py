"""Brain memory provider sync: vault -> Hermes MEMORY.md / USER.md.

Reads curated vault records and writes bounded summaries into Hermes's
built-in memory files so the agent gets context each turn.

Run: python scripts/brain_memory_sync.py
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path
from typing import Any

# Hermes memory file locations
HERMES_MEMORIES = Path(r"C:\Users\Nishad Islam Utso\AppData\Local\hermes\memories")
MEMORY_PATH = HERMES_MEMORIES / "MEMORY.md"
USER_PATH = HERMES_MEMORIES / "USER.md"

# Brain vault location (must match plugins/brain/dashboard/config.py)
VAULT_PATH = Path(
    __import__("os").environ.get("BRAIN_PATH")
    or r"C:\Users\Nishad Islam Utso\Documents\Hermes\Memory_OB"
)

# Char limits from config.yaml
MEMORY_CHAR_LIMIT = 2200
USER_CHAR_LIMIT = 1375

# Which vault kinds/statuses/tags are sync-worthy
SYNC_KINDS = {"memory", "people", "preferences", "constraints", "identity", "knowledge"}
SYNC_STATUSES = {"confirmed", "demo"}
SYNC_TAGS = {"preference", "constraint", "identity", "user", "session", "bootstrap"}


def _read_frontmatter(text: str) -> dict[str, Any]:
    """Minimal YAML-ish frontmatter parser."""
    m = re.match(r"\A---\s*\n(.*?)\n---\s*\n", text, re.S)
    if not m:
        return {}
    result: dict[str, Any] = {}
    for raw_line in m.group(1).splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        if not key:
            continue
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1]
            items = [v.strip().strip('"').strip("'") for v in inner.split(",") if v.strip()]
            result[key] = items
        elif val.lower() in {"true", "yes"}:
            result[key] = True
        elif val.lower() in {"false", "no"}:
            result[key] = False
        else:
            try:
                result[key] = int(val)
            except ValueError:
                try:
                    result[key] = float(val)
                except ValueError:
                    result[key] = val.strip('"').strip("'")
    return result


def _load_records() -> list[dict[str, Any]]:
    """Load vault records from markdown files."""
    records: list[dict[str, Any]] = []
    if not VAULT_PATH.is_dir():
        return records
    for f in sorted(VAULT_PATH.rglob("*")):
        if not f.is_file():
            continue
        if f.suffix.lower() not in {".md", ".txt", ".json"}:
            continue
        if any(part.startswith(".") or part in {".git", "__pycache__", ".brain"} for part in f.relative_to(VAULT_PATH).parts):
            continue
        try:
            raw = f.read_text(encoding="utf-8-sig", errors="replace")
            fm = _read_frontmatter(raw)
            body_start = raw.find("\n---\n")
            body = raw[body_start + 4 :] if body_start != -1 else raw
            body = body.strip()
            title_line = ""
            for line in body.splitlines():
                stripped = line.strip()
                if stripped:
                    title_line = stripped.lstrip("#").strip()
                    break
            records.append({
                "path": str(f.relative_to(VAULT_PATH)),
                "kind": fm.get("kind", "unknown"),
                "status": fm.get("status", "unconfirmed"),
                "title": fm.get("title", title_line),
                "body": body,
                "tags": fm.get("tags", []),
                "created": fm.get("created", ""),
                "modified": fm.get("modified", ""),
                "size": f.stat().st_size,
            })
        except Exception:
            continue
    return records


def _summarize(records: list[dict[str, Any]], limit: int) -> str:
    """Build a bounded summary string from records."""
    parts: list[str] = []
    total = 0
    for rec in records:
        # Prefer title + first sentence of body
        title = (rec.get("title") or "").strip()
        body = (rec.get("body") or "").strip()
        first_line = ""
        for line in body.splitlines():
            s = line.strip()
            if s:
                first_line = s.lstrip("#").strip()
                break
        text = f"- {title}: {first_line}" if title else f"- {first_line}"
        text = text.rstrip(":")
        if len(text) > 200:
            text = text[:197] + "..."
        if total + len(text) + 1 > limit:
            break
        parts.append(text)
        total += len(text) + 1
    return "\n".join(parts)


def _select_memory(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pick records worth syncing into MEMORY.md."""
    out: list[dict[str, Any]] = []
    seen = set()
    for rec in records:
        kind = str(rec.get("kind", "")).lower()
        status = str(rec.get("status", "")).lower()
        tags = {str(t).lower() for t in rec.get("tags", [])}
        if kind not in SYNC_KINDS and not (tags & SYNC_TAGS):
            continue
        if status not in SYNC_STATUSES:
            continue
        key = (rec.get("title"), rec.get("path"))
        if key in seen:
            continue
        seen.add(key)
        out.append(rec)
    # Prefer confirmed, then demo; sort by modified desc
    out.sort(key=lambda r: (str(r.get("status", "")) != "confirmed", r.get("modified", "")), reverse=False)
    return out[:20]


def _select_user(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pick records worth syncing into USER.md."""
    out: list[dict[str, Any]] = []
    seen = set()
    for rec in records:
        kind = str(rec.get("kind", "")).lower()
        tags = {str(t).lower() for t in rec.get("tags", [])}
        if kind not in {"people", "preferences", "constraints", "identity"} and not (tags & {"preference", "constraint", "identity", "user"}):
            continue
        key = (rec.get("title"), rec.get("path"))
        if key in seen:
            continue
        seen.add(key)
        out.append(rec)
    out.sort(key=lambda r: r.get("modified", ""), reverse=True)
    return out[:10]


def _stable_id(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def sync() -> None:
    records = _load_records()
    if not records:
        print("No vault records found.")
        return

    memory_recs = _select_memory(records)
    user_recs = _select_user(records)

    memory_text = _summarize(memory_recs, MEMORY_CHAR_LIMIT - 100)
    user_text = _summarize(user_recs, USER_CHAR_LIMIT - 100)

    # Build new file content with stable entry IDs to avoid churn
    memory_entries = [line for line in memory_text.split("\n") if line.strip()]
    user_entries = [line for line in user_text.split("\n") if line.strip()]

    def _join(entries: list[str], header: str) -> str:
        if not entries:
            return ""
        body = "\n".join(entries)
        return f"{header}\n{body}\n"

    memory_content = _join(memory_entries, "Brain-synced memory (auto-generated; do not edit manually)")
    user_content = _join(user_entries, "Brain-synced user profile (auto-generated; do not edit manually)")

    # Preserve existing non-synced entries by splitting on our headers
    def _preserve(existing: str, new_block: str, header: str) -> str:
        if not new_block.strip():
            return existing
        parts = existing.split(header)
        if len(parts) == 1:
            base = existing.rstrip("\n")
            return f"{base}\n\n{new_block.lstrip()}\n" if base.strip() else new_block.lstrip() + "\n"
        before = parts[0].rstrip("\n")
        after = header.join(parts[1:])
        # Remove any old synced block after the header
        if header in after:
            after = after.split(header)[0].rstrip("\n")
        after = after.strip("\n")
        result = before
        if result.strip():
            result += "\n\n" + new_block.lstrip()
        else:
            result = new_block.lstrip()
        if after.strip():
            result += "\n\n" + after.strip()
        return result + "\n"

    old_memory = MEMORY_PATH.read_text(encoding="utf-8") if MEMORY_PATH.exists() else ""
    old_user = USER_PATH.read_text(encoding="utf-8") if USER_PATH.exists() else ""

    memory_header = "Brain-synced memory (auto-generated; do not edit manually)"
    user_header = "Brain-synced user profile (auto-generated; do not edit manually)"

    new_memory = _preserve(old_memory, memory_content, memory_header)
    new_user = _preserve(old_user, user_content, user_header)

    MEMORY_PATH.write_text(new_memory, encoding="utf-8")
    USER_PATH.write_text(new_user, encoding="utf-8")
    print(f"Synced {len(memory_recs)} memory records -> {MEMORY_PATH}")
    print(f"Synced {len(user_recs)} user records -> {USER_PATH}")


if __name__ == "__main__":
    sync()
