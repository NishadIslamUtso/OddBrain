"""Model selector — the app's aux-model pattern.

Every model slot uses the same three knobs: ``provider``, ``model``,
``base_url``. ``provider: auto`` follows the main model. Local Ollama is
selectable explicitly via ``base_url``. Nothing here guesses a paid endpoint.

Slots:
    main                 — the owner's main model
    auxiliary.extract    — fact extraction on capture
    auxiliary.dream      — nightly consolidation / conflicts
    auxiliary.embed      — embeddings (local model default)
    auxiliary.rerank     — optional result reranking
    auxiliary.chapter    — Life Story drafting
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"

SLOTS: tuple[str, ...] = ("extract", "dream", "embed", "rerank", "chapter")


@dataclass(slots=True)
class ModelSlot:
    """One model slot: provider / model / base_url."""

    provider: str = "auto"
    model: str = ""
    base_url: str = ""

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "ModelSlot":
        data = data or {}
        return cls(
            provider=str(data.get("provider", "auto")),
            model=str(data.get("model", "")),
            base_url=str(data.get("base_url", "")),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model,
            "base_url": self.base_url,
        }

    def resolves_to(self, main: "ModelSlot") -> "ModelSlot":
        """Resolve ``auto`` against the main slot."""
        if self.provider != "auto":
            return self
        return ModelSlot(
            provider=main.provider,
            model=self.model or main.model,
            base_url=self.base_url or main.base_url,
        )

    @property
    def is_local(self) -> bool:
        return "ollama" in self.provider.lower() or "localhost" in self.base_url or "127.0.0.1" in self.base_url


@dataclass(slots=True)
class ModelConfig:
    """The full model selector: main + auxiliary slots."""

    main: ModelSlot = field(default_factory=ModelSlot)
    auxiliary: dict[str, ModelSlot] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "ModelConfig":
        data = data or {}
        aux_in = data.get("auxiliary", {}) or {}
        aux = {name: ModelSlot.from_dict(aux_in.get(name)) for name in SLOTS}
        return cls(
            main=ModelSlot.from_dict(data.get("main")),
            auxiliary=aux,
        )

    @classmethod
    def load(cls, path: str | os.PathLike[str]) -> "ModelConfig":
        """Load from a JSON file; missing file means all-auto defaults."""
        try:
            with open(path, encoding="utf-8") as fh:
                return cls.from_dict(json.load(fh))
        except (FileNotFoundError, json.JSONDecodeError):
            return cls()

    def save(self, path: str | os.PathLike[str]) -> None:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(self.to_dict(), fh, indent=2)

    def to_dict(self) -> dict[str, Any]:
        return {
            "main": self.main.to_dict(),
            "auxiliary": {name: slot.to_dict() for name, slot in self.auxiliary.items()},
        }

    def slot(self, name: str) -> ModelSlot:
        """Resolve a slot against main."""
        slot = self.auxiliary.get(name, ModelSlot())
        return slot.resolves_to(self.main)

    def describe(self) -> str:
        lines = [f"main: {self.main.provider} / {self.main.model or '(default)'}"]
        for name in SLOTS:
            s = self.slot(name)
            lines.append(f"  {name}: {s.provider} / {s.model or '(default)'}")
        return "\n".join(lines)


# --- Calls -----------------------------------------------------------------


class ModelError(RuntimeError):
    """Raised when a model call fails."""


def _post_json(url: str, payload: dict[str, Any], timeout: float = 60.0) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise ModelError(f"model call failed: {url}: {exc}") from exc


def _ollama_url(base_url: str, path: str) -> str:
    return base_url.rstrip("/") + path


def chat(
    slot: ModelSlot,
    messages: list[dict[str, str]],
    *,
    timeout: float = 120.0,
) -> str:
    """Send a chat completion to *slot* and return the assistant text."""
    model = slot.model or "llama3.2"
    if slot.is_local or slot.provider in ("ollama", "local"):
        data = _post_json(
            _ollama_url(slot.base_url or DEFAULT_OLLAMA_URL, "/api/chat"),
            {"model": model, "messages": messages, "stream": False},
            timeout=timeout,
        )
        return str(data.get("message", {}).get("content", ""))
    # OpenAI-compatible endpoint
    base = slot.base_url or os.environ.get("OPENAI_BASE_URL", "")
    if not base:
        raise ModelError("no base_url configured for a non-local model")
    data = _post_json(
        base.rstrip("/") + "/chat/completions",
        {"model": model, "messages": messages},
        timeout=timeout,
    )
    try:
        return str(data["choices"][0]["message"]["content"])
    except (KeyError, IndexError) as exc:
        raise ModelError(f"unexpected model response: {data!r}") from exc


def embed(slot: ModelSlot, text: str) -> list[float]:
    """Return an embedding for *text* from a local Ollama model."""
    model = slot.model or "nomic-embed-text"
    data = _post_json(
        _ollama_url(slot.base_url or DEFAULT_OLLAMA_URL, "/api/embeddings"),
        {"model": model, "prompt": text},
        timeout=60.0,
    )
    vec = data.get("embedding")
    if not vec:
        raise ModelError("embedding model returned no vector")
    return [float(x) for x in vec]


def is_available(slot: ModelSlot, *, timeout: float = 3.0) -> bool:
    """Cheap liveness check for a local model server."""
    if not (slot.is_local or slot.provider in ("ollama", "local")):
        return False
    try:
        req = urllib.request.Request(
            _ollama_url(slot.base_url or DEFAULT_OLLAMA_URL, "/api/tags"),
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=timeout):
            return True
    except urllib.error.URLError:
        return False
