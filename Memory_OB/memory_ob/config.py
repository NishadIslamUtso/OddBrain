"""Configuration — paths and defaults.

Defaults follow the owner's layout:

    vault  = Documents/Hermes/Memory_OB      (the 12-folder markdown view)
    store  = <vault>/.brain/memory_ob.db     (the SQLite engine)
    models = <vault>/.brain/models.json      (the model selector)

Everything can be overridden with --db / --vault or the MEMORY_OB_* env vars.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

APP_NAME = "Memory_OB"

VAULT_FOLDER_NAMES: tuple[str, ...] = (
    "00 System",
    "01 Inbox",
    "02 Sources",
    "03 Memory",
    "04 Working Memory",
    "05 Knowledge",
    "06 Review",
    "07 Sharing Receipts",
    "08 Journal",
    "09 Activity & Undo",
    "10 People",
    "90 Archive",
)


def home_dir() -> Path:
    return Path.home()


def default_vault() -> Path:
    env = os.environ.get("MEMORY_OB_VAULT")
    if env:
        return Path(env).expanduser()
    return home_dir() / "Documents" / "Hermes" / APP_NAME


def default_db(vault: Path | None = None) -> Path:
    env = os.environ.get("MEMORY_OB_DB")
    if env:
        return Path(env).expanduser()
    return (vault or default_vault()) / ".brain" / "memory_ob.db"


def default_models_path(vault: Path | None = None) -> Path:
    env = os.environ.get("MEMORY_OB_MODELS")
    if env:
        return Path(env).expanduser()
    return (vault or default_vault()) / ".brain" / "models.json"


def default_token_path(vault: Path | None = None) -> Path:
    env = os.environ.get("MEMORY_OB_TOKEN")
    if env:
        return Path(env).expanduser()
    return (vault or default_vault()) / ".brain" / "token"


@dataclass(slots=True)
class Settings:
    """Resolved settings for one run."""

    vault: Path
    db: Path
    models_path: Path
    token_path: Path
    sync_enabled: bool = False

    @classmethod
    def resolve(
        cls,
        *,
        vault: str | Path | None = None,
        db: str | Path | None = None,
        models_path: str | Path | None = None,
        token_path: str | Path | None = None,
        sync_enabled: bool | None = None,
    ) -> "Settings":
        v = Path(vault).expanduser() if vault else default_vault()
        if sync_enabled is None:
            raw = os.environ.get("MEMORY_OB_SYNC", "")
            sync_enabled = raw.strip().lower() in {"1", "true", "yes", "on"}
        return cls(
            vault=v,
            db=Path(db).expanduser() if db else default_db(v),
            models_path=(
                Path(models_path).expanduser()
                if models_path
                else default_models_path(v)
            ),
            token_path=(
                Path(token_path).expanduser()
                if token_path
                else default_token_path(v)
            ),
            sync_enabled=bool(sync_enabled),
        )

    def ensure_dirs(self) -> None:
        self.db.parent.mkdir(parents=True, exist_ok=True)
        self.models_path.parent.mkdir(parents=True, exist_ok=True)
        for name in VAULT_FOLDER_NAMES:
            (self.vault / name).mkdir(parents=True, exist_ok=True)
