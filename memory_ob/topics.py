"""Filing: which part of the owner's life a memory belongs to.

The set of categories is fixed and small on purpose. Left free, a model invents
dozens of overlapping folders; a short fixed list stays tidy. Anything finer
than a category is a free tag, and the owner can always move a memory to a
different category.

Everything here is plain rules, so it behaves the same with or without an AI
helper running.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

HEALTH = "Health"
MONEY = "Money"
IDEAS = "Projects & Ideas"
WORK = "Work & Business"
LEARNING = "Learning"
PLANS = "Plans"
INTERESTS = "Interests"
LIFE = "Life"

# Order matters: the first match wins, so the more specific topics come first.
CATEGORIES: tuple[str, ...] = (
    HEALTH, MONEY, IDEAS, WORK, LEARNING, PLANS, INTERESTS, LIFE,
)

TAG_PREFIX = "topic/"

_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    (HEALTH, re.compile(
        r"\b(allerg\w*|medic\w*|(?:my|the|your) doctor|doctor['\u2019]?s|doctor (?:said|says|told|prescribed|appointment)|"
        r"(?:see|saw|seeing|visit\w*|consult\w*) (?:a |the |my )?doctor|"
        r"diagnos\w*|symptom\w*|pain|injur\w*|"
        r"surgery|hospital|blood|diabet\w*|asthma|therap\w*|prescri\w*|"
        r"vitamin\w*|supplement\w*|sleep\w*|diet|calorie\w*|body fat|"
        r"workout\w*|gym|exercis\w*|fitness|protein|migraine|infection|"
        r"anxiety|depress\w*|dentist|clinic|vaccin\w*)\b", re.I)),
    (MONEY, re.compile(
        r"\b(salary|income|rent|budget\w*|loan|debt|savings?|invest\w*|"
        r"stocks?|crypto\w*|tax(es)?|expenses?|bills?|mortgage|"
        r"taka|bdt|usd|dollars?)\b|\$\s?\d", re.I)),
    (IDEAS, re.compile(
        r"\b(ideas?|projects?|prototype\w*|side project|concept|plugin|"
        r"repo|app idea|startup idea|building a|working on a)\b", re.I)),
    (WORK, re.compile(
        r"\b(work(s|ing)? (at|for|on)|job|employer|company|startup|business|"
        r"clients?|customers?|revenue|office|manager|boss|career|internship|"
        r"freelanc\w*|colleague\w*|promotion)\b", re.I)),
    (LEARNING, re.compile(
        r"\b(learn\w*|stud(y|ies|ying)|courses?|exams?|semester|university|"
        r"class(es)?|lectures?|tutorials?|certif\w*|degree|thesis|"
        r"assignments?|cse|homework)\b", re.I)),
    (PLANS, re.compile(
        r"\b(plan(s|ning)? to|going to|want(s)? to|goals?|deadline|need(s)? to|"
        r"intend\w* to|trying to|next (week|month|year)|tomorrow|to-?do|"
        r"appointment|come back to|revisit)\b", re.I)),
    (INTERESTS, re.compile(
        r"\b(like|likes|love|loves|enjoy\w*|hobby|hobbies|favou?rite|prefer\w*|"
        r"fan of|music|games?|football|cricket|anime|movies?|travel\w*|"
        r"cook\w*|reading|dark mode)\b", re.I)),
)


_INTENT = dict(_RULES)[PLANS]


def has_intent(text: str) -> bool:
    """True when the words look forward: "I want to", "planning to", "next year"..."""
    return bool(_INTENT.search(text or ""))


def categorize(text: str, *, default: str = LIFE) -> str:
    """The category *text* belongs to. Always one of :data:`CATEGORIES`."""
    for name, pattern in _RULES:
        if pattern.search(text or ""):
            return name
    return default


def tag_for(category: str) -> str:
    """The Obsidian-style nested tag for a category."""
    return TAG_PREFIX + category.lower().replace(" & ", "-").replace(" ", "-")


def category_of(tags: list[str] | None, text: str = "") -> str:
    """The category recorded in *tags*, else the one the rules give."""
    for tag in tags or []:
        for name in CATEGORIES:
            if tag == tag_for(name):
                return name
    return categorize(text)


def with_category(tags: list[str] | None, category: str) -> list[str]:
    """*tags* with exactly one category tag, the given one."""
    if category not in CATEGORIES:
        category = LIFE
    kept = [t for t in (tags or []) if not str(t).startswith(TAG_PREFIX)]
    return [tag_for(category), *kept]


# -- "come back to this later" -------------------------------------------------

_NUMBER_WORDS = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "twelve": 12,
}
_UNIT_DAYS = {"day": 1, "week": 7, "month": 30, "year": 365}

_REVISIT_TRIGGER = re.compile(
    r"\b(come back|get back|go back|return|revisit|look (?:at|into) (?:it|this|that) again|"
    r"pick (?:it|this|that) (?:back )?up|circle back|remind me)\b", re.I)
_REVISIT_WHEN = re.compile(
    r"\b(?:in|after|within)\s+(a|an|one|two|three|four|five|six|seven|eight|nine|"
    r"ten|twelve|\d{1,3})\s+(day|week|month|year)s?\b|\bnext\s+(week|month|year)\b",
    re.I)


def revisit_date(text: str, *, now: datetime | None = None) -> str | None:
    """The day the owner said they would come back to something, if they did.

    "I'll come back to this business idea in a year" -> a date one year away.
    Returns an ISO day (YYYY-MM-DD), or None when nothing like that was said.
    """
    if not _REVISIT_TRIGGER.search(text or ""):
        return None
    m = _REVISIT_WHEN.search(text or "")
    if not m:
        return None
    if m.group(3):
        days = _UNIT_DAYS[m.group(3).lower()]
    else:
        raw = m.group(1).lower()
        count = _NUMBER_WORDS.get(raw)
        if count is None:
            count = int(raw)
        days = count * _UNIT_DAYS[m.group(2).lower()]
    base = now or datetime.now(timezone.utc)
    return (base + timedelta(days=days)).strftime("%Y-%m-%d")


def revisit_of(source: dict[str, Any] | None) -> str | None:
    """The revisit day stored on a record, if any."""
    value = (source or {}).get("revisit_at")
    return str(value) if value else None
