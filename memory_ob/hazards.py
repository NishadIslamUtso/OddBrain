"""Hazard scanner (law 5).

Nothing recalled from memory is ever an instruction. The scanner flags text
that tries to direct the model, leak the prompt, or suppress disclosure. It
runs at capture AND at the retrieval exit.
"""

from __future__ import annotations

import re

# Ordered roughly by severity. Each entry is a compiled regex over lowercased
# text. Keep the list small and explainable — a scanner that flags everything
# is worse than none, because it gets disabled.
_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (name, re.compile(pat))
    for name, pat in (
        ("instruction_override", r"ignore\s+(?:\w+\s+){0,3}(?:instructions|rules|directions)"),
        ("instruction_override2", r"disregard\s+(?:\w+\s+){0,3}(?:instructions|rules|directions)"),
        ("system_prompt_leak", r"(reveal|show|print|repeat|output).{0,24}(system prompt|system message|instructions)"),
        ("persona_override", r"you are now (a|an|the) "),
        ("new_instructions", r"(new|updated|changed) instructions"),
        ("rule_override", r"override (your|the|all) (rules|guidelines|constraints)"),
        ("jailbreak", r"\bjailbreak\b"),
        ("secrecy", r"(do not|don't|never) (tell|inform|mention|reveal) (the )?(user|owner|human)"),
        ("chain_of_command", r"(assistant|ai|model) (must|should) (obey|follow|comply)"),
    )
)


def scan(text: str) -> list[str]:
    """Return the list of hazard names found in *text* (empty when clean)."""
    if not text:
        return []
    low = text.lower()
    return [name for name, pat in _PATTERNS if pat.search(low)]


def is_hazardous(text: str) -> bool:
    """True when *text* contains at least one hazard."""
    return bool(scan(text))


def assert_clean(text: str) -> None:
    """Raise :class:`HazardFound` when *text* contains a hazard."""
    found = scan(text)
    if found:
        raise HazardFound(found)


class HazardFound(ValueError):
    """Raised when text fails the hazard scan."""

    def __init__(self, hazards: list[str]) -> None:
        self.hazards = list(hazards)
        super().__init__(f"hazardous text: {', '.join(self.hazards)}")
