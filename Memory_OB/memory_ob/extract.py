"""The write pipeline — capture, extract, candidate pool, trust scores.

Input is untrusted evidence. Instructions inside evidence are never obeyed.
AI output is advice, not evidence of the owner's life. Everything that lands
below the truth line is a *candidate* with a trust score; nothing becomes
truth without a Review card.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable

from . import hazards, ids, quotes
from .records import CANDIDATE_MAX, CANDIDATE_MIN, NOTE, PROFILE

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+|\n+")

# Chatter that never becomes a fact: greetings, thanks, filler, one-word ack.
_CHATTER_RE = re.compile(
    r"^(?:hi|hello|hey|yo|ok|okay|yes|no|nope|thanks|thank you|thx|sure|"
    r"cool|nice|great|done|next|continue|go|bye|goodbye|hm{1,3}|lol|lmao|"
    r"sorry|please|wow|ah|oh|uh|um+)\b[.!\s]*$",
    re.IGNORECASE,
)

_QUESTION_RE = re.compile(r"\?\s*$")


@dataclass(slots=True)
class Candidate:
    """A candidate fact below the truth line."""

    id: str
    text: str
    trust: float = 0.3
    kind_hint: str = NOTE
    source: dict[str, Any] = field(default_factory=dict)
    created: str = ""

    def to_dict(self) -> dict[str, Any]:
        from dataclasses import asdict

        return asdict(self)


def _now() -> str:
    import time

    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def split_claims(text: str) -> list[str]:
    """Split raw text into candidate claim strings."""
    out: list[str] = []
    for raw in _SENTENCE_RE.split(text or ""):
        s = " ".join(raw.split())
        if len(s) < 12:
            continue
        if _CHATTER_RE.match(s):
            continue
        if _QUESTION_RE.search(s):
            continue
        out.append(s)
    return out


def score_claim(claim: str) -> float:
    """Heuristic trust score for a claim (0.3–0.6 candidate band)."""
    score = 0.4
    low = claim.lower()
    # First-person statements about the owner are stronger self-knowledge.
    if re.search(r"\b(i|i'm|i've|my|me)\b", low):
        score += 0.05
    # Specifics (numbers, dates, names) are stronger than vague statements.
    if re.search(r"\b\d{1,4}\b", claim):
        score += 0.05
    if re.search(r"\b(?:because|so|therefore|since)\b", low):
        score += 0.03
    # Hedging lowers confidence.
    if re.search(r"\b(?:maybe|perhaps|i guess|not sure|probably)\b", low):
        score -= 0.08
    return max(CANDIDATE_MIN, min(CANDIDATE_MAX, round(score, 2)))


def kind_hint_for(claim: str) -> str:
    """Best-effort kind hint. Never authoritative — a card decides."""
    low = claim.lower()
    if re.search(r"\b(?:prefer|i like|i love|i hate|i always|i never)\b", low):
        return PROFILE
    if re.search(r"\b(?:learned|realized|understood|turns out|i found)\b", low):
        return "learning"
    if re.search(r"\b(?:today|yesterday|this morning|last night|on monday)\b", low):
        return "journal"
    return NOTE


def extract_claims(text: str, *, source: dict[str, Any] | None = None) -> list[Candidate]:
    """Turn raw evidence into candidate facts. No model needed."""
    out: list[Candidate] = []
    for claim in split_claims(text):
        out.append(
            Candidate(
                id=ids.new_id(),
                text=claim,
                trust=score_claim(claim),
                kind_hint=kind_hint_for(claim),
                source=source or {},
                created=_now(),
            )
        )
    return out


def extract_with_model(
    text: str,
    *,
    model_call: Any,
    source: dict[str, Any] | None = None,
) -> list[Candidate]:
    """Ask a model for atomic facts, then validate each line.

    ``model_call`` is a callable taking a prompt string and returning text.
    The model's output is treated as untrusted: hazards are scanned, chatter
    is dropped, and every claim is re-scored.
    """
    prompt = (
        "Extract atomic facts about the person speaking. One per line.\n"
        "Rules:\n"
        "- Only facts the person stated about themselves.\n"
        "- No feelings, diagnoses, motives or identities you infer.\n"
        "- Preserve uncertainty and reported-vs-observed wording.\n"
        "- One short line each. No preamble.\n\n"
        f"Text:\n{text}"
    )
    try:
        raw = model_call(prompt)
    except Exception:
        return extract_claims(text, source=source)
    out: list[Candidate] = []
    for line in (raw or "").splitlines():
        s = line.strip().lstrip("-*• ").strip()
        if len(s) < 12 or _CHATTER_RE.match(s):
            continue
        if hazards.is_hazardous(s):
            continue
        out.append(
            Candidate(
                id=ids.new_id(),
                text=s,
                trust=score_claim(s),
                kind_hint=kind_hint_for(s),
                source=source or {},
                created=_now(),
            )
        )
    return out or extract_claims(text, source=source)


def make_quote(text: str, source_text: str) -> dict[str, str]:
    """Build a hash-verified quote record (law 1)."""
    return {
        "quote": text,
        "source_text": source_text,
        "quote_hash": quotes.hash_quote(text, source_text),
    }
