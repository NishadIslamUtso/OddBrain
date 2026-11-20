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
import threading
from contextlib import contextmanager

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



# --- Second look at the owner's real vault (2026-11-18): what still got through ---------------------

# Check marks used in review notes.
_MARK_RE = re.compile(r"[\u2705\u274c\u2610\u2611\U0001f504\u2713\u2714\u2717\u2718]")

# Bold markdown (**Windows**), plain file names (conflicts.py), snake_case names (card_id).
_BOLD_RE = re.compile(r"\*\*[^*\n]+\*\*")
_ITALIC_RE = re.compile(r"(?<!\*)\*[^*\s][^*\n]*\*(?!\*)")
_LISTBOLD_RE = re.compile(r"^\s*(?:[-*\u2022]|\d+\.)\s+\*\*")


def _markup(s: str) -> bool:
    """Document markup: a list item that starts in bold, or two emphasis marks in one line.

    One bold word in a sentence ("I **really** love tea") is how people write notes, so it is life.
    """
    return bool(_LISTBOLD_RE.match(s) or len(_BOLD_RE.findall(s)) + len(_ITALIC_RE.findall(s)) >= 2)
_BARE_FILE_RE = re.compile(r"\b[\w-]+\.(?:py|js|html|css|md|json|ps1|sh|toml|ya?ml|log)\b", re.I)
_SNAKE_RE = re.compile(r"\b[a-z]{2,}(?:_[a-z0-9]+)+\b")

# An AI agent narrating its own work: "Let me fetch...", "Now I'll run...". Not something the owner said
# about their life. (A plain "I ..." is never matched here: "I ran 5 km" is life.)
_NARRATION_RE = re.compile(
    r"^\s*(?:let\s+me|let['\u2019]?s|i['\u2019]ll\s+now|now\s+i['\u2019]ll|next,?\s+i['\u2019]ll)\s+"
    r"(?:just\s+|also\s+|first\s+|quickly\s+)?"
    r"(?:fetch|re-?read|read|get|scan|run|check|do|grab|look|see|try|verify|write|add|fix|install|open|"
    r"summari[sz]e|prioriti[sz]e|say|start|finish|continue|pull|list|compare|go\s+through|review)\b",
    re.I,
)

# Words of the work process itself (audits, rounds, chunks, suites, build numbers). Product names such as
# Hermes or Claude are NOT here: "I am building a Hermes plugin" is a real fact about the owner.
_PROCESS_RE = re.compile(
    r"\b(?:audit(?:s|ed|ing)?|rulebook|chunks?|suites?|update-?\d+|rounds?|flagged|grep|regressions?|"
    r"the\s+build|the\s+spec|the\s+diff|the\s+commit|the\s+branch|the\s+repo|test\s+kit|stand-?ins?)\b", re.I)
_WEAKDEV_RE = re.compile(
    r"\b(?:files?|lines?|tests?|reports?|code|bugs?|builds?|servers?|specs?|zip|prompts?|api|json|schema|gaps?)\b", re.I)
_CAPS_RE = re.compile(r"\b[A-Z]{4,}\b")
# The owner talking about the thing they are making is life, however technical the words.
_MAKING_RE = re.compile(
    r"^\s*(?:i\s+am|i['\u2019]m|we\s+are|we['\u2019]re|i\s+want\s+to|my)\s+(?:\w+\s+){0,2}?"
    r"(?:building|making|working\s+on|creating|developing|learning|project|app|plugin|startup)\b", re.I)


# --- the owner's own project talk, pasted chats and agent lines (2026-11-20) ---------------
# These were all saved as memories. None is a fact about the owner's life: they are
# commands to an AI, a chat partner's summary, or a line of code. Nothing here keys
# on a first word alone, and _MAKING_RE above still protects "I am building
# Memory_OB, a Hermes plugin for my thesis."

# A local address, a port or a timing line is never a life fact.
_LOCAL_ADDR_RE = re.compile(
    r"\bhttps?://(?:127\.0\.0\.1|localhost)\b|\b\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}\b|\belapsed=",
    re.I,
)
_CODE_START_RE = re.compile(
    r"^\s*(?:return|def\s|class\s|import\s|from\s+\S+\s+import|if\s+__name__|@app\.|async\s+def)\b"
)
_PS_RE = re.compile(r"\bInvoke-WebRequest\b|\bPowerShell\b|\bGet-Process\b|\bSelect-String\b")
# An API route or a bare code call: "/v1/chat/completions", "gen()", "ask()".
_API_ROUTE_RE = re.compile(r"\b/v1/(?:chat/)?completions\b|\b/v1/embeddings\b|\b\w+\(\)\s+(?:is|streams|returns?|already)\b")

# The product's own name next to its own work: "Memory_OB update-5", "Memory_OB remembers".
_PRODUCT_WORK_RE = re.compile(
    r"\bMemory_OB\s+(?:update-\d+|remembers?|sweep|audit|check-?up|conflicts?|doubts?)\b"
    r"|\b(?:standing\s+direction|direction)\s+for\s+Memory_OB\b"
    r"|^\s*(?:for|in)\s+Memory_OB\b[,:\s]",
    re.I,
)

