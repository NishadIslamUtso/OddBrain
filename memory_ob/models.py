"""Model selector + backends.

The selector is the app's aux-model pattern: every slot is
``provider / model / base_url`` with ``provider: auto`` as the default.

The important part is what ``auto`` *means*:

* **Hosted in Hermes** — ``auto`` resolves through Hermes's own model system:
  the same provider chain, the same credentials, the same behaviour as every
  other auxiliary task in the app. Memory_OB never reimplements that chain; it
  reads Hermes's config and calls through Hermes's local proxy.
* **Standalone** — ``auto`` falls back to a local Ollama model, or to an
  explicit ``base_url`` the owner configured.

Backends:
    HermesBackend  — Hermes proxy → Hermes main endpoint → error
    LocalBackend   — local Ollama, or any OpenAI-compatible endpoint
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from . import hermes

DEFAULT_EMBED_MODEL = "nomic-embed-text"


def embed_model_name(slot: "ModelSlot") -> str:
    """The embedding model actually used for *slot* (the default when none is chosen)."""
    return (slot.model or DEFAULT_EMBED_MODEL).strip()


def embed_prefix(model: str, kind: str) -> str:
    """The task prefix an embedding model was trained with, or ''.

    Nomic's models (v1, v1.5 and v2-moe) are trained on prefixed text:
    ``search_document:`` for what is stored and ``search_query:`` for what is
    asked. Without them the matches are noticeably worse. Mixedbread's models
    expect an instruction on the question only. Other models take plain text.
    """
    name = (model or "").lower()
    if "nomic-embed" in name:
        return "search_query: " if kind == "query" else "search_document: "
    if "mxbai-embed" in name and kind == "query":
        return "Represent this sentence for searching relevant passages: "
    return ""


DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"

SLOTS: tuple[str, ...] = ("extract", "embed")

_LOCAL_PROVIDERS = ("local", "custom", "lmstudio", "vllm", "llamacpp", "openai-compatible")
# Servers that speak the OpenAI shape (/v1/chat/completions): llama.cpp's llama-server, LM Studio, vLLM.
_OPENAI_PROVIDERS = ("openai", "openai-compatible", "lmstudio", "vllm", "llamacpp", "llama.cpp", "llama-server")


def _port_of(address: str) -> int | None:
    from urllib.parse import urlparse

    try:
        return urlparse(address if "://" in address else "http://" + address).port
    except ValueError:
        return None


def _v1(base_url: str) -> str:
    """An OpenAI-style server's base address, always ending in ``/v1``."""
    base = (base_url or "").rstrip("/")
    return base if base.endswith("/v1") else base + "/v1"


def _host_of(address: str) -> str:
    from urllib.parse import urlparse

    try:
        return (urlparse(address if "://" in address else "http://" + address).hostname or "").lower()
    except ValueError:
        return ""


def _is_this_computer(address: str) -> bool:
    """True when *address* really points at this computer (and nowhere else).

    Looks at the host itself, never at a substring: ``https://localhost.example.com`` and
    ``https://example.com/?127.0.0.1`` are not this computer. Only ``localhost`` and a loopback
    address count. A LAN address (192.168.x.x), a machine name and a public name do not: the
    words would leave this computer.
    """
    import ipaddress

    host = _host_of(address)
    if not host:
        return False
    if host == "localhost":
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    if getattr(ip, "ipv4_mapped", None) is not None:
        ip = ip.ipv4_mapped
    return ip.is_loopback or str(ip) == "0.0.0.0"


def is_this_computer(address: str) -> bool:
    """Public name for the check above, for the screens' settings."""
    return _is_this_computer(address)


