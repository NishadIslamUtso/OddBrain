"""The few settings that exist, and what each one does.

Every setting here changes behaviour that the app actually has:

* ``semantic``       – search by meaning when an embedding model is reachable;
* ``local_only``     – never send memory text to an online AI;
* ``guardrails``     – words and phrases that are never remembered;
* ``sync_hermes``    – keep Hermes's own memory notes up to date;
* ``bio_sensitive``  – allow health and money details into the biography.

The model choice lives in ``models.json`` (see :mod:`memory_ob.models`).
Appearance is not a setting: the screens follow the host app.

Stored in the vault's private ``.brain/settings.json`` — outside the notes,
never in an export. Keys from older versions are ignored when read.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MAX_GUARDRAILS = 200
MAX_GUARDRAIL_LEN = 120


@dataclass(slots=True)
class AppSettings:
    semantic: bool = True
    local_only: bool = False
    guardrails: list[str] = field(default_factory=list)
    sync_hermes: bool = False
    bio_sensitive: bool = False

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AppSettings:
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in data.items() if k in known})

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


KEYS = frozenset(AppSettings.__dataclass_fields__)  # type: ignore[attr-defined]


def path_for(vault: Path) -> Path:
    return Path(vault) / ".brain" / "settings.json"


def load(vault: Path) -> AppSettings:
    p = path_for(vault)
    if not p.is_file():
        return AppSettings()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("settings must be an object")
        settings = AppSettings.from_dict(data)
        settings.guardrails = clean_words(settings.guardrails)
        return settings
    except (OSError, ValueError):
        logger.warning("settings unreadable, using defaults")
        return AppSettings()


def save(vault: Path, settings: AppSettings) -> Path:
    p = path_for(vault)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(settings.to_dict(), indent=2, sort_keys=True), encoding="utf-8")
    return p


def clean_words(values: Any) -> list[str]:
    """A tidy list of "never remember" words: trimmed, no blanks, no repeats."""
    if isinstance(values, str):
        values = [values]
    out: list[str] = []
    seen: set[str] = set()
    for raw in values or []:
        word = " ".join(str(raw).split())[:MAX_GUARDRAIL_LEN]
        key = word.lower()
        if word and key not in seen:
            seen.add(key)
            out.append(word)
        if len(out) >= MAX_GUARDRAILS:
            break
    return out


def update(vault: Path, **changes: Any) -> AppSettings:
    """Apply *changes* to the stored settings and return the result.

    Unknown keys are ignored; values are coerced to the right type so a stray
    string can never end up where a switch belongs.
    """
    data = load(vault).to_dict()
    for key, value in changes.items():
        if key not in KEYS:
            continue
        if key == "guardrails":
            data[key] = clean_words(value)
        else:
            data[key] = bool(value)
    saved = AppSettings.from_dict(data)
    save(vault, saved)
    return saved
