"""The write pipeline — capture, extract, candidate pool, trust scores.

Input is untrusted evidence. Instructions inside evidence are never obeyed.
AI output is advice, not evidence of the owner's life. Everything that lands
below the truth line is a *candidate* with a trust score; nothing becomes
truth without a Review card.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from . import hazards, ids, quotes
from .records import CANDIDATE_MAX, CANDIDATE_MIN, NOTE, PROFILE

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+|\n+")

# Chatter that never becomes a fact: greetings, thanks, filler, one-word ack.
_CHATTER_RE = re.compile(
    r"^(?:(?:hi|hello|hey|yo|ok|okay|yes|yep|yeah|no|nope|thanks|thank you|thx|cheers|sure|"
    r"cool|nice|great|awesome|perfect|alright|fine|done|next|continue|go|bye|goodbye|hm{1,3}|lol|lmao|"
    r"sorry|please|wow|ah|oh|uh|um+|got it|all good|never ?mind|nvm|"
    r"that['\u2019]?s (?:all|it)|that is (?:all|it)|for now|for today|for the moment|"
    r"a lot|so much|very much|again|see you(?: later)?|talk (?:to you )?later|"
    r"good (?:morning|afternoon|evening|night))\b[\s,.!]*)+$",
    re.IGNORECASE,
)

_QUESTION_RE = re.compile(r"\?\s*$")

# "forget that I like mangoes" is an instruction to Memory_OB, never a memory.
_FORGET_RE = re.compile(
    r"^\s*(?:(?:please|pls|hey|ok|okay)[ ,]+)*(?:forget|delete|remove|erase|unremember)\s+"
    r"(?:(?:that|about|the fact that|what i said about|my memory (?:of|about))\s+)?"
    r"(?P<what>.{3,200}?)\s*[.!]?\s*$", re.I)


def forget_target(sentence: str) -> str:
    """What the owner asked to be forgotten ("I like mangoes"), or ''."""
    m = _FORGET_RE.match(sentence or "")
    return m.group("what").strip() if m else ""

# "I live in Dhaka and I study CSE" is two facts. Splitting them lets each be
# found, edited and checked against older statements on its own. Only the
# plain "I … and I …" shape is split: "My friend and I went" stays whole.
_CLAUSE_SPLIT_RE = re.compile(r"(?:,\s*|\s+)(?:and|but)\s+(?=(?:i|we)\b)", re.IGNORECASE)
_FIRST_PERSON_START_RE = re.compile(r"(?:i|we)\b", re.IGNORECASE)
_MIN_CLAIM = 12

# "I'll come back to this idea in a year" only makes sense next to the idea.
_REVISIT_REF_RE = re.compile(
    r"(?:i(?:'|’)?ll|i will|i(?:'|’)?m going to|i am going to|we(?:'|’)?ll|let me)\s+"
    r"(?:come back|get back|go back|return|revisit|circle back|pick\b|look (?:at|into))\b[^.!?]*\b(?:this|that|it)\b",
    re.IGNORECASE,
)


def _split_clauses(sentence: str) -> list[str]:
    """One sentence as one claim, or as several when it joins separate "I …" statements."""
    if not _FIRST_PERSON_START_RE.match(sentence):
        return [sentence]
    parts = [p.strip(" ,;") for p in _CLAUSE_SPLIT_RE.split(sentence)]
    if len(parts) < 2 or any(len(p) < _MIN_CLAIM for p in parts):
        return [sentence]
    return [p if p[-1] in ".!?" else p + "." for p in parts]

# The model's own "nothing here" answer. Treating it as a fact is how "ok"/"ok"
# became a candidate.
_NO_FACTS_RE = re.compile(
    r"(?i)^\(?\s*(no (facts?|memories?|memorable (facts|memories))"
    r"( to extract)?|nothing (worth (keeping|remembering)|memorable)|"
    r"none|n/?a)\s*\)?[.!]?\s*$"
)

# Session noise: talk ABOUT the conversation, the tool, or the review UI —
# "the speaker reports…", "the repo is at…", "score 0.45 · hermes". This is
# working memory about the session, not a fact about the owner's life, and it
# must never become a candidate.
_META_RE = re.compile(
    r"\b(?:the speaker|the assistant|the user|the owner|the agent|the model|"
    r"the repo|the repository|github|pull request|"
    r"the review|the memory|the candidate|the inbox|the vault|"
    r"the session|this conversation|the conversation|the tool|the ui|"
    r"the dashboard|the screen|the tab|score\s*\d|not true)\b",
    re.IGNORECASE,
)


@dataclass(slots=True)
class Candidate:
    """One candidate fact below the truth line."""

    id: str
    text: str
    trust: float = 0.3
    kind_hint: str = NOTE
    source: dict[str, Any] = field(default_factory=dict)
    created: str = ""
    context: str = ""
    sentiment: str = ""
    people: list[str] = field(default_factory=list)
    # How the AI librarian filed it. Empty / None means "it did not say": simple rules decide.
    category: str = ""
    note: str = ""
    project: str = ""
    todo: bool | None = None
    moment: bool | None = None
    filed_by: str = ""

    def to_dict(self) -> dict[str, Any]:
        from dataclasses import asdict

        return asdict(self)


def _now() -> str:
    import time

    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def split_claims(text: str) -> list[str]:
    """Split raw text into candidate claim strings.

    The hazard filter runs here too, not only on the model path. When no model
    is available this is the only judge there is, and without it an
    instruction-like string ("ignore all previous instructions…") becomes a
    candidate that recall can later hand to a model.
    """
    out: list[str] = []
    for raw in _SENTENCE_RE.split(text or ""):
        s = " ".join(raw.split())
        if len(s) < 12:
            continue
        if _CHATTER_RE.match(s):
            continue
        if _QUESTION_RE.search(s):
            continue
        if _FORGET_RE.match(s):
            continue
        if hazards.is_hazardous(s):
            continue
        if out and _REVISIT_REF_RE.match(s):
            out[-1] = f"{out[-1]} {s}"       # "…business. I'll come back to this in a year." is one idea
            continue
        out.extend(_split_clauses(s))
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


def _heuristic_meta(claim: str, text: str) -> tuple[str, str, list[str]]:
    """Offline fallback: guess context, sentiment and people from the words.

    Used when no model is available. Deliberately conservative — a wrong guess
    is worse than an empty field, so anything uncertain is left blank.
    """
    low = claim.lower()
    sentiment = ""
    if re.search(r"\b(love|like|enjoy|happy|excited|grateful|glad|proud)\b", low):
        sentiment = "positive"
    elif re.search(r"\b(hate|dislike|angry|upset|frustrated|sad|annoyed|anxious)\b", low):
        sentiment = "negative"
    # People: capitalised words that are not the start of the sentence.
    people = [
        w for w in re.findall(r"\b([A-Z][a-z]{2,})\b", claim)
        if w not in {"The", "This", "That", "They", "There", "What", "When", "It"}
    ]
    context = ""
    if len(text) > len(claim) + 20:
        context = text.strip().replace("\n", " ")[:200]
    return context, sentiment, people


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


def extract_claims(
    text: str,
    *,
    source: dict[str, Any] | None = None,
    model_call: Any | None = None,
    hint: str = "",
) -> list[Candidate]:
    """Turn raw evidence into candidate facts.

    When *model_call* is given the model writes the candidates (and its output
    is validated: hazards dropped, chatter dropped, every claim re-scored).
    Without one, a built-in heuristic does the job offline.
    """
    if model_call is not None:
        return extract_with_model(text, model_call=model_call, source=source, hint=hint)
    out: list[Candidate] = []
    for claim in split_claims(text):
        if _META_RE.search(claim):
            continue
        context, sentiment, people = _heuristic_meta(claim, text)
        out.append(
            Candidate(
                id=ids.new_id(),
                text=claim,
                trust=score_claim(claim),
                kind_hint=kind_hint_for(claim),
                source=source or {},
                created=_now(),
                context=context,
                sentiment=sentiment,
                people=people,
            )
        )
    return out


_FILING_KEYS = ("category", "note", "project", "todo", "moment")


def _as_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in ("true", "yes", "false", "no"):
        return value.strip().lower() in ("true", "yes")
    return None


def _clean_title(value: Any, *, limit: int) -> str:
    """A short name for a note or project: one line, no characters that break a file name or a link."""
    s = re.sub(r"[\\/:*?\"<>|#^\[\]]+", " ", str(value or ""))
    return " ".join(s.split())[:limit].strip(" .-")


def _category_of(value: Any) -> str:
    from . import topics

    want = str(value or "").strip().lower()
    return next((c for c in topics.CATEGORIES if c.lower() == want), "")


def _read_items(raw: str) -> list[Any]:
    """What the model wrote, as a list of JSON objects and plain lines.

    Models answer in several shapes: one JSON object per line (asked for), a
    JSON list, a ``{"claims": [...]}`` wrapper, or a bulleted list of plain
    sentences, sometimes inside a code fence. All of them are read.
    """
    import json as _json

    text = (raw or "").strip()
    text = re.sub(r"^```[A-Za-z]*[ \t]*\n?|\n?```\s*$", "", text).strip()
    if text[:1] in ("[", "{"):
        try:
            doc = _json.loads(text)
        except ValueError:
            doc = None
        if isinstance(doc, list):
            return list(doc)
        if isinstance(doc, dict):
            for key in ("claims", "facts", "memories", "items"):
                if isinstance(doc.get(key), list):
                    return list(doc[key])
            return [doc]
    items: list[Any] = []
    for line in text.splitlines():
        s = line.strip().lstrip("-*• ").strip()
        if not s:
            continue
        if s.startswith("{"):
            try:
                obj = _json.loads(s)
            except ValueError:
                items.append(s)
                continue
            wrapped = next((obj[k] for k in ("claims", "facts", "memories", "items")
                            if isinstance(obj, dict) and isinstance(obj.get(k), list)), None)
            items.extend(wrapped if wrapped is not None else [obj])
        else:
            items.append(s)
    return items


def _candidates_from(raw: str, source: dict[str, Any] | None) -> list[Candidate] | None:
    """Candidates from the model's answer, each checked; None when it said "nothing here".

    The answer is untrusted: hazards, chatter and talk about the session are
    dropped, and every claim is re-scored.
    """
    out: list[Candidate] = []
    for item in _read_items(raw):
        filing: dict[str, Any] = {}
        context = sentiment = ""
        people: list[str] = []
        if isinstance(item, dict):
            s = str(item.get("text") or item.get("fact") or item.get("claim") or "").strip()
            context = str(item.get("context") or "").strip()
            sentiment = str(item.get("sentiment") or "").strip()
            people = [str(p).strip() for p in (item.get("people") or []) if str(p).strip()] \
                if isinstance(item.get("people"), list) else []
            if any(k in item for k in _FILING_KEYS):
                filing = {
                    "category": _category_of(item.get("category")),
                    "note": _clean_title(item.get("note"), limit=60),
                    "project": _clean_title(item.get("project"), limit=40),
                    "todo": _as_bool(item.get("todo")),
                    "moment": _as_bool(item.get("moment")),
                    "filed_by": "ai",
                }
        else:
            s = str(item).strip()
        if _NO_FACTS_RE.match(s):
            return None
        if len(s) < 12 or _CHATTER_RE.match(s) or _META_RE.search(s):
            continue
        if hazards.is_hazardous(s) or _FORGET_RE.match(s):
            continue
        out.append(Candidate(
            id=ids.new_id(), text=s, trust=score_claim(s), kind_hint=kind_hint_for(s),
            source=source or {}, created=_now(), context=context, sentiment=sentiment,
            people=people, **filing,
        ))
    return out


def _librarian_prompt(intro: str, rules: str, body: str, hint: str) -> str:
    from . import topics

    return (
        f"{intro}\n"
        "You are the librarian of this person's private notes. Write down what is worth keeping "
        "and say where it should be filed.\n"
        "Rules:\n"
        f"{rules}"
        "- Make every line understandable on its own: replace \"it\", \"that\", \"there\", \"he\", "
        "\"she\" with the real name from the conversation. Keep the person's own words otherwise. "
        "Never add anything they did not say.\n"
        "- Preserve uncertainty (\"maybe\", \"I think\") and reported-vs-observed wording.\n"
        "- One idea per line. Do not split one thought into pieces. Skip anything already in the notes below.\n"
        "- No preamble. One JSON object per line:\n"
        '{"text": "...", "category": "<' + " | ".join(topics.CATEGORIES) + '>", '
        '"note": "<short name of the note it belongs in: reuse a name from the list below when it fits, '
        'otherwise a new short name, or empty>", '
        '"project": "<name of the person\'s own project or idea it is about, or empty>", '
        '"todo": <true if it is something they still have to do>, '
        '"moment": <true if it is only how they feel or what is happening right now>, '
        '"people": ["names of people it mentions"], "sentiment": "...", "context": "..."}\n'
        "- If there is nothing worth keeping, answer exactly: none\n"
        + (f"\nWhat the person already has (reuse these names):\n{hint}\n" if hint.strip() else "")
        + f"\n{body}"
    )


def extract_with_model(
    text: str,
    *,
    model_call: Any,
    source: dict[str, Any] | None = None,
    hint: str = "",
) -> list[Candidate]:
    """Ask a model to read the text and file each fact, then validate every line.

    ``model_call`` is a callable taking a prompt string and returning text.
    *hint* lists the notes, projects and people the owner already has, so the
    model files into them instead of inventing new ones. The model's output is
    treated as untrusted (see ``_candidates_from``).
    """
    prompt = _librarian_prompt(
        "Read the text below. It was written by the person whose notes these are.",
        "- Only facts the person stated about themselves, their plans, their work, or people they know.\n",
        f"Text:\n{text}", hint,
    )
    try:
        raw = model_call(prompt)
    except Exception:
        return extract_claims(text, source=source)
    found = _candidates_from(raw, source)
    if found is None:
        return []
    return found or extract_claims(text, source=source)


def extract_session(
    parts: list[tuple[str, str]],
    *,
    model_call: Any,
    source: dict[str, Any] | None = None,
    hint: str = "",
) -> list[Candidate]:
    """Extract the owner's durable facts from a whole labelled session.

    The model sees who said what and is told the owner is the only subject, so
    the assistant's own narration is context rather than material. Feeding the
    session in one piece matters: extracting per speaker makes "the person
    speaking" the assistant on its turns, and every sentence it utters becomes
    a candidate about itself.

    Falls back to the offline heuristic on the owner's turns when no model is
    available.
    """
    transcript = "\n".join(
        f"{role}: {text.strip()}"
        for role, text in parts
        if (text or "").strip()
    )
    if not transcript.strip():
        return []

    prompt = _librarian_prompt(
        "Below is a conversation. The speaker labelled 'user' is the OWNER. "
        "The speaker labelled 'assistant' is an assistant.",
        "- Only what the OWNER stated about themselves: preferences, habits, their work, their life, "
        "their plans, people they know.\n"
        "- Nothing the assistant said, inferred, summarised or assumed. Nothing about the assistant. "
        "A speaker labelled 'other (Name)' is another person in a group chat: what they say is not "
        "the OWNER's own statement, though the OWNER's replies to them are.\n"
        "- No feelings, diagnoses, motives or identities you infer.\n",
        f"Conversation:\n{transcript}", hint,
    )
    try:
        raw = model_call(prompt)
    except Exception:
        return _heuristic_from_owner(parts, source=source)
    found = _candidates_from(raw, source)
    if found is None:
        return []
    return found or _heuristic_from_owner(parts, source=source)


def _heuristic_from_owner(
    parts: list[tuple[str, str]], *, source: dict[str, Any] | None = None
) -> list[Candidate]:
    """Offline fallback: only the owner's turns, never the assistant's."""
    owner_text = "\n".join(
        text.strip() for role, text in parts if role == "user" and (text or "").strip()
    )
    if not owner_text.strip():
        return []
    return extract_claims(owner_text, source=source)


_META_WORDS = frozenset({"owner", "user", "person", "speaker", "author", "they", "their"})


_NAME_WORD_RE = re.compile(r"(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b")


def _invented_names(claim: str, owner_text: str) -> list[str]:
    """Capitalised names in *claim* that the owner never wrote.

    A librarian that rewrites "it" into a real name must take that name from
    the owner's own words. A name that appears nowhere in them came from
    the assistant (or was made up), and is not the owner's fact.
    """
    low = (owner_text or "").lower()
    return [w for w in _NAME_WORD_RE.findall(claim or "") if w.lower() not in low]


_REL_WORDS = (
    "sister", "brother", "mother", "mom", "mum", "father", "dad", "wife", "husband",
    "best friend", "friend", "cousin", "uncle", "aunt", "boss", "manager", "teacher",
    "professor", "roommate", "girlfriend", "boyfriend", "partner", "colleague",
    "coworker", "neighbor", "neighbour", "classmate", "mentor", "son", "daughter",
    "grandmother", "grandfather", "grandma", "grandpa", "fiance", "fiancee",
)
_REL_ALT = "|".join(sorted(_REL_WORDS, key=len, reverse=True))
_LEAD_RE = re.compile(r"^\W*(?:(?:and|but|also|so|well|oh|then|plus|ok|okay|yeah|actually)\b[\s,]*)+", re.I)
_ME_RE = re.compile(r"^\W*(?:i|i'm|im|i've|ive|i'd|i'll|me|we|we're|we've|us|our)\b", re.I)
_REL_SUBJECT_RE = re.compile(
    r"^\W*(?i:my|our)\s+(?:(?i:younger|older|elder|little|big|youngest|oldest|old|dear|step|half|twin|favou?rite|close|new)\s+)?((?i:" + _REL_ALT + r"))\b(?:\s+(?i:named|called))?(?:\s+([A-Z][a-z]{2,}))?")
_REL_AND_ME_RE = re.compile(
    r"^\W*(?i:my|our)\s+(?:(?i:younger|older|elder|little|big|youngest|oldest|old|dear|step|half|twin|favou?rite|close|new)\s+)?(?i:" + _REL_ALT + r")(?:\s+[A-Z][a-z]{2,})?\s+(?i:and)\s+(?i:i|me)\b")
_NAME_AND_ME_RE = re.compile(r"^\W*[A-Z][a-z]{2,}\s+and\s+(?:i|me)\b")
_PRONOUN_RE = re.compile(r"^\W*(he|she|they|his|her|their)\b", re.I)
_NAME_SUBJECT_RE = re.compile(
    r"^\W*([A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?)\s+"
    r"(?:is|was|has|had|will|can|paid|said|got|went|did|owes|[a-z]{3,}s|[a-z]{3,}ed)\b")
_NOT_NAMES = frozenset({
    "the", "this", "that", "there", "these", "those", "its", "when", "while", "after", "before",
    "today", "tomorrow", "yesterday", "maybe", "also", "then", "now", "here", "sometimes", "always",
    "never", "every", "some", "many", "one", "last", "next", "you", "your", "what", "why", "how",
    "who", "please", "most", "both", "each", "just", "still", "even", "since", "because", "although",
    "though", "if", "once", "soon", "later", "recently", "currently", "usually", "mostly", "almost",
})
# Wishes and plans: "I want to work at Google someday" is not "I work at Google".
_WISH_RE = re.compile(
    r"\b(want(?:s|ed)?\s+to|wanna|wish(?:es|ed)?|hope(?:s|d)?\s+to|hoping\s+to|dream(?:s|ed)?\s+(?:of|about)|"
    r"someday|one\s+day|would\s+(?:like|love)\s+to|plan(?:s|ned|ning)?\s+to|going\s+to|gonna|"
    r"intend(?:s|ed)?\s+to|aim(?:s|ed|ing)?\s+to|thinking\s+(?:of|about)|considering)\b", re.I)
_CONTRAST_RE = re.compile(r"\s*(?:[,;:]|\b(?:but|though|although|however|while)\b)\s*", re.I)


@dataclass(slots=True)
class Evidence:
    """Whether a claim is backed by the owner's own words, and by which sentence."""

    grounded: bool
    quote: str = ""
    hedged: bool = False        # the owner sounded unsure in the very words that back it
    reason: str = ""