@dataclass(slots=True)
class ModelSlot:
    """One model slot: provider / model / base_url."""

    provider: str = "auto"
    model: str = ""
    base_url: str = ""

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ModelSlot:
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

    def resolves_to(self, main: ModelSlot) -> ModelSlot:
        """Resolve ``auto`` against the main slot."""
        if self.provider != "auto":
            return self
        return ModelSlot(
            provider=main.provider,
            model=self.model or main.model,
            base_url=self.base_url or main.base_url,
        )

    @property
    def api_kind(self) -> str:
        """``ollama`` or ``openai``: which language the server at this slot speaks.

        Ollama has its own (``/api/chat``); llama.cpp's llama-server, LM Studio and vLLM
        speak the OpenAI one (``/v1/chat/completions``). With no better hint, an address
        that is not Ollama's usual port is taken to be an OpenAI-style server.
        """
        provider = self.provider.lower()
        if "ollama" in provider:
            return "ollama"
        if provider in _OPENAI_PROVIDERS:
            return "openai"
        if not self.base_url or _port_of(self.base_url) == 11434:
            return "ollama"
        return "openai"

    @property
    def is_local(self) -> bool:
        """True for a model served on this computer (Ollama and friends).

        ``auto`` with no address means "whatever is running locally", which is
        Ollama at its usual address; ``auto`` with an online address does not.
        """
        provider = self.provider.lower()
        if self.base_url:
            return _is_this_computer(self.base_url)       # the address decides, whatever the provider is called
        return "ollama" in provider or provider in _LOCAL_PROVIDERS or provider in ("auto", "")


@dataclass(slots=True)
class ModelConfig:
    """The full model selector: main + auxiliary slots."""

    main: ModelSlot = field(default_factory=ModelSlot)
    auxiliary: dict[str, ModelSlot] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ModelConfig:
        data = data or {}
        aux_in = data.get("auxiliary", {}) or {}
        aux = {name: ModelSlot.from_dict(aux_in.get(name)) for name in SLOTS}
        return cls(
            main=ModelSlot.from_dict(data.get("main")),
            auxiliary=aux,
        )

    @classmethod
    def load(cls, path: str | os.PathLike[str]) -> ModelConfig:
        """Load from a JSON file; missing file means all-auto defaults."""
        try:
            with open(path, encoding="utf-8") as fh:
                return cls.from_dict(json.load(fh))
        except (FileNotFoundError, json.JSONDecodeError):
            return cls()

    def save(self, path: str | os.PathLike[str]) -> None:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(self.to_dict(), fh, indent=2)

    def to_dict(self) -> dict[str, Any]:
        return {
            "main": self.main.to_dict(),
            "auxiliary": {name: slot.to_dict() for name, slot in self.auxiliary.items()},
        }

    def slot(self, name: str) -> ModelSlot:
        """Resolve a slot against main."""
        slot = self.auxiliary.get(name, ModelSlot())
        if name == "embed":
            # An embedding model is not the chat model: never borrow its name.
            main = self.main
            return ModelSlot(
                provider=slot.provider if slot.provider != "auto" else main.provider,
                model=slot.model,
                base_url=slot.base_url or main.base_url,
            )
        return slot.resolves_to(self.main)

    def describe(self) -> str:
        lines = [f"main: {self.main.provider} / {self.main.model or '(default)'}"]
        for name in SLOTS:
            s = self.slot(name)
            lines.append(f"  {name}: {s.provider} / {s.model or '(default)'}")
        return "\n".join(lines)


# --- Backends --------------------------------------------------------------


class ModelError(RuntimeError):
    """Raised when a model call fails."""


class ModelBackend(Protocol):
    """Something that can answer a chat or an embedding request."""

    name: str

    def chat(self, slot: ModelSlot, messages: list[dict[str, str]]) -> str: ...

    def embed(self, slot: ModelSlot, text: str) -> list[float]: ...


# -- "Keep everything on this computer" ------------------------------------------------------
#
# With the switch on, no request to an AI leaves this computer. This is checked where the
# request is made (every call below goes through ``_urlopen``), not only where the model is
# chosen, so no setting, saved choice or environment variable can get around it.


def local_only_active() -> bool:
    """True when the owner chose "Keep everything on this computer" (or the matching environment variable)."""
    import os

    if _LOCAL_ONLY or os.environ.get("MEMORY_OB_LOCAL_ONLY", "").lower() in ("1", "true", "yes"):
        return True
    if _VAULT is not None:
        try:
            from .settings import load

            return bool(load(_VAULT).local_only)
        except Exception:  # noqa: BLE001, S110
            return False
    return False


def blocked_by_local_only(address: str) -> bool:
    """True when *address* must not be contacted because the switch is on and it is not this computer."""
    return local_only_active() and not _is_this_computer(address)


