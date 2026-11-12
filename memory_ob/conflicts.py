"""Does a new statement repeat, or contradict, something already remembered?

This is what lets the AI save things quietly and still stop to ask when a new
statement reverses an old one ("I'm not allergic to peanuts anymore" next to
"I have a severe peanut allergy").

The check is rule based, so it behaves the same with or without an AI helper:

* a *slot* match: "I live in Dhaka" against "I moved to Chittagong";
* a *negation* match: the same subject said again with the opposite polarity.

It is deliberately cautious in one direction. When it is unsure it says "no
conflict" and the new fact is simply saved; when it says "conflict" the owner
is asked. A rule-based check cannot understand every contradiction, and this
module does not pretend to.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

DUPLICATE = "duplicate"
CONFLICT = "conflict"

_WORD_RE = re.compile(r"[a-z0-9]+")

# Words that carry no subject matter.
_STOP = frozenset("""
a an the and or but so of to in on at for with from by as is are was were be been
being am it its this that these those there here do does did have has had will
would can could should may might must i im ive id ill me my mine myself we our
ours us you your he she they them his her their what which who whom how when
where why also too very really just actually now currently still always often
sometimes recently today yesterday again then than if about into over out up
down some any all more most much many lot lots bit
""".split())

# Words that flip the meaning of a statement.
_NEGATORS = frozenset("""
not no never none neither nor without cannot cant dont doesnt didnt isnt arent
wasnt werent wont wouldnt shouldnt hasnt havent hadnt couldnt nope
""".split())

# Phrases that end or reverse something, rewritten as a plain "not".
_REVERSAL_PHRASES = (
    (re.compile(r"\bno longer\b"), " not "),
    (re.compile(r"\bnot anymore\b|\bnot any more\b"), " not "),
    (re.compile(r"\bused to\b"), " not "),
    (re.compile(r"\b(stopped|quit|gave up|ceased|ended)\b"), " not "),
)
# Time markers that must not count as subject matter.
_TIME_WORDS = frozenset({"anymore", "longer"})

_HEDGE_RE = re.compile(
    r"\b(maybe|perhaps|i guess|not sure|probably|might|i think|possibly|"
    r"not certain|unsure|kind of|sort of)\b", re.I)


def is_hedged(text: str) -> bool:
    """True when the speaker themselves was unsure."""
    return bool(_HEDGE_RE.search(text or ""))


def _normalise(text: str) -> str:
    low = (text or "").lower().replace("’", "'").replace("‘", "'")
    low = low.replace("'", "")
    for pattern, repl in _REVERSAL_PHRASES:
        low = pattern.sub(repl, low)
    return low


def stem(word: str) -> str:
    """A light stemmer, just enough to match 'allergy' with 'allergic'."""
    w = word
    for suffix, replacement in (("ies", "y"), ("ing", ""), ("ed", ""), ("es", ""), ("s", "")):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            w = w[: -len(suffix)] + replacement
            break
    for suffix in ("ic", "y", "e"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            w = w[: -len(suffix)]
            break
    return w


@dataclass(slots=True)
class Reading:
    stems: frozenset[str]
    negated: bool
    slot: tuple[str, str] | None


_SLOT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("lives", re.compile(
        r"\b(?:i|we)\s+(?:currently\s+|now\s+)?(?:live|stay|reside)\s+in\s+(?P<v>[a-z0-9 ]{2,40})")),
    ("lives", re.compile(r"\b(?:i|we)\s+(?:have\s+|just\s+|recently\s+)?(?:moved|relocated|shifted)\s+to\s+(?P<v>[a-z0-9 ]{2,40})")),
    ("works", re.compile(
        r"\bi\s+(?:currently\s+|now\s+)?(?:work|worked|working)\s+(?:at|for)\s+(?P<v>[a-z0-9 ]{2,40})")),
    ("works", re.compile(r"\bi\s+(?:started|joined)\s+(?:working\s+(?:at|for)\s+)?(?P<v>[a-z0-9 ]{2,40})")),
    ("studies", re.compile(
        r"\bi\s+(?:currently\s+)?(?:study|studying|studied)\s+(?:at|in)\s+(?P<v>[a-z0-9 ]{2,40})")),
    ("age", re.compile(r"\bi\s*(?:am|m)\s+(?P<v>\d{1,3})\s*(?:years?\s+old|yo)?\b")),
    ("name", re.compile(r"\bmy\s+name\s+is\s+(?P<v>[a-z ]{2,40})")),
)
_MY_X_IS_Y = re.compile(r"\bmy\s+(?P<x>[a-z]{3,20}(?:\s+[a-z]{3,20}){0,2}?)\s+(?:is|are|was)\s+(?P<v>[a-z0-9 ]{2,40})")

_SLOT_TRAILING = re.compile(
    r"\b(and|but|because|so|which|who|where|when|since|now|currently|anymore|too)\b.*$")


def _clean_value(value: str) -> str:
    value = _SLOT_TRAILING.sub("", value).strip()
    return " ".join(stem(w) for w in _WORD_RE.findall(value) if w not in _STOP)


def read(text: str) -> Reading:
    """Reduce a statement to what it is about and whether it is negated."""
    low = _normalise(text)
    words = _WORD_RE.findall(low)
    negations = sum(1 for w in words if w in _NEGATORS)
    stems = frozenset(
        stem(w) for w in words
        if w not in _STOP and w not in _NEGATORS and w not in _TIME_WORDS and len(w) > 1
    )
    slot: tuple[str, str] | None = None
    for name, pattern in _SLOT_PATTERNS:
        m = pattern.search(low)
        if m:
            value = _clean_value(m.group("v"))
            if value:
                slot = (name, value)
                break
    if slot is None:
        m = _MY_X_IS_Y.search(low)
        if m:
            value = _clean_value(m.group("v"))
            subject = " ".join(stem(w) for w in _WORD_RE.findall(m.group("x")) if w not in _STOP)
            if value and subject:
                slot = (f"my {subject}", value)
    return Reading(stems=stems, negated=negations % 2 == 1, slot=slot)


def compare(new_text: str, old_text: str) -> str | None:
    """``"duplicate"``, ``"conflict"`` or None for *new_text* against *old_text*."""
    a, b = read(new_text), read(old_text)
    if not a.stems or not b.stems:
        return None
    if a.slot and b.slot and a.slot[0] == b.slot[0] and not a.negated and not b.negated:
        return DUPLICATE if a.slot[1] == b.slot[1] else CONFLICT
    shared = a.stems & b.stems
    smaller = min(len(a.stems), len(b.stems))
    if not shared or len(shared) / smaller < 0.6:
        return None
    if smaller > 1 and len(shared) < 2:
        return None
    if a.negated != b.negated:
        return CONFLICT
    # Same polarity: it is a repeat only when it adds nothing new.
    if len(shared) / len(a.stems) >= 0.85:
        return DUPLICATE
    return None


def find(new_text: str, records: list[Any]) -> tuple[str, Any] | None:
    """The first existing record the new statement repeats or contradicts.

    A contradiction outranks a repeat: if the statement matches one record as a
    duplicate and another as a conflict, the owner must hear about the conflict.
    """
    duplicate: Any = None
    for rec in records:
        text = f"{rec.title} {rec.body}" if rec.body and rec.body != rec.title else (rec.body or rec.title)
        verdict = compare(new_text, text)
        if verdict == CONFLICT:
            return CONFLICT, rec
        if verdict == DUPLICATE and duplicate is None:
            duplicate = rec
    if duplicate is not None:
        return DUPLICATE, duplicate
    return None
