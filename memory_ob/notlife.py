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

# --- the agent's own voice -----------------------------------------------------
# High precision on purpose: the owner really does say "Actually, I prefer tea"
# and "I must call my mum", so nothing here keys on a first word alone. Every
# pattern needs the agent's *work* or the *project* in the sentence.

# "Let me fetch/read/run/check ..." with a work object in the same sentence.
_NARRATE_WORK_RE = re.compile(
    r"\b(?:let\s+me|let's|let\s+us|i'?ll|i\s+will|i'?m\s+going\s+to|i\s+need\s+to|"
    r"i\s+must|i\s+should|i\s+can|i\s+could|we'?ll|we\s+need\s+to)\b"
    r"[^.!?\n]{0,60}\b(?:fetch|read|scan|grep|run|check|review|commit|push|pull|clone|"
    r"install|build|test|chunk|branch|diff|repo|repository|file|code|tests?|suites?|"
    r"update|log|page|pull\s+request|setup|the\s+rest|the\s+site|the\s+branch|"
    r"the\s+build|the\s+suite|the\s+tests|the\s+file|the\s+code|the\s+repo|the\s+diff|"
    r"the\s+log|the\s+update|the\s+page|the\s+branch)\b",
    re.I,
)

# The agent talking about its own artefacts: "the file has 344 lines".
_ARTEFACT_RE = re.compile(
    r"\bthe\s+(?:file|code|repo|repository|build|update|branch|diff|log|tests?|suites?|"
    r"list|plan|rulebook|spec|vault|notes?|engine|patch|commit)\b"
    r"[^.!?\n]{0,30}\b(?:has|have|had|is|are|was|were|shows?|showed|contains?|contained|"
    r"lost|gains?|gained|ships?|shipped|includes?|included|fails?|failed|passed|green|"
    r"runs?|ran|changed|dropped|added|kept)\b",
    re.I,
)

# Counts of the agent's own outputs: "I saw 8 tests", "there were 44 lines".
_COUNT_RE = re.compile(
    r"\b(?:i\s+(?:saw|found|counted|read)|there\s+(?:is|are|was|were)|"
    r"it\s+(?:has|had)|with)\s+\d+\s+"
    r"(?:tests?|suites?|lines?|files?|errors?|failures?|warnings?|commits?|branches?|chunks?)\b",
    re.I,
)

# The agent referring to itself or the other builders in the third person.
_AGENTVOICE_RE = re.compile(
    r"\b(?:claude|chatgpt|hermes|the\s+other\s+(?:ai|judge|assistant|agent|builder)|"
    r"the\s+builders?|the\s+judges?|the\s+brain|the\s+body|the\s+owner)"
    r"(?:'s?\s+(?:audit|answer|report|list|plan|work|notes?|found|said|says|is|are|was|were|"
    r"has|had|did|does|will|would|should|can|could|thinks?|decided|built|fixed|kept|lost|"
    r"wrote|read|graded|flagged|warning|warned|keeps?|loses?|finds?|says)\b"
    r"|\s+(?:is|are|was|were|has|had|did|does|will|would|should|can|could|said|says|found|"
    r"kept|lost|wrote|read|graded|flagged|warned|built|fixed)\b)",
    re.I,
)

# The project's own meta: lists, plans, rulebooks, weights.
_METALIST_RE = re.compile(
    r"\b(?:the\s+(?:missing|fix|sweep|master|build|old)\s+(?:list|rulebook|plan|spec)|"
    r"what\s+to\s+work\s+on\s+after\s+this|my\s+(?:answer|report|audit|plan|recommendation\s+list|"
    r"to-?do|suite|golden\s+set)|the\s+weighted\s+mean|the\s+chore\s+queues?|"
    r"\bone\s+word\s+from\s+you\b)",
    re.I,
)

# "19% of the total weight" - a number about the project, not a life fact.
_PERCENT_RE = re.compile(r"\b\d+(?:\.\d+)?%\s+of\s+(?:the|a|its|their)\b", re.I)

# The agent correcting its own output: "I must correct this clearly."
_CORRECT_SELF_RE = re.compile(
    r"\bi\s+(?:must|need\s+to|should|will|'?ll|am\s+going\s+to)\s+"
    r"(?:correct|fix|change|update|revert|redo|rewrite|re-?read|re-?run)\s+"
    r"(?:this|that|it|the\s+\w+)\b",
    re.I,
)

