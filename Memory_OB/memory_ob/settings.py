"""Extended settings (§8).

The model selector lives in ``models.json`` (see :mod:`memory_ob.models`).
Everything else the Settings page holds lives here: the brain path, whether
semantic search is on, the consistency-sweep schedule, the pre-compression
checkpoint switch, and the backup location.

Stored in the vault's private ``.brain/settings.json`` — outside git, never
in the export.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DEFAULTS: dict[str, Any] = {
    "brain_path": "",
    "semantic": True,
    "sweep_schedule": "nightly",
    "checkpoint_required": True,
    "backup_dir": "",
    "demo_visible": False,
    "local_only": False,
    "autonomous": False,
    "guardrails": [],
    # Appearance. Validated by memory_ob.appearance before they are stored,
    # because they reach the UI as CSS custom properties.
    "theme": "auto",
    "accent": "#d4a74a",
    "font_family": "",
    "font_size": 14,
    "density": "comfortable",
}


@dataclass(slots=True)
class AppSettings:
    brain_path: str = ""
    semantic: bool = True
    sweep_schedule: str = "nightly"
    checkpoint_required: bool = True
    backup_dir: str = ""
    demo_visible: bool = False
    local_only: bool = False
    autonomous: bool = False
    guardrails: list[str] = field(default_factory=list)
    theme: str = "auto"
    accent: str = "#d4a74a"
    font_family: str = ""
    font_size: int = 14
    density: str = "comfortable"
    extra: dict[str, Any] = field(default_factory=dict)

    def appearance(self):
        """The appearance subset, as a validated object."""
        from .appearance import Appearance

        return Appearance.from_dict(self.to_dict())

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AppSettings:
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in data.items() if k in known})

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def path_for(vault: Path) -> Path:
    return Path(vault) / ".brain" / "settings.json"


def load(vault: Path) -> AppSettings:
    p = path_for(vault)
    if not p.is_file():
        return AppSettings()
    try:
        return AppSettings.from_dict(json.loads(p.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        logger.warning("settings unreadable, using defaults")
        return AppSettings()


def save(vault: Path, settings: AppSettings) -> Path:
    p = path_for(vault)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(
        json.dumps(settings.to_dict(), indent=2, sort_keys=True), encoding="utf-8"
    )
    return p


def update(vault: Path, **changes: Any) -> AppSettings:
    """Apply *changes* to the stored settings and return the result.

    Appearance values are validated before they are stored — they reach the UI
    as CSS, so a bad value is clamped to the default rather than saved.
    """
    current = load(vault)
    data = current.to_dict()
    appearance_keys = {"theme", "accent", "font_family", "font_size", "density"}
    incoming = {k: v for k, v in changes.items() if k in appearance_keys}
    if incoming:
        from .appearance import Appearance

        cleaned = Appearance.clean({**data, **incoming})
        data.update(cleaned.to_dict())
        changes = {k: v for k, v in changes.items() if k not in appearance_keys}
    for key, value in changes.items():
        if key in DEFAULTS:
            data[key] = value
    saved = AppSettings.from_dict(data)
    save(vault, saved)
    return saved
