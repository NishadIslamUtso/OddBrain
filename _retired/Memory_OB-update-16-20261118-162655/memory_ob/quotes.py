"""Hash-verified quotes (law 1).

A quote is only usable as evidence when its hash was computed over BOTH the
quoted string AND the source text it came from. Change either and the quote
fails verification loudly — a quote may never be shown against a source it was
not taken from.
"""

from __future__ import annotations

import hashlib

_LEN = 16


def hash_quote(quote: str, source_text: str) -> str:
    """Hash a quote together with the source text it was taken from."""
    h = hashlib.sha256()
    h.update(quote.encode("utf-8"))
    h.update(b"\x00")
    h.update(source_text.encode("utf-8"))
    return h.hexdigest()[:_LEN]


def verify_quote(quote: str, source_text: str, expected: str) -> bool:
    """True only when *quote* really comes from *source_text*."""
    if not expected:
        return False
    return hash_quote(quote, source_text) == expected


def quote_verified(quote: str, source_text: str, expected: str) -> bool:
    """Alias used by the recall boundary."""
    return verify_quote(quote, source_text, expected)