# Instructions about the work itself: "mention what you changed", "what is still left".
_WORK_INSTR_RE = re.compile(
    r"\b(?:mention|tell|show|report|list|say|describe|explain)\b[^.!?\n]{0,40}"
    r"\bwhat\s+(?:you|we)\s+(?:changed|did|have|have\s+done|are\s+doing)\b"
    r"|\bwhat\s+is\s+still\s+left\b"
    r"|\b(?:upload|commit|push|install|delete|remove)\s+what\s+(?:you|we)\s+did\b",
    re.I,
)

# The project's own parts talked about as things: "vault speed", "model choice".
_PROJECT_PART_RE = re.compile(
    r"\b(?:vault|screen|screens|build|engine|search|meaning\s+search|model\s+choice|"
    r"test\s+suite|test\s+kit|installer|release|plugin|provider)\s+"
    r"(?:speed|load|loading|performance|choice|narrow|wide|heavy|slow|fast|redesign)\b"
    r"|\bexternal\s+AI\s+service\b|\bneeds\s+Node\.js\b|\bbuilds?\s+from\s+a\s+Mac\b",
    re.I,
)

# "It compares likely pairs", "Its notes check ...", "The check for private text ..."
_ABOUT_CODE_RE = re.compile(
    r"\b(?:it|its|the)\s+(?:check|filter|engine|code|librarian|extractor|splitter|audit|"
    r"check-?up|search|reader|writer|second\s+opinion|grounding)\b[^.!?\n]{0,50}"
    r"\b(?:compares?|checks?|shows?|uses?|keeps?|drops?|adds?|only|never|always|covers?|"
    r"ignores?|treats?|files?|reads?|writes?|saves?|finds?|flags?|looks?|needs?)\b"
    r"|\bthe\s+check\s+for\s+(?:private|text|notes|secret)\b"
    r"|\bonly\s+covers\b"
    r"|\bit\s+(?:compares?|checks?|shows?|uses?|keeps?|drops?|adds?|covers?|ignores?|"
    r"treats?|files?|reads?|writes?|saves?|finds?|flags?)\b[^.!?\n]{0,50}"
    r"\b(?:memories|notes?|records?|facts?|pairs?|words?|text|ids?|the\s+vault|embeddings?)\b"
    r"|\bits\s+\w+\s+check\b",
    re.I,
)

# UI/doc instructions that leaked from pasted readmes.
_UI_INSTR_RE = re.compile(
    r"\bclick\s+\**\w|\bmove\s+to\s+trash\b|\bdrag\s+\**\w.+\bonto\s+\**\w|"
    r"\bopen\s+`?\w+\.(?:dmg|exe|zip)`?\s+and\s+drag\b",
    re.I,
)

# "they want me to ..." - the agent describing its task.
_TASK_REF_RE = re.compile(r"\b(?:they|he|she)\s+want\s+me\s+to\b", re.I)

# A file name with a verb about it: "store.py lost ...", "extract.py ...".
_FILEVERB_RE = re.compile(
    r"\b\w+\.(?:py|md|json|js|ts|ps1|txt|yaml|yml|toml)\b"
    r"[^.!?\n]{0,25}\b(?:lost|has|had|hasn't|dropped|added|ships?|includes?|contains?|"
    r"changed|removed|gained|is|was)\b",
    re.I,
)

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
    if _NARRATE_WORK_RE.search(s):
        return "agent narration"
    if _ARTEFACT_RE.search(s):
        return "about the project's own files"
    if _COUNT_RE.search(s):
        return "count of tests or lines"
    if _AGENTVOICE_RE.search(s):
        return "about an AI, not the owner"
    if _METALIST_RE.search(s):
        return "project plan talk"
    if _PERCENT_RE.search(s):
        return "a percentage about the project"
    if _CORRECT_SELF_RE.search(s):
        return "the agent correcting itself"
    if _WORK_INSTR_RE.search(s):
        return "instructions about the work"
    if _PROJECT_PART_RE.search(s):
        return "about the project's own parts"
    if _ABOUT_CODE_RE.search(s):
        return "about how the code works"
    if _UI_INSTR_RE.search(s):
        return "a interface instruction"
    if _TASK_REF_RE.search(s):
        return "about the agent's task"
    if _FILEVERB_RE.search(s):
        return "about a file, not the owner"
    if _LINEID_RE.search(s):
        return "vault line id"
    if _QUOTED_VS_RE.search(s):
        return "review example"
    if _NOTELINE_RE.match(s):
        return "pasted note line"
    if _CODEID_RE.search(s):
        return "code identifier"
    return ""
