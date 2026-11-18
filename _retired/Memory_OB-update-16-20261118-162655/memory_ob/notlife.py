"""Is this line talk *about life*, or talk about tools/work/docs?

The owner pastes reports, docs and agent chats into their conversations. Those
lines are NOT memories ("Paraphrased contradictions can slip (68 kg vs 72)" is
a review example, not a health fact). This module names the junk classes seen
in the owner's real vault and answers, for one line, "is this life?" — with a
reason when it is not.

High precision on purpose: a dropped line is never lost (the raw conversation
stays in Sources), but a wrongly dropped life fact would be. When in doubt,
this says "life" and keeps the line.

Classes caught (from the 2026-11 vault dump):
  * server/HTTP log lines          (``INFO: 127.0.0.1:54376 - "GET ...``)
  * internal system notices        ("INTERNAL NOTIFICATION", "not user input")
  * terminal / code lines          (``git grep``, ``pip install``, ``def test_``)
  * markdown tables and headings   (``| **Windows** | ...``, ``## What it does``)
  * documentation text             (links, backticked file names, README.md)
  * agent instruction boilerplate  ("Report: ...", "Change nothing.", "Screenshot")
  * review/audit marker lines      (lines with ✅ ❌ ☐ marks)
  * session work-talk              ("fetch chunks 5-13", "all suites green")
"""

from __future__ import annotations

import re

# Server / access-log lines.
_LOG_PATTERNS = (
    re.compile(r"^\s*(?:INFO|DEBUG|WARNING|ERROR|CRITICAL):\s"),
    re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}:\d+\s*-\s*\""),
    re.compile(r"\"(?:GET|POST|PUT|DELETE|PATCH)\s+/\S*\s+HTTP/1\.\d\"\s+\d{3}"),
)

# Internal notices that explicitly say they are not user input.
_NOTICE_RE = re.compile(
    r"INTERNAL\s+NOTIFICATION|generated\s+by\s+the\s+hermes\s+gateway|"
    r"not\s+written\s+by\s+a\s+human\s+user|do\s+not\s+treat\s+(?:it|this|them)\s+as\s+user\s+input|"
    r"do\s+not\s+reply\s+to\s+any\s+earlier",
    re.I,
)

# Terminal commands (line-start, typed lowercase) and code/tool tokens anywhere.
_TERMINAL_START_RE = re.compile(
    r"^(?:git|pip|npm|npx|cd|grep|awk|sed|tar|mkdir|rm|cp|mv|python3?|powershell|curl|wget|ls|cat|head|tail|wc)\s"
)
_TERMINAL_TOKEN_RE = re.compile(
    r"\b(?:git\s+(?:grep|show|log|fetch|reset|archive|checkout|add|commit|push|diff|status)|"
    r"pip\s+install|npm\s+(?:install|run)|python3?\s+run_tests|run_tests\.py|grep\s+-[cnlw]|"
    r"fetch_page|web_search|vision_analyze|image_url\s*:|__pycache__|\.pyc\b|pyproject\.toml|"
    r"def\s+test_)\b",
    re.I,
)

# Markdown tables and headings.
_TABLE_RE = re.compile(r"^\s*\|.*\|\s*$")
_RULE_RE = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")
_HEADING_RE = re.compile(r"^#{1,6}\s+\S")

# Documentation text: links, backticked file names, known tool files.
_DOCLINK_RE = re.compile(r"\]\((?:https?://|/)[^)]*\)")
_BACKTICK_FILE_RE = re.compile(r"`[\w./-]+\.(?:md|txt|json|js|py|sh|dmg|zip|exe|yml|yaml|toml|cfg|log|png|jpg|ps1)`", re.I)
_TOOLFILE_RE = re.compile(
    r"\b(?:README\.md|RELEASE_FILES\.txt|package\.json|build\.sh|make-dmg\.sh|"
    r"conversations\.json|Modelfile|install\.ps1|uninstall\.ps1)\b"
)