# A command about the work itself, or a chat partner's note about it.
_WORK_CMD_RE = re.compile(
    r"^\s*(?:make|leave|bump|keep|fix|add|remove|change|use|when\s+giving|chatgpt\s+as)\b"
    r"[^.!?\n]{0,60}\b(?:the\s+app|memory_ob|hermes|the\s+browser|the\s+addon|add-?on|"
    r"the\s+plugin|html|\.md\b|docs?|sheet|pdf)\b"
    r"|\bLeave\s+everything\s+else\b"
    r"|\bchatgpt\s+as\s+default\b"
    r"|^\s*if\s+it\s+doesn['\u2019]?t\s+work\b",
    re.I,
)

# "Asked ...", "I ask whether ...", "Asks whether ...": notes about a conversation.
_META_ASK_RE = re.compile(r"^\s*(?:asked|asks|i\s+ask)\b", re.I)

# The owner talked about in the third person by whoever they were chatting with.
_THIRD_PERSON_OWNER_RE = re.compile(
    r"^\s*nishad\s+(?:wants?|needs?|likes?|prefers?|uses?|said|says|thinks?|will|would|should)\b",
    re.I,
)


def _dev_talk(s: str) -> bool:
    """An agent's or developer's working notes: two or more process words, or three dev words, in one line."""
    if _MAKING_RE.match(s):
        return False
    process = {m.group(0).lower() for m in _PROCESS_RE.finditer(s)}
    weak = {m.group(0).lower() for m in _WEAKDEV_RE.finditer(s)}
    if process and 2 * len(process) + len(weak) >= 3:
        return True
    if len(weak) >= 3:
        return True
    return bool(_CAPS_RE.search(s) and (process or weak))


_sink = threading.local()


@contextmanager
def collecting():
    """Within this block every line the filter drops is noted as ``(text, reason)``.

    Used by the reader to show "left out: ... (why)" next to what it kept. It changes nothing
    about what is dropped, and does nothing for a call made outside the block.
    """
    seen: list[tuple[str, str]] = []
    before = getattr(_sink, "items", None)
    _sink.items = seen
    try:
        yield seen
    finally:
        _sink.items = before


def _noted(s: str, why: str) -> None:
    items = getattr(_sink, "items", None)
    if items is not None and why != "empty" and all(s != t for t, _ in items):
        items.append((s, why))


def is_not_life(text: str) -> str:
    """'' when the line reads like life; otherwise a short reason it is not."""
    why = _why(text)
    if why:
        _noted((text or "").strip(), why)
    return why


_SENT_CUT_RE = re.compile(r"(?<=[.!?])\s+")


def strip(text: str) -> str:
    """*text* without what is clearly not life, so the AI is never asked to read it.

    A line is dropped when :func:`is_not_life` says so. A line that is not itself flagged is also
    dropped when it sits in a pile of flagged ones (three or more of the seven lines around it):
    a pasted README or an agent's notes are mostly plain sentences with a few obvious marks, and the
    plain ones are as much not-life as the marked ones. A short note of the owner's own, with nothing
    around it, is never touched. Nothing is lost: the whole message stays in Sources.
    """
    units: list[str] = []
    for line in (text or "").split("\n"):
        units.extend([s for s in _SENT_CUT_RE.split(line) if s.strip()] if len(line) > 400 else [line])
    idx = [i for i, u in enumerate(units) if u.strip()]
    flagged = {i: bool(is_not_life(units[i])) for i in idx}
    kept: list[str] = []
    for pos, i in enumerate(idx):
        if flagged[i]:
            continue
        before = any(flagged[idx[q]] for q in range(max(0, pos - 3), pos))
        after = any(flagged[idx[q]] for q in range(pos + 1, min(len(idx), pos + 4)))
        around = sum(flagged[idx[q]] for q in range(max(0, pos - 6), min(len(idx), pos + 7)))
        if before and after and around >= 3:          # in the middle of a pasted pile, not at its edge
            _noted(units[i].strip(), "pasted block")
            continue
        kept.append(units[i])
    return "\n".join(kept)


def _why(text: str) -> str:
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
    if _WORKTALK_RE.search(s) or _dev_talk(s):
        return "session work-talk"
    if _LOCAL_ADDR_RE.search(s) or _CODE_START_RE.match(s) or _PS_RE.search(s) or _API_ROUTE_RE.search(s):
        return "a code or server line"
    if _PRODUCT_WORK_RE.search(s):
        return "about the product's own work"
    if _WORK_CMD_RE.search(s):
        return "a command about the work"
    if _META_ASK_RE.match(s):
        return "about a conversation"
    if _THIRD_PERSON_OWNER_RE.match(s):
        return "about the owner in the third person"
    if _NARRATION_RE.match(s):
        return "agent narration"
    if _markup(s):
        return "markdown text"
    if _BARE_FILE_RE.search(s):
        return "file name"
    if _SNAKE_RE.search(s):
        return "code identifier"
    if _LINEID_RE.search(s):
        return "vault line id"
    if _QUOTED_VS_RE.search(s):
        return "review example"
    if _NOTELINE_RE.match(s):
        return "pasted note line"
    if _CODEID_RE.search(s):
        return "code identifier"
    return ""