class _NoRemoteRedirect(urllib.request.HTTPRedirectHandler):
    """A local server must not be able to send a request on to somewhere else."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        if not _is_this_computer(newurl):
            raise urllib.error.URLError(f"redirect to {_host_of(newurl) or 'another address'} refused (kept on this computer)")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _urlopen(req: urllib.request.Request, timeout: float):
    """``urlopen`` that refuses any address off this computer while the owner keeps everything local."""
    if local_only_active():
        if not _is_this_computer(req.full_url):
            raise urllib.error.URLError(
                f"“Keep everything on this computer” is on, so I did not contact {_host_of(req.full_url) or 'that address'}")
        return urllib.request.build_opener(_NoRemoteRedirect).open(req, timeout=timeout)
    return urllib.request.urlopen(req, timeout=timeout)


def _post_json(
    url: str,
    payload: dict[str, Any],
    timeout: float = 60.0,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
    try:
        with _urlopen(req, timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise ModelError(f"model call failed: {url}: {exc}") from exc


def _openai_chat(
    base_url: str,
    model: str,
    messages: list[dict[str, str]],
    *,
    api_key: str = "",
    timeout: float = 120.0,
) -> str:
    """Call an OpenAI-compatible ``/chat/completions`` endpoint."""
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {api_key or 'hermes'}"}
    data = _post_json(
        url,
        {"model": model, "messages": messages, "stream": False},
        timeout=timeout,
        headers=headers,
    )
    try:
        return str(data["choices"][0]["message"]["content"])
    except (KeyError, IndexError) as exc:
        raise ModelError(f"unexpected model response: {data!r}") from exc


def _openai_embed(
    base_url: str,
    model: str,
    text: str,
    *,
    api_key: str = "",
    timeout: float = 120.0,
) -> list[float]:
    """Call an OpenAI-compatible ``/embeddings`` endpoint.

    This is the shape llama.cpp's ``llama-server``, LM Studio, vLLM and most
    self-hosted servers speak: ``{"model": ..., "input": ...}`` and a
    ``data[0].embedding`` vector back. Ollama's ``/api/embeddings`` is the
    other shape, handled separately.
    """
    url = base_url.rstrip("/") + "/embeddings"
    headers = {"Authorization": f"Bearer {api_key or 'hermes'}"}
    data = _post_json(
        url, {"model": model, "input": text}, timeout=timeout, headers=headers
    )
    try:
        vec = data["data"][0]["embedding"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ModelError(f"unexpected embedding response: {data!r}") from exc
    if not vec:
        raise ModelError("embedding model returned no vector")
    return [float(x) for x in vec]


def _ollama_chat(
    base_url: str, model: str, messages: list[dict[str, str]], timeout: float = 120.0
) -> str:
    data = _post_json(
        base_url.rstrip("/") + "/api/chat",
        {"model": model, "messages": messages, "stream": False},
        timeout=timeout,
    )
    return str(data.get("message", {}).get("content", ""))


def _ollama_embed(base_url: str, model: str, text: str) -> list[float]:
    data = _post_json(
        base_url.rstrip("/") + "/api/embeddings",
        {"model": model, "prompt": text},
        timeout=60.0,
    )
    vec = data.get("embedding")
    if not vec:
        raise ModelError("embedding model returned no vector")
    return [float(x) for x in vec]


class HermesBackend:
    """Routes model calls through Hermes's own model system.

    Order:
      1. Hermes proxy (``hermes proxy``) — Hermes attaches the real
         credentials and picks the upstream. This is the same path every other
         auxiliary task in the app effectively uses.
      2. Hermes's main endpoint (``model.base_url``) with the main model.
      3. Nothing else — we never guess a paid endpoint.
    """

    name = "hermes"

    def __init__(self, config: ModelConfig | None = None) -> None:
        self.config = config or ModelConfig()

    def _model(self, slot: ModelSlot) -> str:
        if slot.model:
            return slot.model
        return hermes.main_slot().get("model") or "default"

    def chat(self, slot: ModelSlot, messages: list[dict[str, str]]) -> str:
        model = self._model(slot)
        if hermes.proxy_available():
            return _openai_chat(hermes.proxy_base(), model, messages)
        main = hermes.main_slot()
        if main.get("base_url"):
            key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
            return _openai_chat(main["base_url"], model, messages, api_key=key)
        raise ModelError(
            "no Hermes model route available — start one with `hermes proxy start`"
        )

    def embed(self, slot: ModelSlot, text: str) -> list[float]:
        # Hermes has no embedding auxiliary block; embeddings stay local.
        return LocalBackend(self.config).embed(slot, text)


class LocalBackend:
    """Standalone: local Ollama, or any OpenAI-compatible endpoint."""

    name = "local"

    def __init__(self, config: ModelConfig | None = None) -> None:
        self.config = config or ModelConfig()

    @staticmethod
    def _ollama(slot: ModelSlot) -> str:
        return slot.base_url or DEFAULT_OLLAMA_URL

    @staticmethod
    def _model(slot: ModelSlot, default: str) -> str:
        return slot.model or default

    def chat(self, slot: ModelSlot, messages: list[dict[str, str]]) -> str:
        if slot.api_kind == "ollama" and (slot.is_local or "ollama" in slot.provider.lower()):
            return _ollama_chat(self._ollama(slot), self._model(slot, "llama3.2"), messages)
        base = slot.base_url or os.environ.get("OPENAI_BASE_URL", "")
        if not base:
            raise ModelError("no base_url configured for a non-local model")
        if slot.is_local:
            base = _v1(base)          # llama.cpp / LM Studio / vLLM on this computer
        key = os.environ.get("OPENAI_API_KEY", "")
        return _openai_chat(base, slot.model or "default", messages, api_key=key)

    def embed(self, slot: ModelSlot, text: str) -> list[float]:
        model = self._model(slot, "nomic-embed-text")
        if slot.api_kind == "ollama":
            return _ollama_embed(self._ollama(slot), model, text)
        # llama.cpp / LM Studio / vLLM and other OpenAI-compatible servers.
        base = slot.base_url or os.environ.get("OPENAI_BASE_URL", "")
        if not base:
            raise ModelError("no base_url configured for the embedding model")
        if slot.is_local:
            base = _v1(base)
        return _openai_embed(
            base, model, text, api_key=os.environ.get("OPENAI_API_KEY", "")
        )


_LOCAL_ONLY = False
_VAULT = None


def configure_local_only(vault) -> None:
    global _LOCAL_ONLY, _VAULT
    _VAULT = vault
    try:
        from .settings import load

        _LOCAL_ONLY = bool(load(vault).local_only)
    except Exception:
        _LOCAL_ONLY = False


def resolve_backend(config: ModelConfig | None = None) -> ModelBackend:
    """Pick the backend: Hermes when it is present, otherwise local.

    When local-only mode is on (the owner's "offline AI only" choice),
    Hermes is never used even if it is installed — memory text stays local.
    """
    local_only = local_only_active()
    cfg = config or ModelConfig()
    if cfg.main.provider not in ("auto", "", "hermes"):
        # The owner chose a model of their own: honour it, Hermes or not.
        return LocalBackend(cfg)
    if (not local_only) and hermes.available() and (
        hermes.proxy_available() or hermes.main_slot().get("base_url")
    ):
        return HermesBackend(cfg)
    return LocalBackend(cfg)


def backend_name() -> str:
    return resolve_backend().name


def model_call(slot_name: str, config: ModelConfig | None = None):
    """Build a ``prompt -> text`` callable that routes through the backend.

    This is the seam the pipeline uses: extraction and meaning search both
    call a model the same way the rest of Hermes does.
    The backend is resolved per call, so a proxy that comes up later is picked
    up without rebuilding anything.
    """
    cfg = config or ModelConfig()
    slot = cfg.slot(slot_name)

    def call(prompt: str) -> str:
        return resolve_backend(cfg).chat(
            slot, [{"role": "user", "content": prompt}]
        )

    return call


def helper_state(config: ModelConfig | None = None, slot_name: str = "extract") -> dict[str, str]:
    """Is an AI helper reachable right now, and through what?

    A quick check with no model call: it never spends anything and answers in
    about a second at most. ``kind`` is ``hermes``, ``local``, ``online`` or
    ``none``.
    """
    cfg = config or ModelConfig()
    backend = resolve_backend(cfg)
    slot = cfg.slot(slot_name)
    if backend.name == "hermes":
        return {"kind": "hermes", "ready": "yes"}
    if is_available(slot):
        return {"kind": "local", "ready": "yes"}
    if slot.base_url and not slot.is_local and not blocked_by_local_only(slot.base_url):
        return {"kind": "online", "ready": "yes"}
    return {"kind": "none", "ready": "no"}


def helper(config: ModelConfig | None = None, slot_name: str = "extract"):
    """A ``prompt -> text`` callable when an AI helper is reachable, else None.

    Unlike :func:`model_call`, which always returns a callable, this says up
    front whether there is anything to call, so callers do not sit waiting for
    a connection that will never come.
    """
    cfg = config or ModelConfig()
    if helper_state(cfg, slot_name)["ready"] != "yes":
        return None
    return model_call(slot_name, cfg)


# --- Module-level convenience ---------------------------------------------


def chat(
    slot: ModelSlot,
    messages: list[dict[str, str]],
    *,
    backend: ModelBackend | None = None,
    timeout: float = 120.0,
) -> str:
    """Send a chat completion to *slot* and return the assistant text."""
    b = backend or resolve_backend()
    return b.chat(slot, messages)


def embed(
    slot: ModelSlot,
    text: str,
    *,
    backend: ModelBackend | None = None,
) -> list[float]:
    """Return an embedding for *text*."""
    b = backend or resolve_backend()
    return b.embed(slot, text)


def is_available(slot: ModelSlot, *, timeout: float = 3.0) -> bool:
    """Cheap liveness check for a local model server (remembered briefly, see :mod:`memory_ob.probe`)."""
    if not slot.is_local:
        return False
    from . import probe

    base = (slot.base_url or DEFAULT_OLLAMA_URL).rstrip("/")
    if slot.api_kind == "openai":
        return probe.remembered("openai:" + base, lambda: _openai_server_up(base, timeout))
    return probe.remembered("ollama:" + base, lambda: _server_up(base, timeout))


def _server_up(base: str, timeout: float) -> bool:
    try:
        req = urllib.request.Request(base + "/api/tags", method="GET")
        with _urlopen(req, timeout):
            return True
    except (urllib.error.URLError, OSError, ValueError):
        return False


def _openai_server_up(base: str, timeout: float) -> bool:
    return bool(_get_json(_v1(base) + "/models", timeout) is not None)


def _get_json(url: str, timeout: float) -> Any:
    """The JSON a GET returns, or None when the server cannot be reached or does not answer in JSON."""
    try:
        req = urllib.request.Request(url, method="GET", headers={"Authorization": "Bearer none"})
        with _urlopen(req, timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError):
        return None


def openai_models(base_url: str, *, timeout: float = 3.0) -> list[str]:
    """The model names an OpenAI-style server (llama.cpp, LM Studio, vLLM) offers."""
    data = _get_json(_v1(base_url or "") + "/models", timeout)
    items = data.get("data", []) if isinstance(data, dict) else []
    return sorted(str(m.get("id", "")) for m in items if isinstance(m, dict) and m.get("id"))


def server_models(address: str = "", *, timeout: float = 3.0) -> tuple[str, list[str]]:
    """What kind of AI server is at *address*, and which models it has: ``("ollama" | "openai" | "", names)``.

    At most two quick requests: Ollama's own list first, then the OpenAI-style one.
    """
    base = (address or DEFAULT_OLLAMA_URL).rstrip("/")
    tags = _get_json(base + "/api/tags", timeout)
    if isinstance(tags, dict) and isinstance(tags.get("models"), list):
        return "ollama", sorted(str(m.get("name", "")) for m in tags["models"] if isinstance(m, dict) and m.get("name"))
    data = _get_json(_v1(base) + "/models", timeout)
    if isinstance(data, dict):
        items = data.get("data") if isinstance(data.get("data"), list) else []
        return "openai", sorted(str(m.get("id", "")) for m in items if isinstance(m, dict) and m.get("id"))
    return "", []


def ollama_models(base_url: str = "", *, timeout: float = 3.0) -> list[str]:
    """The model names an Ollama server has installed. Empty when it cannot be reached."""
    try:
        req = urllib.request.Request(
            (base_url or DEFAULT_OLLAMA_URL).rstrip("/") + "/api/tags", method="GET"
        )
        with _urlopen(req, timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return sorted(str(m.get("name", "")) for m in data.get("models", []) if m.get("name"))
    except (urllib.error.URLError, OSError, ValueError):
        return []
