"""A stand-in AI helper for the browser checks and screenshots.

Since update-9 the app saves nothing while no AI helper has read a message, so a browser
check with no helper at all sees an empty app. This stand-in reads like a very plain model:
it files every sentence, says who it is about, and answers "same / update / unrelated" by the
same word rules the app uses. It is only for tests: nothing here ships in the plugin.

``FAKE_AI=down`` makes it fail every call, ``FAKE_AI=junk`` makes it answer with an apology,
so the "AI not available" paths can be looked at too.
"""
from __future__ import annotations

import json
import os
import re

_CATEGORY = (
    ("allerg", "Health"), ("rent", "Money"), ("budget", "Money"), ("learn", "Learning"),
    ("business", "Work & Business"), ("cricket", "Interests"), ("football", "Interests"),
    ("plan", "Plans"), ("passport", "Plans"),
)
_RELATIVE = re.compile(r"^my (sister|brother|friend|mom|dad|cousin)\b", re.I)


def _sentences(body: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", body) if len(s.strip()) >= 8]


def _reads(prompt: str) -> str:
    from memory_ob import conflicts

    # numbered items: "1. text" (judge_prompt) or "1. EARLIER: a / LATER: b" (check-up pairs)
    if "EARLIER:" in prompt:
        answer = {}
        for i, a, b in re.findall(r"^(\d+)\. EARLIER: (.*)\n\s+LATER: (.*)$", prompt, re.M):
            verdict = conflicts.compare(b, a)
            answer[i] = {"duplicate": "same", "conflict": "update"}.get(verdict or "", "unrelated")
        return json.dumps(answer)
    m = re.search(r"NEW: (.*?)\n\nREMEMBERED:\n(.*)", prompt, re.S)
    if m:
        new, olds = m.group(1), re.findall(r"^\d+\. (.*)$", m.group(2), re.M)
        answer = {}
        for i, old in enumerate(olds, 1):
            verdict = conflicts.compare(new, old)
            answer[str(i)] = {"duplicate": "same", "conflict": "update"}.get(verdict or "", "unrelated")
        return json.dumps(answer)
    return ""


def _mode() -> str:
    """``ok``, ``down`` or ``junk``. A file named by FAKE_AI_FILE, when it exists, changes it while running."""
    path = os.environ.get("FAKE_AI_FILE", "")
    if path and os.path.exists(path):
        return open(path).read().strip() or "ok"
    return os.environ.get("FAKE_AI", "ok")


def fake(prompt: str) -> str:
    mode = _mode()
    if mode == "down":
        raise RuntimeError("model unavailable")
    if mode == "junk":
        return "I am sorry, but I cannot help with that."
    judged = _reads(prompt)
    if judged:
        return judged
    m = re.search(r"Text:\n(.*)", prompt, re.S)
    if "librarian" in prompt and m:
        lines = []
        who = re.search(r"The person talking is ([^.\n]+)", prompt)
        owner = [w.lower() for w in who.group(1).split()] if who else []
        for s in _sentences(m.group(1)):
            low = s.lower()
            cat = next((c for k, c in _CATEGORY if k in low), "Life")
            first = re.match(r"[a-z']+", low)
            about = "other" if _RELATIVE.match(s) and "helping me" not in low else (
                "me" if re.match(r"(i|my)\b", low) or (first and first.group(0) in owner) else "other")
            people = re.findall(r"\b(?:sister|friend|brother|cousin)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)", s)
            lines.append(json.dumps({
                "text": s, "category": cat, "note": "", "project": "Clothing business" if "clothing business" in low else "",
                "todo": bool(re.search(r"\b(need to|have to|must)\b", low)), "moment": False,
                "about": about, "people": people, "sentiment": "", "context": "",
            }))
        return "\n".join(lines) or "none"
    return "Nishad lives in Chittagong and studies CSE. He is building a memory plugin."


def install() -> None:
    """Make the app believe an AI helper is connected, and answer with :func:`fake`."""
    from memory_ob import models

    models.helper = lambda config=None, slot_name="extract": fake
    models.helper_state = lambda config=None, slot_name="extract": {"kind": "hermes", "ready": "yes"}
