"""Health checks — ``memory-ob doctor``.

One command that answers "is this thing set up right?": the vault, the store,
the token, the model config, the backend, and the shape of the data.

Each check is independent and never raises — a broken piece is reported, not
thrown, because the point is to see everything that is wrong in one pass. A
check that is informational (a count, not a fault) passes but still reports.

The same function backs the CLI and ``GET /api/doctor``, so the dashboard and
the terminal never disagree.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import VAULT_FOLDER_NAMES, Settings
from .models import ModelConfig, is_available


@dataclass(slots=True)
class Check:
    """One health check. ``fix`` says what to do about a failure.

    ``severity`` is what the check MEANS, separate from whether it passed:
    a clean install has no folders, no settings file and no model server, and
    every one of those is normal — reporting them as failures made a healthy
    first run look broken.
    """

    name: str
    ok: bool
    detail: str
    fix: str | None = None
    severity: str = "fail"  # 'fail' | 'warn' | 'ok'

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "ok": self.ok,
            "detail": self.detail,
            "fix": self.fix,
            "severity": self.severity,
        }


@dataclass(slots=True)
class Report:
    checks: list[Check] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        """True when nothing is genuinely wrong.

        Warnings do not fail the run — they are the app saying "this is fine,
        but here is something you might want".
        """
        return all(c.ok or c.severity != "fail" for c in self.checks)

    @property
    def failures(self) -> list[Check]:
        return [c for c in self.checks if not c.ok and c.severity == "fail"]

    @property
    def warnings(self) -> list[Check]:
        return [c for c in self.checks if not c.ok and c.severity == "warn"]

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "passed": sum(1 for c in self.checks if c.ok),
            "failed": len(self.failures),
            "warned": len(self.warnings),
            "checks": [c.to_dict() for c in self.checks],
        }


# --- checks ----------------------------------------------------------------


def _check_vault(settings: Settings) -> Check:
    vault = Path(settings.vault)
    if not vault.is_dir():
        return Check(
            "vault",
            False,
            f"missing: {vault}",
            fix="memory-ob init   (or set --vault to the real folder)",
            severity="warn",
        )
    missing = [n for n in VAULT_FOLDER_NAMES if not (vault / n).is_dir()]
    if missing:
        return Check(
            "vault",
            False,
            f"{vault} is missing {len(missing)} folder(s): {', '.join(missing[:4])}",
            fix="memory-ob init",
            severity="warn",
        )
    return Check("vault", True, f"{vault} — {len(VAULT_FOLDER_NAMES)} folders")


def _check_store(settings: Settings) -> Check:
    db = Path(settings.db)
    if not db.is_file():
        return Check(
            "store",
            False,
            f"missing: {db}",
            fix="memory-ob init   (or run any capture)",
            severity="warn",
        )
    try:
        from .store import Store

        st = Store(db)
        try:
            # A query proves the schema is there, not just the file.
            st.stats()
        finally:
            st.close()
    except Exception as exc:  # noqa: BLE001 - reported, not raised
        return Check(
            "store",
            False,
            f"{db} will not open: {exc}",
            fix="the store may be corrupt — restore from a backup",
        )
    size = db.stat().st_size
    return Check("store", True, f"{db} — {size / 1024:.0f} KB")


def _check_token(settings: Settings) -> Check:
    token = Path(settings.token_path)
    if not token.is_file():
        return Check(
            "token",
            False,
            f"missing: {token}",
            fix="the dashboard will create one on first run",
            severity="warn",
        )
    raw = token.read_text(encoding="utf-8").strip()
    if not raw:
        return Check("token", False, f"{token} is empty", fix="delete it and restart")
    # The token is a secret. It must never be committed, and on a
    # multi-user machine it should not be readable by others.
    if raw in {"brain-local-token", "changeme", "token"}:
        return Check(
            "token",
            False,
            "the token is still the published placeholder",
            fix="delete it and restart to generate a real one",
        )
    detail = f"{token} — {len(raw)} chars"
    mode = token.stat().st_mode & 0o777
    if mode & 0o077:
        detail += f" (warning: mode {mode:o} is group/other readable)"
    return Check("token", True, detail)


def _check_models(settings: Settings) -> Check:
    path = Path(settings.models_path)
    if not path.is_file():
        return Check(
            "models",
            False,
            f"missing: {path}",
            fix="the app falls back to its defaults until you write one",
            severity="warn",
        )
    try:
        ModelConfig.load(path)
    except Exception as exc:  # noqa: BLE001
        return Check("models", False, f"{path} will not parse: {exc}", fix="check the JSON")
    # Deliberately does NOT call resolve_backend(): that would shell out to
    # `hermes config get` three times, which turns a health check into a stall.
    # The name is derived from the same predicate, cheaply.
    from . import hermes

    name = "hermes" if hermes.available() else "local"
    return Check("models", True, f"{path} — backend: {name}")


def _check_backend(settings: Settings) -> Check:
    """Can we actually reach a model right now?

    Uses short probes on purpose: doctor runs on page load, and a health check
    that stalls for four seconds is one nobody runs.
    """
    try:
        cfg = ModelConfig.load(Path(settings.models_path))
    except Exception:  # noqa: BLE001
        return Check("backend", False, "no model config", fix="write a models.json first")

    from . import hermes

    if hermes.available():
        up = hermes.proxy_available(timeout=1.5)
        return Check(
            "backend",
            up,
            f"Hermes proxy: {'up' if up else 'down'}"
            + ("" if up else " — start it with: hermes proxy start"),
            fix=None if up else "hermes proxy start",
            severity="warn",
        )

    slot = cfg.slot("embed")
    up = is_available(slot, timeout=1.5)
    return Check(
        "backend",
        up,
        f"{slot.provider} at {slot.base_url or 'default'}: {'reachable' if up else 'not reachable'}",
        fix=None if up else "start ollama, or point the slot at a reachable server",
        severity="warn",
    )


def _check_data(settings: Settings) -> list[Check]:
    """Shape of the data: embeddings, links, contradictions."""
    from .store import Store

    checks: list[Check] = []
    try:
        st = Store(Path(settings.db))
    except Exception as exc:  # noqa: BLE001
        return [Check("data", False, f"cannot open the store: {exc}", fix="run doctor again")]

    try:
        stats = st.stats()
        total = int(stats.get("records") or 0)
        missing = len(st.missing_embeddings(limit=500))
        checks.append(
            Check(
                "embeddings",
                missing == 0 or total == 0,
                f"{st.count_embeddings()} cached, {missing} record(s) without one",
                fix=None if (missing == 0 or total == 0) else "memory-ob embed",
            )
        )

        # Link hygiene, computed directly rather than through the sweep —
        # the sweep opens Review cards, and doctor must not have side effects.
        records = st.list_records(include_private=True, limit=10000)
        by_id = {r.id for r in records}
        dead = sum(
            1
            for src, dst, _label in st.edges()
            if src not in by_id or dst not in by_id
        )
        checks.append(
            Check(
                "links",
                dead == 0,
                f"{dead} dead link(s)",
                fix=None if dead == 0 else "memory-ob sweep",
            )
        )

        never = sum(1 for r in records if r.never_send)
        checks.append(
            Check(
                "never_send",
                True,
                f"{never} record(s) marked neverSend",
                fix=None,
            )
        )
        checks.append(
            Check(
                "counts",
                True,
                f"{total} record(s), {stats.get('facts', 0)} candidate fact(s), "
                f"{stats.get('edges', 0)} edge(s)",
                fix=None,
            )
        )
    finally:
        st.close()
    return checks


def run_checks(settings: Settings) -> Report:
    """Every check, in a stable order. Never raises."""
    report = Report()
    for fn in (_check_vault, _check_store, _check_token, _check_models, _check_backend):
        try:
            report.checks.append(fn(settings))
        except Exception as exc:  # noqa: BLE001 - a check must not kill the run
            report.checks.append(Check(fn.__name__, False, f"check crashed: {exc}"))
    try:
        report.checks.extend(_check_data(settings))
    except Exception as exc:  # noqa: BLE001
        report.checks.append(Check("data", False, f"check crashed: {exc}"))
    return report


def doctor(settings: Settings) -> dict[str, Any]:
    """The report as JSON, for the API."""
    report = run_checks(settings)
    out = report.to_dict()
    out["paths"] = {
        "vault": str(settings.vault),
        "db": str(settings.db),
        "models": str(settings.models_path),
        "token": str(settings.token_path),
    }
    # backend_name() resolves the backend, which shells out to Hermes; the
    # checks above already know the answer cheaply.
    from . import hermes

    out["backend"] = "hermes" if hermes.available() else "local"
    return out
