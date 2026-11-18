"""The write pipeline — capture, extract, candidate pool, trust scores.

Input is untrusted evidence. Instructions inside evidence are never obeyed.
AI output is advice, not evidence of the owner's life. Everything that lands
below the truth line is a *candidate* with a trust score; nothing becomes
truth without a Review card.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from . import notlife
from . import topics as _topics
from typing import Any

from . import hazards, ids, quotes, topics
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


# A sentence that only continues the one before it ("It started last week").
_CONTINUATION_RE = re.compile(
    r"^(?:it|this|that|they|there|he|she|him|her|them|its|their|his|these|those)\b", re.I)
_SOFT_CONT_RE = re.compile(
    r"^(?:and|but|so|then|also|later|afterwards|finally|plus)\b", re.I)


def _ended(sentence: str) -> str:
    """The sentence with a full stop, so a joined one never reads as one run-on line."""
    s = (sentence or "").rstrip()
    return s if not s or s[-1] in ".!?" else s + "."


def is_continuation(sentence: str) -> bool:
    """True when *sentence* only makes sense next to the one before it."""
    s = (sentence or "").strip()
    if not s:
        return False
    if _REVISIT_REF_RE.match(s):
        return True
    return len(s) < 60 and bool(_CONTINUATION_RE.match(s) or _SOFT_CONT_RE.match(s))


def _sentence_pieces(text: str) -> list[str]:
    return [" ".join(raw.split()) for raw in _SENTENCE_RE.split(text or "") if raw.strip()]


def canonical_claims(text: str) -> list[str]:
    """The one true way to cut text into claims (owner list item A5).

    The same words must always become the same memories, no matter how the AI
    helper happened to split them (it may hand over one run-on claim one day
    and four claims the next). Sentences that only continue the previous one
    stay attached; separate "I … and I …" statements become separate claims.
    """
    merged: list[str] = []
    for s in _sentence_pieces(text):
        if merged and is_continuation(s):
            merged[-1] = f"{_ended(merged[-1])} {s}"
        else:
            merged.append(s)
    out: list[str] = []
    for s in merged:
        out.extend(_split_clauses(s))
    return [c for c in out if len(c) >= _MIN_CLAIM]

# The model's own "nothing here" answer. Treating it as a fact is how "ok"/"ok"
# became a candidate.
# Model-answer scaffolding ("Here are the facts:") - not a claim. Only used
# when reading a model's answer, never on the owner's own words.
_ANSWER_FILLER_RE = re.compile(
    r"^(?:here (?:are|is)|below (?:are|is)|the following (?:are|is)|sure[ ,!]|certainly[ ,!]|"
    r"of course[ ,!]|alright[ ,!]|okay[ ,!]|i found \d|i have (?:extracted|found|identified)|"
    r"i will now|let me|i can see)\b", re.I)

# A refusal or apology is not an answer: the text must be kept aside (D1).
_ANSWER_REFUSAL_RE = re.compile(
    r"^\s*(?:i am (?:so |very )?sorry|i['\u2019]?m (?:so |very )?sorry|sorry,|i apologize|i apologise|"
    r"unfortunately\b|as an ai(?: language model)?\b)|"
    r"\bi ca(?:nno|['\u2019]?t) (?:do|help|assist|comply|provide|continue|read|process)\b|"
    r"\bi am (?:not able|unable) to\b", re.I)

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
    # The AI's word on who the line is about: "me", "other", or "" when it did not say.
    about: str = ""

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
    kept: list[str] = []
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
        if notlife.is_not_life(s):
            continue          # tool-talk, logs, docs, instructions: not life
        kept.append(s)
    return canonical_claims("\n".join(kept)) if kept else []


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
    kept: list[tuple[str, dict[str, Any], str, str, list[str], str]] = []
    for item in _read_items(raw):
        filing: dict[str, Any] = {}
        context = sentiment = about = ""
        people: list[str] = []
        if isinstance(item, dict):
            about = str(item.get("about") or "").strip().lower()
            about = about if about in ("me", "other") else ""
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
        if filing.get("project") and not _topics.valid_thread_title(filing["project"]):
            filing["project"] = ""    # a report word is never a project name
        for sent in _sentence_pieces(s):
            if len(sent) < 12 or _CHATTER_RE.match(sent) or _META_RE.search(sent):
                continue
            if _ANSWER_FILLER_RE.match(sent):
                continue
            if hazards.is_hazardous(sent) or _FORGET_RE.match(sent):
                continue
            if notlife.is_not_life(sent):
                continue          # the model repeated tool-talk/docs; not life
            kept.append((sent, filing, context, sentiment, people, about))

    # One canonical cut for everything (owner list item A5): a continuation
    # sentence joins the statement before it, no matter which claim the model
    # put it in. The same words then become the same memories every time.
    merged: list[tuple[str, dict[str, Any], str, str, list[str], str]] = []
    for sent, filing, context, sentiment, people, about in kept:
        if merged and is_continuation(sent):
            prev = merged[-1]
            merged[-1] = (f"{_ended(prev[0])} {sent}", prev[1], prev[2], prev[3], prev[4], prev[5])
        else:
            merged.append((sent, filing, context, sentiment, people, about))

    out: list[Candidate] = []
    for sent, filing, context, sentiment, people, about in merged:
        for claim in _split_clauses(sent):
            if len(claim) < _MIN_CLAIM:
                continue
            out.append(Candidate(
                id=ids.new_id(), text=claim, trust=score_claim(claim), kind_hint=kind_hint_for(claim),
                source=source or {}, created=_now(), context=context, sentiment=sentiment,
                people=people, about=about, **filing,
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
        '"about": "<me if the line is about the person themself, other if it is about somebody else>", '
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

    When the helper fails or answers unreadably this returns ``None`` (owner
    decision D1): the text is kept whole by the caller and read again later.
    Simple rules never fragment and file it as if the AI had read it.
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
        return None          # D1: the helper did not read it - the caller keeps the text whole
    if not str(raw).strip():
        return None          # an empty answer is no answer
    answer = str(raw).strip()
    if _ANSWER_REFUSAL_RE.search(answer[:300]) or (
            not _read_items(raw) and not _NO_FACTS_RE.match(answer)):
        return None          # unreadable/refused answer - keep the text aside, re-read later
    found = _candidates_from(raw, source)
    return [] if found is None else found    # "none" means the model read it and kept nothing


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
        return None          # D1: the helper did not read it - the caller keeps the text whole
    if not str(raw).strip():
        return None
    answer = str(raw).strip()
    if _ANSWER_REFUSAL_RE.search(answer[:300]) or (
            not _read_items(raw) and not _NO_FACTS_RE.match(answer)):
        return None          # unreadable/refused answer - keep the text aside, re-read later
    found = _candidates_from(raw, source)
    return [] if found is None else found


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


def _invented_names(claim: str, owner_text: str, me: frozenset[str] = frozenset()) -> list[str]:
    """Capitalised names in *claim* that the owner never wrote.

    A librarian that rewrites "it" into a real name must take that name from
    the owner's own words. A name that appears nowhere in them came from
    the assistant (or was made up), and is not the owner's fact. The owner's own name
    (*me*, when they marked their profile) is never an invented name.
    """
    low = (owner_text or "").lower()
    return [w for w in _NAME_WORD_RE.findall(claim or "") if w.lower() not in low and w.lower() not in me]


_REL_WORDS = topics.PEOPLE_ROLES + topics.OTHER_SUBJECTS
_REL_ALT = "|".join(sorted((re.escape(w) for w in _REL_WORDS), key=len, reverse=True))
_LEAD_RE = re.compile(r"^\W*(?:(?:and|but|also|so|well|oh|then|plus|ok|okay|yeah|actually)\b[\s,]*)+", re.I)
_ME_RE = re.compile(r"^\W*(?:i|i'm|im|i've|ive|i'd|i'll|me|we|we're|we've|us|our)\b", re.I)
_REL_SUBJECT_RE = re.compile(
    r"^\W*(?i:my|our)\s+(?:(?i:younger|older|elder|little|big|youngest|oldest|old|dear|step|half|twin|favou?rite|close|new)\s+)?((?i:" + _REL_ALT + r"))(?i:s|es)?\b(?:\s+(?i:named|called))?(?:\s+([A-Z][a-z]{2,}))?")
_REL_AND_ME_RE = re.compile(
    r"^\W*(?i:my|our)\s+(?:(?i:younger|older|elder|little|big|youngest|oldest|old|dear|step|half|twin|favou?rite|close|new)\s+)?(?i:" + _REL_ALT + r")(?i:s|es)?(?:\s+[A-Z][a-z]{2,})?\s+(?i:and)\s+(?i:i|me)\b")
# "My <anything> lives in / studies at / said ...": whatever it is, it is not the owner. A word
# the list above does not know ("my physio lives in Dhaka") must not turn into "I live in Dhaka".
_MY_THING_DOES_RE = re.compile(
    r"^\W*(?i:my|our)\s+((?:[A-Za-z'-]+\s+){0,2}[A-Za-z'-]+)\s+"
    r"(?i:(?:lives?|lived|living|studies|studied|teaches|taught|married|graduated|retired|"
    r"said|says|told|tells|asked|asks|moved|moves|speaks|spoke|visited|visits|born|"
    r"works?\s+(?:at|for|in|as))\b)")
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


def starts_with_name(sentence: str, names: frozenset[str]) -> bool:
    """Does the sentence start with one of *names* (the owner's own), as a whole word?"""
    if not names:
        return False
    alt = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.match(r"^\W*(?:" + alt + r")(?:'s)?\b", sentence, re.I) is not None


def _subject_of(sentence: str, me: frozenset[str] = frozenset()) -> tuple[str, frozenset[str]]:
    """Who a sentence is about: ``("me", ...)``, ``("other", {tokens})`` or ``("unknown", ...)``.

    *me* is the owner's own names (when they marked their profile): a sentence that starts with
    one of them is about the owner, like one that starts with "I".
    """
    s = _LEAD_RE.sub("", sentence or "").strip()
    if not s:
        return "unknown", frozenset()
    if _ME_RE.match(s) or _REL_AND_ME_RE.match(s) or _NAME_AND_ME_RE.match(s) or starts_with_name(s, me):
        return "me", frozenset()
    m = _REL_SUBJECT_RE.match(s)
    if m:
        return "other", frozenset(t.lower() for t in m.groups() if t)
    m = _MY_THING_DOES_RE.match(s)
    if m and not re.search(r"\b(?:and|&)\s+(?:i|me|we)\b", m.group(1), re.I):
        return "other", frozenset(w.lower() for w in re.findall(r"[A-Za-z]{3,}", m.group(1)))
    m = _PRONOUN_RE.match(s)
    if m:
        return "other", frozenset({m.group(1).lower()})
    m = _NAME_SUBJECT_RE.match(s)
    if m and m.group(1).split()[0].lower() not in _NOT_NAMES:
        return "other", frozenset(w.lower() for w in m.group(1).split())
    return "unknown", frozenset()


def subject_of(sentence: str, me: frozenset[str] = frozenset()) -> tuple[str, frozenset[str]]:
    """Who a sentence is about: ``("me" | "other" | "unknown", tokens naming the other person)``."""
    return _subject_of(sentence, me)


def _mentions(claim: str, tokens: frozenset[str]) -> bool:
    """Does the claim name the person (or relation) a sentence is about?"""
    from . import conflicts

    have = {conflicts.stem(w) for w in re.findall(r"[a-z']+", (claim or "").lower())}
    return any(conflicts.stem(t) in have for t in tokens)


def evidence_for(claim: str, owner_text: str, *, forward_ok: bool = False, me: frozenset[str] = frozenset(),
                 about_other: bool = False) -> Evidence:
    """Is *claim* backed by what the owner actually said? And by which of their sentences?

    A claim is grounded only when **one real sentence** of the owner's backs most
    of it (at least 60% of its content words, every number in it). Words may come
    from other sentences only to fill in what the owner left unsaid ("It makes 50k"
    after "I started a bakery called Sweet Rise") and only from sentences that are
    about the owner, or about the person the claim names. So "I live in Dhaka" is
    not backed by "My sister lives in Dhaka", and "I work at Google" is not backed
    by "I want to work at Google someday" (a wish is not a fact; ``forward_ok``
    lets a to-do or plan keep its wish wording).

    *me* is the owner's own names: a sentence about "Nishad" is a sentence about the owner when
    that is who they are. *about_other* is the AI helper's word that the claim is about somebody
    else (a claim that plainly starts with another person, "Rahim lives in Dhaka", counts too):
    then the owner's sentences about themself cannot back it either.
    """
    from . import conflicts

    wanted = {w for w in conflicts.read(claim).stems if w not in _META_WORDS}
    if not wanted:
        return Evidence(True)
    if _invented_names(claim, owner_text, me):
        return Evidence(False, reason="a name the owner never wrote")
    sentences = [x.strip() for x in _SENTENCE_RE.split(owner_text or "") if x.strip()]
    if _subject_of(claim, me)[0] == "other":
        about_other = True      # "Rahim lives in Dhaka" is not backed by the owner's own "I live in Dhaka"
    pool: list[tuple[str, frozenset[str]]] = []
    for sent in sentences:
        kind, tokens = _subject_of(sent, me)
        if kind == "other" and not _mentions(claim, tokens):
            continue            # about somebody the claim does not mention: not evidence for it
        if kind == "me" and about_other:
            continue            # the helper says the claim is about somebody else, so "I ..." is not evidence
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