def _subject_of(sentence: str) -> tuple[str, frozenset[str]]:
    """Who a sentence is about: ``("me", ...)``, ``("other", {tokens})`` or ``("unknown", ...)``."""
    s = _LEAD_RE.sub("", sentence or "").strip()
    if not s:
        return "unknown", frozenset()
    if _ME_RE.match(s) or _REL_AND_ME_RE.match(s) or _NAME_AND_ME_RE.match(s):
        return "me", frozenset()
    m = _REL_SUBJECT_RE.match(s)
    if m:
        return "other", frozenset(t.lower() for t in m.groups() if t)
    m = _PRONOUN_RE.match(s)
    if m:
        return "other", frozenset({m.group(1).lower()})
    m = _NAME_SUBJECT_RE.match(s)
    if m and m.group(1).split()[0].lower() not in _NOT_NAMES:
        return "other", frozenset(w.lower() for w in m.group(1).split())
    return "unknown", frozenset()


def subject_of(sentence: str) -> tuple[str, frozenset[str]]:
    """Who a sentence is about: ``("me" | "other" | "unknown", tokens naming the other person)``."""
    return _subject_of(sentence)


def _mentions(claim: str, tokens: frozenset[str]) -> bool:
    """Does the claim name the person (or relation) a sentence is about?"""
    from . import conflicts

    have = {conflicts.stem(w) for w in re.findall(r"[a-z']+", (claim or "").lower())}
    return any(conflicts.stem(t) in have for t in tokens)


