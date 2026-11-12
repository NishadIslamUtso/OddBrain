"""Reading files the owner brings in from elsewhere.

Supported, in plain words:

* a Hermes memory file (``MEMORY.md`` or ``USER.md``);
* a ChatGPT export (the ``.zip``, or the ``conversations.json`` inside it);
* a Claude export (the ``.zip``, or its ``conversations.json``);
* a WhatsApp chat (the ``.txt`` from "Export chat");
* any plain ``.txt`` or ``.md`` file, or pasted text: one memory per line, per
  bullet, or per paragraph.

Nothing here writes to the store. :func:`parse` only reads a file and says what
is in it; the manager decides what to do with it.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

MAX_FILE_BYTES = 200 * 1024 * 1024
_MAX_ENTRY_CHARS = 1000


class ImportError_(ValueError):  # noqa: N818 - named to avoid shadowing the builtin
    """A file that cannot be read. The message is written for the owner."""


@dataclass
class Parsed:
    """What a file contained."""

    source: str                       # "ChatGPT", "Claude", "WhatsApp", "a memory file", ...
    notes: list[str] = field(default_factory=list)       # statements the owner wrote for memory
    chats: list[dict[str, Any]] = field(default_factory=list)  # whole conversations, kept as they are

    @property
    def empty(self) -> bool:
        return not self.notes and not self.chats


# -- helpers -----------------------------------------------------------------


def _stamp(value: Any) -> str:
    """A unix time or an ISO string as an ISO day-and-time, or ''."""
    if value in (None, ""):
        return ""
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(float(value), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return str(value)
    except (ValueError, OSError, OverflowError):
        return ""


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-16", "cp1252"):
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return data.decode("utf-8", errors="replace")


# -- plain notes ---------------------------------------------------------------

_BULLET = re.compile(r"^\s*(?:[-*+•]|\d+[.)])\s+")


def split_notes(text: str) -> list[str]:
    """One memory per entry. Understands ``§`` separators, bullets and paragraphs."""
    text = (text or "").replace("\r\n", "\n")
    if re.search(r"^\s*§\s*$", text, re.M):
        raw = re.split(r"^\s*§\s*$", text, flags=re.M)
    else:
        lines = [ln for ln in text.split("\n")]
        if sum(1 for ln in lines if _BULLET.match(ln)) >= 2:
            raw = [_BULLET.sub("", ln) for ln in lines if _BULLET.match(ln)]
        elif "\n\n" in text.strip():
            raw = re.split(r"\n\s*\n", text)
        else:
            raw = lines
    out: list[str] = []
    for entry in raw:
        s = " ".join(entry.split())
        s = re.sub(r"^#+\s*", "", s)          # headings are not memories
        if len(s) < 8 or len(s) > _MAX_ENTRY_CHARS:
            continue
        if s.lower() in ("memory", "user", "notes", "user profile"):
            continue
        out.append(s)
    seen: set[str] = set()
    unique = []
    for s in out:
        key = s.lower()
        if key not in seen:
            seen.add(key)
            unique.append(s)
    return unique


# -- ChatGPT -------------------------------------------------------------------


def _chatgpt_chat(conv: dict[str, Any]) -> dict[str, Any] | None:
    mapping = conv.get("mapping") or {}
    order: list[dict[str, Any]] = []
    node_id = conv.get("current_node")
    seen: set[str] = set()
    while node_id and node_id in mapping and node_id not in seen:
        seen.add(node_id)
        node = mapping[node_id]
        if node.get("message"):
            order.append(node["message"])
        node_id = node.get("parent")
    order.reverse()
    if not order:  # no current_node: fall back to time order
        order = sorted((n["message"] for n in mapping.values() if n.get("message")),
                       key=lambda m: m.get("create_time") or 0)
    parts: list[dict[str, str]] = []
    for msg in order:
        role = (msg.get("author") or {}).get("role")
        if role not in ("user", "assistant"):
            continue
        content = msg.get("content") or {}
        pieces = [p for p in (content.get("parts") or []) if isinstance(p, str) and p.strip()]
        text = "\n".join(pieces).strip()
        if text:
            parts.append({"role": role, "content": text})
    if not any(p["role"] == "user" for p in parts):
        return None
    return {"title": str(conv.get("title") or "ChatGPT chat"), "when": _stamp(conv.get("create_time")),
            "parts": parts, "people": [], "origin": "chatgpt"}


def _claude_chat(conv: dict[str, Any]) -> dict[str, Any] | None:
    parts: list[dict[str, str]] = []
    for msg in conv.get("chat_messages") or []:
        role = "user" if msg.get("sender") == "human" else "assistant"
        text = str(msg.get("text") or "").strip()
        if not text:
            blocks = msg.get("content") or []
            text = "\n".join(
                str(b.get("text", "")) for b in blocks if isinstance(b, dict) and b.get("type") == "text"
            ).strip()
        if text:
            parts.append({"role": role, "content": text})
    if not any(p["role"] == "user" for p in parts):
        return None
    return {"title": str(conv.get("name") or "Claude chat"), "when": _stamp(conv.get("created_at")),
            "parts": parts, "people": [], "origin": "claude"}


def _conversations(obj: Any) -> Parsed:
    if isinstance(obj, dict):
        obj = obj.get("conversations") or [obj]
    if not isinstance(obj, list) or not obj or not isinstance(obj[0], dict):
        raise ImportError_("That file is not a chat export I recognise.")
    first = obj[0]
    if "mapping" in first:
        parsed = Parsed(source="ChatGPT")
        make = _chatgpt_chat
    elif "chat_messages" in first:
        parsed = Parsed(source="Claude")
        make = _claude_chat
    else:
        raise ImportError_("That file is not a chat export I recognise.")
    for conv in obj:
        chat = make(conv) if isinstance(conv, dict) else None
        if chat:
            parsed.chats.append(chat)
    return parsed


# -- WhatsApp ------------------------------------------------------------------

_WA_LINE = re.compile(
    r"^\[?(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap]\.?[Mm]\.?)?)\]?"
    r"\s*(?:-\s*)?([^:]{1,60}?):\s(.*)$"
)


def _whatsapp(text: str, filename: str, me: str) -> Parsed:
    messages: list[tuple[str, str, str]] = []
    for raw in text.replace("\r\n", "\n").split("\n"):
        line = raw.strip("‎‏‪‬ ")
        m = _WA_LINE.match(line)
        if m:
            messages.append((m.group(1), m.group(3).strip(), m.group(4).strip()))
        elif messages and line:
            day, who, body = messages[-1]
            messages[-1] = (day, who, body + "\n" + line)
    if len(messages) < 3:
        raise ImportError_("That does not look like a WhatsApp chat export.")
    names = sorted({who for _, who, _ in messages})
    if not me.strip():
        raise ImportError_(
            "Type your name exactly as it appears in the chat (" + ", ".join(names[:6]) + "), then try again."
        )
    me_key = me.strip().lower()
    if me_key not in {n.lower() for n in names}:
        raise ImportError_(
            f"I could not find “{me.strip()}” in that chat. The names in it are: " + ", ".join(names[:8]) + "."
        )
    parts: list[dict[str, str]] = []
    others: list[str] = []
    for _, who, body in messages:
        if body in ("<Media omitted>", "image omitted", "") or "omitted>" in body:
            continue
        if who.lower() == me_key:
            parts.append({"role": "user", "content": body})
        else:
            parts.append({"role": "assistant", "name": who, "content": body})
            if who not in others:
                others.append(who)
    title = re.sub(r"(?i)^whatsapp chat with\s+", "", re.sub(r"\.txt$", "", filename)).strip() or "WhatsApp chat"
    chat = {"title": f"WhatsApp: {title}", "when": "", "parts": parts, "people": others, "origin": "whatsapp"}
    return Parsed(source="WhatsApp", chats=[chat])


# -- entry point ----------------------------------------------------------------


def parse(name: str, data: bytes, *, me: str = "") -> Parsed:
    """Read an uploaded file. Raises :class:`ImportError_` with a plain message."""
    if len(data) > MAX_FILE_BYTES:
        raise ImportError_("That file is too big (over 200 MB).")
    if not data:
        raise ImportError_("That file is empty.")
    lower = (name or "").lower()

    if lower.endswith(".zip") or data[:2] == b"PK":
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as exc:
            raise ImportError_("I could not open that zip file.") from exc
        with zf:
            target = next((n for n in zf.namelist() if n.lower().endswith("conversations.json")), None)
            if target is None:
                raise ImportError_("There is no conversations.json inside that zip.")
            try:
                return _conversations(json.loads(_decode(zf.read(target))))
            except ValueError as exc:
                if isinstance(exc, ImportError_):
                    raise
                raise ImportError_("The chats file inside that zip is damaged.") from exc

    text = _decode(data)
    if lower.endswith(".json") or text.lstrip().startswith(("[", "{")):
        try:
            return _conversations(json.loads(text))
        except ImportError_:
            raise
        except ValueError as exc:
            raise ImportError_("That file looks damaged: it is not readable JSON.") from exc

    if sum(1 for ln in text.replace("\r\n", "\n").split("\n")[:400] if _WA_LINE.match(ln.strip("‎‏‪‬ "))) >= 3:
        return _whatsapp(text, name or "", me)

    notes = split_notes(text)
    if not notes:
        raise ImportError_("I did not find anything to remember in that file.")
    label = "a memory file" if re.search(r"(?i)(memory|user)\.md$", lower) else "a notes file"
    return Parsed(source=label, notes=notes)


def parse_text(text: str) -> Parsed:
    """Pasted text: one memory per line, bullet or paragraph."""
    notes = split_notes(text)
    if not notes:
        raise ImportError_("I did not find anything to remember in that text.")
    return Parsed(source="pasted text", notes=notes)
