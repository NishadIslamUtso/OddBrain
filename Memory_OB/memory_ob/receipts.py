"""Sharing receipts (folder 07).

Every time memory goes out — recall sent to an AI, records shared with a
person or a gateway — a receipt lands in ``07 Sharing Receipts``. Receipts
are audit records, never blockers: they say who got what, when, and on what
basis (allowed, or neverSend and therefore nothing).
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .config import VAULT_FOLDER_NAMES
from .ids import new_id

RECEIPT_FOLDER = "07 Sharing Receipts"


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _slug(text: str, max_len: int = 50) -> str:
    import re

    s = re.sub(r"[^\w\s-]", "", text or "").strip().lower()
    s = re.sub(r"\s+", "-", s)
    return (s[:max_len].rstrip("-")) or "receipt"


@dataclass(slots=True)
class Receipt:
    """One sharing receipt."""

    id: str
    at: str
    recipient: str
    basis: str
    record_ids: list[str] = field(default_factory=list)
    record_hashes: list[str] = field(default_factory=list)
    purpose: str = ""

    def to_dict(self) -> dict[str, Any]:
        from dataclasses import asdict

        return asdict(self)

    def render(self) -> str:
        lines = [
            "---",
            f"id: {self.id}",
            f"at: {self.at}",
            f"recipient: {self.recipient}",
            f"basis: {self.basis}",
            f"purpose: {self.purpose}",
            "algorithm: sha256",
            "record_ids: [" + ", ".join(self.record_ids) + "]",
            "record_hashes: [" + ", ".join(self.record_hashes) + "]",
            "---",
            "",
            f"# Sharing receipt — {self.recipient}",
            "",
            f"- When: {self.at}",
            f"- Basis: {self.basis}",
            f"- Purpose: {self.purpose}",
            f"- Records: {len(self.record_ids)}",
            "",
        ]
        for rid, h in zip(self.record_ids, self.record_hashes):
            lines.append(f"- `{rid}` — {h}")
        lines.append("")
        return "\n".join(lines)


class ReceiptLog:
    """Writes and reads sharing receipts in the vault."""

    def __init__(self, vault: Path) -> None:
        self.vault = Path(vault)
        self.folder = self.vault / RECEIPT_FOLDER

    def _ensure(self) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)

    def record(
        self,
        recipient: str,
        records: Iterable[Any],
        *,
        basis: str = "allowed",
        purpose: str = "",
    ) -> Receipt:
        """Write a receipt for a share that just happened."""
        self._ensure()
        recs = list(records)
        receipt = Receipt(
            id=new_id(),
            at=_now(),
            recipient=recipient,
            basis=basis,
            record_ids=[r.id for r in recs],
            record_hashes=[
                (r.source or {}).get("quote_hash", "") or _body_hash(r) for r in recs
            ],
            purpose=purpose,
        )
        path = self.folder / f"{receipt.at[:10]}-{_slug(recipient)}-{receipt.id[:8]}.md"
        path.write_text(receipt.render(), encoding="utf-8")
        return receipt

    def list(self, *, limit: int = 100) -> list[Path]:
        if not self.folder.is_dir():
            return []
        return sorted(self.folder.glob("*.md"), reverse=True)[:limit]


def _body_hash(record: Any) -> str:
    import hashlib

    return hashlib.sha256((record.body or "").encode("utf-8")).hexdigest()[:16]


def receipt_path(vault: Path) -> Path:
    return Path(vault) / RECEIPT_FOLDER
