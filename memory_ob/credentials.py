"""Passwords, keys and card numbers never become memories.

Everything you say is filed automatically, so a password said out loud must
not end up in a plain markdown note (or in Hermes's own memory files). This
module finds the *value* of a credential and swaps it for ``[hidden]`` before
anything is stored.

It looks for:

* a password-like word followed by its value ("my wifi password is x7!kQ9",
  "pin: 4821", "api key = ...");
* well-known key shapes (``sk-...``, ``ghp_...``, ``AKIA...``, ``xox...-``,
  ``AIza...``, JSON web tokens, ``-----BEGIN PRIVATE KEY-----``);
* card numbers (13-19 digits that pass the Luhn check).

Honest limit: a password written as ordinary words ("my password is blue
banana") looks like any other sentence and cannot be told apart.
"""

from __future__ import annotations

import re
from typing import Any

HIDDEN = "[hidden]"

# keyword  ...  (is | : | =)  value
_KEYWORDS = (
    r"password|passcode|passphrase|passwd|pwd|pin(?:\s+code)?|cvv|cvc|security\s+code|"
    r"api[\s_-]?key|secret[\s_-]?key|access[\s_-]?key|private[\s_-]?key|auth(?:entication)?[\s_-]?token|"
    r"access[\s_-]?token|bearer[\s_-]?token|token|otp|recovery\s+code"
)
_KEYWORD_VALUE = re.compile(
    rf"\b(?P<key>(?:{_KEYWORDS}))\b(?P<mid>[^.\n]{{0,24}}?(?:\bis\b|\bare\b|\bwas\b|:|=)\s*[:=]?\s*)(?P<val>[^\s,;]{{4,}})",
    re.I,
)
_KEY_SHAPES = re.compile(
    r"(?:\bsk-[A-Za-z0-9_-]{16,}|\bpk-[A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|"
    r"\bAKIA[0-9A-Z]{16}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{30,}|"
    r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|"
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$))"
)
_CARD = re.compile(r"(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])")


def _luhn(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if alt:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        alt = not alt
    return total % 10 == 0


def _looks_like_value(value: str) -> bool:
    """A real credential has a digit or a symbol, or is long; "too short" does not."""
    value = value.strip("\"'`()[]{}")
    if len(value) < 4:
        return False
    return bool(re.search(r"[\d\W_]", value)) or len(value) >= 12


def redact(text: str) -> tuple[str, int]:
    """*text* with every credential value replaced by ``[hidden]``, and how many were found."""
    if not text:
        return text, 0
    count = 0

    def keyword(match: re.Match[str]) -> str:
        nonlocal count
        if not _looks_like_value(match.group("val")):
            return match.group(0)
        count += 1
        return f"{match.group('key')}{match.group('mid')}{HIDDEN}"

    out = _KEYWORD_VALUE.sub(keyword, text)

    def shape(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return HIDDEN

    out = _KEY_SHAPES.sub(shape, out)

    def card(match: re.Match[str]) -> str:
        nonlocal count
        digits = re.sub(r"\D", "", match.group(0))
        if 13 <= len(digits) <= 19 and _luhn(digits):
            count += 1
            return HIDDEN
        return match.group(0)

    out = _CARD.sub(card, out)
    return out, count


def drop_hidden(text: str) -> str:
    """*text* without the clauses that held a secret; '' when too little is left.

    "My student ID is 1000056707 and my wifi password is [hidden]" keeps the
    first half: only the part that carried the secret is lost.
    """
    if HIDDEN not in (text or ""):
        return text
    clauses = [c.strip() for c in re.split(r"\s*(?:;|,|\band\b|\bbut\b)\s*", text, flags=re.I) if c.strip()]
    kept = [c for c in clauses if HIDDEN not in c]
    out = " and ".join(kept).strip(" ,;")
    if len(out) < 12:
        return ""
    return out if out[-1] in ".!?" else out + "."


def has_secret(text: str) -> bool:
    return redact(text)[1] > 0


def redact_parts(parts: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """The same, for a labelled conversation."""
    total = 0
    clean: list[dict[str, Any]] = []
    for p in parts:
        content, n = redact(str(p.get("content", "")))
        total += n
        clean.append({**p, "content": content})
    return clean, total