def evidence_for(claim: str, owner_text: str, *, forward_ok: bool = False) -> Evidence:
    """Is *claim* backed by what the owner actually said? And by which of their sentences?

    A claim is grounded only when **one real sentence** of the owner's backs most
    of it (at least 60% of its content words, every number in it). Words may come
    from other sentences only to fill in what the owner left unsaid ("It makes 50k"
    after "I started a bakery called Sweet Rise") and only from sentences that are
    about the owner, or about the person the claim names. So "I live in Dhaka" is
    not backed by "My sister lives in Dhaka", and "I work at Google" is not backed
    by "I want to work at Google someday" (a wish is not a fact; ``forward_ok``
    lets a to-do or plan keep its wish wording).
    """
    from . import conflicts

    wanted = {w for w in conflicts.read(claim).stems if w not in _META_WORDS}
    if not wanted:
        return Evidence(True)
    if _invented_names(claim, owner_text):
        return Evidence(False, reason="a name the owner never wrote")
    sentences = [x.strip() for x in _SENTENCE_RE.split(owner_text or "") if x.strip()]
    pool: list[tuple[str, frozenset[str]]] = []
    for sent in sentences:
        kind, tokens = _subject_of(sent)
        if kind == "other" and not _mentions(claim, tokens):
            continue            # about somebody the claim does not mention: not evidence for it
        pool.append((sent, conflicts.read(sent).stems))
    if not pool:
        return Evidence(False, reason="no sentence of the owner's is about this")
    best, best_stems, best_cover = "", frozenset(), 0.0
    for sent, stems in pool:
        cover = len(wanted & stems) / len(wanted)
        if cover > best_cover:
            best, best_stems, best_cover = sent, stems, cover
    union = frozenset().union(*(stems for _, stems in pool))
    pool_cover = len(wanted & union) / len(wanted)
    if not (best_cover >= 0.6 or (best_cover >= 0.34 and pool_cover >= 0.85)):
        return Evidence(False, reason="not backed by one of the owner's sentences")
    claim_numbers = set(conflicts._NUMBER_RE.findall(claim.lower()))          # noqa: SLF001
    pool_numbers: set[str] = set()
    for sent, _ in pool:
        pool_numbers |= set(conflicts._NUMBER_RE.findall(sent.lower()))       # noqa: SLF001
    if not claim_numbers <= pool_numbers:
        return Evidence(False, reason="a number the owner did not say about this")
    if _WISH_RE.search(best) and not _WISH_RE.search(claim) and not forward_ok:
        return Evidence(False, reason="the owner said they wish or plan this, not that it is so")
    clauses = [c for c in _CONTRAST_RE.split(best) if c and c.strip()] or [best]
    clause = max(clauses, key=lambda c: len(wanted & conflicts.read(c).stems))
    return Evidence(True, best[:300], hedged=conflicts.is_hedged(clause))


def support(claim: str, owner_text: str) -> tuple[bool, str]:
    """``(grounded, evidence)`` for *claim*; see :func:`evidence_for`."""
    ev = evidence_for(claim, owner_text)
    return ev.grounded, ev.quote


def make_quote(text: str, source_text: str) -> dict[str, str]:
    """Build a hash-verified quote record (law 1)."""
    return {
        "quote": text,
        "source_text": source_text,
        "quote_hash": quotes.hash_quote(text, source_text),
    }