# Agent instruction boilerplate (from the P1–P7 prompt texts pasted into chats).
_INSTRUCT_START_RE = re.compile(
    r"^(?:Report\b|In\s+PowerShell|PowerShell\s+run|Then\s+find\s+the\s+Memory_OB|"
    r"Change\s+nothing\.?$|Copy[-\s]paste\b|Screenshot\b|Paste\s+this\s+exact|"
    r"Run\s+these\s+and\s+report|Do\s+not\s+change)",
    re.I,
)
_INSTRUCT_TOKEN_RE = re.compile(
    r"\b(?:Get-ChildItem|Get-Process|Select-Object|ErrorAction\s+SilentlyContinue|"
    r"Change\s+nothing|the\s+top\s+box)\b"
)

# Review/audit marker lines: ✅ ❌ ☐ style, unless the line is a life statement.
_MARK_RE = re.compile(r"[✅❌☐☑🔄]")
_LIFE_START_RE = re.compile(r"^\s*(?:i\b|i['\u2019]m\b|i['\u2019]ve\b|i['\u2019]ll\b|my\b|we\b|our\b)", re.I)

# Session work-talk: high-precision phrases from agents' own working notes.
_WORKTALK_RE = re.compile(
    r"(?:fetch|read|get|scan)\s+chunks?\s+\d|\bsuite\(s\)\s+run\b|\ball\s+(?:\d+\s+)?suites?\s+green\b|"
    r"\bthe\s+missing\s+list\b|\bthe\s+fix\s+list\b|\bchore\s+queues?\b|\bthe\s+rulebook\b|"
    r"^\s*(?:let\s+me|let['\u2019]?s)\s+(?:fetch|read|get|scan|run|check|do|grab)\b"
    r"[^.!?]{0,80}\b(?:chunks?|suites?|tests?\b|grep|the\s+code|the\s+repo|the\s+file|the\s+diff|the\s+log)",
    re.I,
)

# Vault line-id tails (present when re-reading old notes in the clean-up pass).
_LINEID_RE = re.compile(r"\^[0-9a-f]{4,}-[0-9a-f]{4,}\s*$")

# Review-example prose: two quoted strings pitted against each other
# ('slip ("68 kg" vs "my weight is 72")') — that is a judge's example, not life.
_QUOTED_VS_RE = re.compile('\"[^\"\\n]{1,60}\"\\s+vs\\.?\\s+\"[^\"\\n]{1,60}\"', re.I)

# Pasted note lines: "- 2026-11-16 - ..." copied out of a vault note.
_NOTELINE_RE = re.compile('^\\s*[-*]\\s+\\d{4}-\\d{2}-\\d{2}\\s*[\u2014\u2013-]\\s')

# Code identifiers ("_REL_WORDS has no ...") - developer talk.
_CODEID_RE = re.compile('\\b_[A-Z][A-Za-z0-9_]{2,}\\b')


def is_not_life(text: str) -> str:
    """'' when the line reads like life; otherwise a short reason it is not."""
    s = (text or "").strip()
    if not s:
        return "empty"
    for pat in _LOG_PATTERNS:
        if pat.search(s):
            return "server log"
    if _NOTICE_RE.search(s):
        return "internal notice"
    if _TERMINAL_START_RE.match(s) or _TERMINAL_TOKEN_RE.search(s):
        return "terminal/code"
    if _TABLE_RE.match(s) or _RULE_RE.match(s):
        return "markdown table"
    if _HEADING_RE.match(s):
        return "markdown heading"
    if _DOCLINK_RE.search(s) or _BACKTICK_FILE_RE.search(s) or _TOOLFILE_RE.search(s):
        return "documentation text"
    if _INSTRUCT_START_RE.match(s) or _INSTRUCT_TOKEN_RE.search(s):
        return "agent instructions"
    if _MARK_RE.search(s) and not _LIFE_START_RE.match(s):
        return "review marker text"
    if _WORKTALK_RE.search(s):
        return "session work-talk"
    if _LINEID_RE.search(s):
        return "vault line id"
    if _QUOTED_VS_RE.search(s):
        return "review example"
    if _NOTELINE_RE.match(s):
        return "pasted note line"
    if _CODEID_RE.search(s):
        return "code identifier"
    return ""
