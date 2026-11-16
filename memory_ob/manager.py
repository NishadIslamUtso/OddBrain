"""The memory manager — the AI does the filing, you only hear about doubts.

Everything that turns something the owner said into a memory goes through here:
the browser addon, the Hermes provider, the "tell me something" box and the
importers all call :func:`capture`.

What happens to each statement:

* **new** -> saved at once, filed under a category, and logged to the change
  feed with a one-tap undo;
* **already known** -> ignored;
* **reverses or contradicts something already saved** -> *never* saved quietly.
  A question is raised ("Your answer changed?") and the old memory stays until
  you answer;
* **the owner themselves sounded unsure** ("maybe", "I guess") -> kept aside
  and offered, not saved.

Without an AI helper running, only plain first-person statements ("I live in
Dhaka") are saved; everything else is kept raw and read properly the next time
a helper is available.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import conflicts, quotes, credentials, topics, vault as vault_mod
from .records import ACTIVE, Record, importance_for
from .review import KEEP_BOTH, TAKE_NEW, TAKE_OLD, CardStore

logger = logging.getLogger(__name__)

AI = "memory_ob (AI)"
OWNER = "owner"
AI_CARD = "ai"

_FIRST_PERSON = re.compile(r"\b(i|i'm|im|i've|ive|i'd|i'll|my|me|we|our|we're)\b", re.I)

_RELATIONS = (
    "sister", "brother", "mother", "mom", "mum", "father", "dad", "wife", "husband",
    "friend", "best friend", "cousin", "uncle", "aunt", "boss", "manager", "teacher",
    "professor", "roommate", "girlfriend", "boyfriend", "partner", "colleague",
    "coworker", "neighbor", "neighbour", "classmate", "mentor", "son", "daughter",
    "grandmother", "grandfather", "grandma", "grandpa", "fiance", "fiancee",
)
_NAME = r"([A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?)"
# "my younger brother Tanvir": a word or two between "my" and the relation.
_REL_MODS = r"(?:(?i:younger|older|elder|little|big|youngest|oldest|old|dear|step|half|twin|favou?rite|close|new)\s+)?"
_RELATION_RE = re.compile(
    r"\b(?i:my|our)\s+" + _REL_MODS + r"((?i:" + "|".join(sorted(_RELATIONS, key=len, reverse=True))
    + r"))\s+(?:(?i:named|called)\s+)?" + _NAME
)
_VERB_RE = re.compile(
    r"\b(?i:met|meet|meeting|told|asked|called|texted|messaged|emailed|talked to|talked with|"
    r"spoke to|spoke with|hung out with|hang out with|lunch with|dinner with|went with|"
    r"agreed with|trained with|train with|study with|studied with|playing with|play with)\s+" + _NAME
)
# "a bakery called Sweet Rise": "called" here gives a name to a thing, it is not a phone call.
_CALLERS = frozenset("i we he she they you who then just also and later earlier".split())


def _is_naming(text: str, m: re.Match[str]) -> bool:
    if not m.group(0).lower().startswith("called"):
        return False
    before = re.findall(r"[A-Za-z']+", text[:m.start()])
    return not before or before[-1].lower() not in _CALLERS


# A name that starts a sentence and is followed by something only a person does.
_SUBJECT_RE = re.compile(
    r"(?:^|[.!?]\s+)" + _NAME
    + r"\s+(?i:lives|works|said|says|told|asked|wants|likes|loves|studies|moved|lost|got|"
    r"called|texted|wrote|thinks|plans|owes|joined|left|started|quit)\b"
)
# Capitalised words that are not people.
_NOT_PEOPLE = frozenset("""
Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April
May June July August September October November December Python Rust Java Javascript
Typescript Linux Windows Android Google Claude Hermes Obsidian Github Dhaka Bangladesh
Chittagong Sylhet Khulna Rajshahi English Bengali Bangla Hindi Arabic University
College School Today Tomorrow Yesterday Brac Docker Excel Word Chrome Firefox Safari
Microsoft Apple Amazon Facebook Instagram Whatsapp Telegram Discord Youtube Twitter
Reddit Netflix Spotify Notion Slack Zoom Gmail Outlook Chatgpt Gemini Mac Ubuntu Debian
""".split())


def blocked_by_guardrails(words: list[str], text: str) -> str:
    """The first "never remember" word or phrase that appears in *text*, else ''.

    Plain words, matched without regard to capitals. Nothing is interpreted as
    a pattern, so whatever the owner types does what it says.
    """
    low = (text or "").lower()
    for word in words:
        w = str(word or "").strip().lower()
        if w and w in low:
            return str(word).strip()
    return ""


class Helper:
    """Wraps an AI-helper call and notes whether it really answered.

    The extractor quietly falls back to simple rules when the helper fails, so
    "a helper was configured" is not the same as "a helper read this". The
    ``worked`` flag is what tells the two apart.
    """

    def __init__(self, call: Any) -> None:
        self.call = call
        self.worked = False

    def __call__(self, prompt: str) -> str:
        out = self.call(prompt)
        self.worked = True
        return out


@dataclass
class Outcome:
    """What a capture did, in plain counts."""

    saved: int = 0
    duplicates: int = 0
    asked: int = 0
    unsure: int = 0
    waiting: int = 0
    blocked: int = 0
    secret: int = 0
    forgotten: int = 0
    forget_unclear: int = 0
    ungrounded: int = 0
    finished: int = 0
    record_ids: list[str] = field(default_factory=list)
    finished_ids: list[str] = field(default_factory=list)
    card_ids: list[str] = field(default_factory=list)
    people: list[str] = field(default_factory=list)
    conversation_id: str | None = None
    read: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "saved": self.saved, "duplicates": self.duplicates, "asked": self.asked,
            "unsure": self.unsure, "waiting": self.waiting, "blocked": self.blocked,
            "secret": self.secret, "forgotten": self.forgotten, "forget_unclear": self.forget_unclear,
            "ungrounded": self.ungrounded, "finished": self.finished,
            "record_ids": self.record_ids, "card_ids": self.card_ids,
            "people": self.people, "conversation_id": self.conversation_id,
            "read": self.read,
        }


# -- people ------------------------------------------------------------------


IGNORED_PEOPLE_FILE = ".brain/not-people.json"


def ignored_people(vault: Path | None) -> set[str]:
    """Names the owner said are not people (so they are not made into profiles again)."""
    if vault is None:
        return set()
    try:
        data = json.loads((Path(vault) / IGNORED_PEOPLE_FILE).read_text(encoding="utf-8"))
        return {str(n).lower() for n in data} if isinstance(data, list) else set()
    except (OSError, ValueError):
        return set()


def _save_ignored(vault: Path, names: set[str]) -> None:
    path = Path(vault) / IGNORED_PEOPLE_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(names)), encoding="utf-8")


def people_in(text: str, hinted: list[str] | None = None, ignore: set[str] | None = None) -> list[tuple[str, str]]:
    """People named in *text* as (name, relation) pairs.

    A name only counts when the sentence makes clear it is a person: "my sister
    Aisha", "met Rahim". Names a model supplied are accepted unless they are
    obviously not people (days, months, places, tools).
    """
    found: dict[str, str] = {}
    for m in _RELATION_RE.finditer(text or ""):
        found.setdefault(m.group(2), m.group(1).lower())
    for m in _VERB_RE.finditer(text or ""):
        if _is_naming(text or "", m):
            continue
        found.setdefault(m.group(1), "")
    for m in _SUBJECT_RE.finditer(text or ""):
        found.setdefault(m.group(1), "")
    for name in hinted or []:
        name = str(name).strip()
        if name and name.split()[0] not in _NOT_PEOPLE:
            found.setdefault(name, "")
    skip = ignore or set()
    return [(n, r) for n, r in found.items()
            if n.split()[0] not in _NOT_PEOPLE and n.lower() not in skip]


# -- the feed ----------------------------------------------------------------


def _snapshot(rec: Record) -> dict[str, Any]:
    data = rec.to_dict()
    data["category"] = topics.category_of(rec.tags, rec.body or rec.title)
    return data


def log_record_change(
    store: Any, *, action: str, before: Record | None, after: Record | None,
    actor: str, reason: str,
) -> None:
    rec = after or before
    assert rec is not None
    store.log_change(
        entity="record", entity_id=rec.id, action=action,
        before=_snapshot(before) if before else None,
        after=_snapshot(after) if after else None,
        actor=actor, reason=reason,
    )


def describe(out: Outcome) -> str:
    """What a capture did, as one plain sentence or two."""

    def things(n: int) -> str:
        return f"{n} thing" if n == 1 else f"{n} things"

    bits: list[str] = []
    if out.saved:
        bits.append(f"Remembered {things(out.saved)}.")
    if out.finished:
        bits.append("Ticked off 1 to-do." if out.finished == 1 else f"Ticked off {out.finished} to-dos.")
    if out.duplicates:
        bits.append(f"Already knew {out.duplicates}.")
    if out.asked:
        bits.append("1 needs your answer." if out.asked == 1 else f"{out.asked} need your answer.")
    if out.unsure:
        bits.append(f"Not sure about {out.unsure}; I kept it aside for you to decide.")
    if out.waiting:
        bits.append(f"{out.waiting} will be read once the AI helper is available.")
    if out.blocked:
        bits.append(f"Skipped {out.blocked} because of your “never remember” list.")
    if out.secret:
        bits.append("I left out what looked like a password, key or card number.")
    if out.ungrounded:
        bits.append(f"Skipped {out.ungrounded} that did not match what you actually said.")
    if out.forgotten:
        bits.append("Forgotten." if out.forgotten == 1 else f"Forgot {out.forgotten} things.")
    if out.forget_unclear:
        bits.append("I could not tell which memory to forget. Search for it and use Forget.")
    return " ".join(bits) or "There was nothing in that to remember."


# -- saving ------------------------------------------------------------------


def _comparable(store: Any, *, moments: bool = False) -> list[Record]:
    """Records a new statement is checked against: the owner's active, shareable ones.

    Lasting facts are compared with lasting facts only; passing moments ("tired
    today") are compared with each other, so a mood never contradicts who you are.
    """
    return [
        r for r in store.list_records(status=ACTIVE, limit=20000)
        if r.speaker == "user" and r.subject == "self" and not r.never_send
        and r.kind not in ("story", "capsule")
        and (topics.MOMENT_TAG in r.tags) == moments
    ]


def _known_threads(store: Any) -> list[str]:
    seen: list[str] = []
    for r in store.list_records(status=ACTIVE, limit=20000):
        for tag in r.tags:
            if str(tag).startswith(topics.THREAD_PREFIX) and tag not in seen:
                seen.append(str(tag))
    return seen


def sign_new(
    store: Any, text: str, *, kind: str = "note", source: dict[str, Any] | None = None,
    actor: str = AI, reason: str = "remembered from what you said",
    card_id: str | None = None, tags: list[str] | None = None,
    people: list[str] | None = None, event_time: str | None = None,
    log: bool = True, category: str | None = None,
) -> Record:
    """Save one statement as a signed memory and log it to the feed.

    *category* is where the librarian filed it; without one, simple rules decide.
    """
    card_id = card_id or (AI_CARD if actor == AI else OWNER)
    category = category if category in topics.CATEGORIES else topics.categorize(text)
    src = dict(source or {})
    if people:
        src["people"] = list(dict.fromkeys([*src.get("people", []), *people]))
    revisit = topics.revisit_date(text)
    if revisit:
        src["revisit_at"] = revisit
    rec = Record.from_payload({
        "kind": kind, "subject": "self", "speaker": "user",
        "title": text[:120], "body": text,
        "tags": topics.with_category(tags, category),
        "importance": importance_for(text, kind),
        "event_time": event_time,
        "source": src,
    })
    store.sign_record(rec, card_id=card_id, changed_by=actor, reason=reason)
    if log:
        log_record_change(store, action="create", before=None, after=rec, actor=actor, reason=reason)
    return rec


def ask_conflict(store: Any, old: Record, text: str, *, source: dict[str, Any] | None = None) -> Any:
    """Raise a "your answer changed?" question. The old memory stays untouched."""
    cards = CardStore(store)
    for pending in cards.list(status="pending", limit=500):
        if pending.type == "diff" and pending.record_id == old.id and (pending.new or {}).get("body") == text:
            return pending
    conversation = (source or {}).get("conversation_id")
    if conversation:
        # One message can disagree with the same old memory in two places
        # ("I moved to X and I no longer live in Y"). That is one question.
        for pending in cards.list(status="pending", limit=500):
            pending_src = (pending.new or {}).get("source") or {}
            if (pending.type == "diff" and pending.record_id == old.id
                    and pending_src.get("conversation_id") == conversation):
                fields = dict(pending.new or {})
                joined = f"{str(fields.get('body', '')).rstrip()} {text}".strip()
                fact_ids = list(pending_src.get("fact_ids") or ([pending_src["fact_id"]] if pending_src.get("fact_id") else []))
                if (source or {}).get("fact_id"):
                    fact_ids.append(source["fact_id"])
                fields.update(title=joined[:120], body=joined,
                              source={**pending_src, "fact_ids": fact_ids})
                pending.new = fields
                return cards._save(pending)
    category = topics.categorize(text)
    new_fields = {
        "title": text[:120], "body": text,
        "tags": topics.with_category(
            [t for t in old.tags if not t.startswith(topics.TAG_PREFIX)], category),
        "source": {**(source or {}), "replaced": old.id},
        "importance": importance_for(text, old.kind),
    }
    old_fields = {
        "title": old.title, "body": old.body, "tags": list(old.tags),
        "source": dict(old.source), "importance": old.importance,
    }
    return cards.propose_diff(
        record_id=old.id, old=old_fields, new=new_fields,
        title="Your answer changed?",
        body="You said this before, and what you just said does not match it.",
    )


def capture(
    store: Any, *, text: str | None = None, parts: list[dict[str, Any]] | None = None,
    source: dict[str, Any] | None = None, model_call: Any | None = None,
    vault: Path | None = None, guardrails: list[str] | None = None,
    actor: str = AI, reason: str = "remembered from what you said",
    log_activity_name: str = "capture",
) -> Outcome:
    """Take in something the owner said and let the AI file it.

    *text* is what the owner wrote. *parts* is a whole labelled conversation
    (``[{"role": "user"|"assistant", "content": ...}]``), in which only the
    owner's words become memories.
    """
    from .extract import extract_claims, extract_session

    source = dict(source or {"origin": "api"})
    out = Outcome()
    # A password said out loud is never stored in readable form: it is swapped
    # for [hidden] before the conversation is saved or read.
    if parts:
        parts, hidden = credentials.redact_parts(parts)
        conv_text = "\n".join(f"{p.get('role', 'user')}: {p.get('content', '')}" for p in parts)
    else:
        conv_text, hidden = credentials.redact(str(text or ""))
    out.secret = hidden
    if not conv_text.strip():
        return out

    helper = Helper(model_call) if model_call is not None else None
    conv_id = store.add_conversation(
        conv_text, origin=str(source.get("origin", "")), session=str(source.get("session", "")),
        speaker="user", parts=parts or [], processed=False,
    )
    out.conversation_id = conv_id
    _run_forget_commands(store, parts, conv_text, out, vault)
    csource = {**source, "conversation_id": conv_id}
    cands = []
    hint = librarian_context(store) if helper is not None else ""
    for c in _extract(conv_text, parts, csource, helper, hint):
        if credentials.HIDDEN in c.text:
            c.text = credentials.drop_hidden(c.text)      # only the part that held the secret is lost
            if not c.text:
                continue
        cands.append(c)
    used = bool(helper and helper.worked)

    _settle_all(store, cands, out, model_used=used, guardrails=guardrails or [],
                actor=actor, reason=reason, conv_id=conv_id, ignore=ignored_people(vault), judge=helper,
                owner_text=_owner_text(parts, conv_text), source_text=conv_text)
    if used or out.waiting == 0:
        store.mark_conversation_processed(conv_id)
    _tidy(store, vault, out)
    store.log_activity(log_activity_name, f"saved {out.saved}, asked {out.asked}", actor=actor)
    return out


def _owner_text(parts: list[dict[str, Any]] | None, conv_text: str) -> str:
    """Only what the owner said: the user's side of a conversation, or the text itself."""
    if parts:
        return "\n".join(str(p.get("content", "")) for p in parts if p.get("role", "user") == "user")
    return conv_text


def _run_forget_commands(
    store: Any, parts: list[dict[str, Any]] | None, text: str, out: Outcome, vault: Path | None,
) -> None:
    """"forget that I like mangoes", said in chat, removes that memory (it goes to the trash)."""
    from .extract import _SENTENCE_RE, forget_target

    owner = ("\n".join(str(p.get("content", "")) for p in parts if p.get("role", "user") == "user")
             if parts else text)
    for sentence in _SENTENCE_RE.split(owner or ""):
        what = forget_target(sentence)
        if not what:
            continue
        target = _memory_matching(store, what)
        if target is None:
            out.forget_unclear += 1
            continue
        forget_record(store, target.id, vault=vault)
        out.forgotten += 1


def _memory_matching(store: Any, what: str) -> Record | None:
    """The one active memory that says *what*, or None when none or several do."""
    wanted = conflicts.read(what).stems
    if not wanted:
        return None
    scored: list[tuple[float, int, Record]] = []
    for rec in store.list_records(status=ACTIVE, limit=20000):
        if rec.speaker != "user" or rec.subject != "self" or rec.never_send:
            continue
        have = conflicts.read(rec.body or rec.title).stems
        shared = len(wanted & have)
        ratio = shared / len(wanted)
        if ratio >= 0.6 and shared >= 1:
            scored.append((ratio, shared, rec))
    if not scored:
        return None
    scored.sort(key=lambda t: (-t[0], -t[1]))
    if len(scored) > 1 and scored[0][:2] == scored[1][:2]:
        return None
    return scored[0][2]


def _chunks(parts: list[dict[str, Any]], limit: int = 12000) -> list[list[dict[str, Any]]]:
    """Split a long conversation into pieces a helper can read in one go."""
    chunks: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    size = 0
    for p in parts:
        n = len(str(p.get("content", "")))
        if current and size + n > limit:
            chunks.append(current)
            current, size = [], 0
        current.append(p)
        size += n
    if current:
        chunks.append(current)
    return chunks


HINT_LIMIT = 1800


def librarian_context(store: Any) -> str:
    """What the owner already has, in a few lines, so the AI files into it instead of inventing.

    The notes (with how many lines each holds), the projects and the people with
    how they are related. Private memories are left out: the AI helper may run
    on someone else's computer, and what is private never leaves this one.
    """
    from collections import Counter

    try:
        mine = [r for r in store.list_records(status=ACTIVE, limit=20000)
                if r.speaker == "user" and r.subject == "self"]
        records = [r for r in mine if not r.never_send]

        def named(rs: list[Record]) -> set[str]:
            return {str(n).lower() for r in rs for n in (r.source or {}).get("people", [])}

        hidden = named([r for r in mine if r.never_send]) - named(records)    # only in private memories
        notes: dict[str, Counter[str]] = {}
        projects: Counter[str] = Counter()
        for r in records:
            project = topics.thread_of_tags(r.tags)
            if project:
                projects[project] += 1
            elif r.kind not in ("journal", "story") and topics.TODO_TAG not in r.tags \
                    and topics.DONE_TAG not in r.tags:
                title = topics.note_of_tags(r.tags)
                if title:
                    notes.setdefault(topics.category_of(r.tags, r.body or r.title), Counter())[title] += 1
        lines: list[str] = []
        for category in topics.CATEGORIES:
            if category in notes:
                lines.append(f"{category}: " + ", ".join(
                    f"{t} ({n})" for t, n in notes[category].most_common(12)))
        if projects:
            lines.append("Projects: " + ", ".join(f"{p} ({n})" for p, n in projects.most_common(12)))
        people = [f"{p['name']} ({p['relation']})" if p.get("relation") else p["name"]
                  for p in store.list_people(limit=40) if p["name"].lower() not in hidden]
        if people:
            lines.append("People: " + ", ".join(people))
        text = "\n".join(lines)
        return text if len(text) <= HINT_LIMIT else text[:HINT_LIMIT].rsplit(",", 1)[0]
    except Exception:  # noqa: BLE001
        logger.warning("could not list the notes for the librarian", exc_info=True)
        return ""


def _speaker(part: dict[str, Any]) -> str:
    """The label the reader sees: "user" for the owner, "other (Rahim)" for another person in a chat."""
    role = str(part.get("role", "user"))
    name = " ".join(str(part.get("name") or "").split())[:60]
    return f"other ({name})" if role != "user" and name else role


def _extract(
    conv_text: str, parts: list[dict[str, Any]] | None, source: dict[str, Any], model_call: Any | None,
    hint: str = "",
) -> list[Any]:
    """Candidate statements from a pasted text or a labelled conversation."""
    from .extract import extract_claims, extract_session

    if parts and model_call is not None:
        found: list[Any] = []
        for chunk in _chunks(parts):
            found.extend(extract_session(
                [(_speaker(p), str(p.get("content", ""))) for p in chunk],
                source={**source, "speaker": "user"}, model_call=model_call, hint=hint,
            ))
        return found
    if parts:
        # No helper: read only the owner's own words, never the assistant's.
        owner = "\n".join(
            str(p.get("content", "")).strip() for p in parts
            if p.get("role", "user") == "user" and str(p.get("content", "")).strip()
        )
        return extract_claims(owner, source={**source, "speaker": "user"}) if owner else []
    return extract_claims(conv_text, source=source, model_call=model_call, hint=hint)


def _settle_all(
    store: Any, cands: list[Any], out: Outcome, *, model_used: bool, guardrails: list[str],
    actor: str, reason: str, conv_id: str | None, ignore: set[str] | None = None,
    judge: Any | None = None, owner_text: str | None = None, source_text: str = "",
) -> None:
    from .extract import evidence_for

    people_seen: list[str] = []
    for c in cands:
        said_unsure = False
        if owner_text is not None:
            found = evidence_for(c.text, owner_text, forward_ok=bool(c.todo))
            if not found.grounded:
                store.log_activity("not-grounded", f"{c.text[:80]} ({found.reason})", actor="memory_ob")
                out.ungrounded += 1
                continue
            said_unsure = found.hedged
            if found.quote:
                c.source = {**c.source, "quote": found.quote,
                            "quote_hash": quotes.hash_quote(found.quote, source_text)}
        blocked = blocked_by_guardrails(guardrails, c.text)
        if blocked:
            store.log_activity("guardrail-block", f"{c.text[:80]} (~ {blocked})", actor="memory_ob")
            out.blocked += 1
            continue
        named = people_in(c.text, c.people if model_used else None, ignore)
        fid = store.add_fact(
            c.text, trust=c.trust, source=c.source,
            meta={"context": c.context, "sentiment": c.sentiment, "people": [n for n, _ in named]},
        )
        for name, relation in named:
            store.upsert_person(name, relation=relation)
            if name not in people_seen:
                people_seen.append(name)
        filing = None
        if model_used and c.filed_by:
            filing = {"category": c.category, "note": c.note, "project": c.project,
                      "todo": c.todo, "moment": c.moment}
        settle_fact(store, fid, c.text, kind=c.kind_hint or "note",
                    source={**c.source, "filed_by": "ai" if filing else "rules"}, out=out,
                    model_used=model_used, people=[n for n, _ in named], actor=actor, reason=reason,
                    judge=judge, filing=filing, hedged=said_unsure)
    out.people = people_seen
    if conv_id and people_seen:
        store.set_conversation_people(conv_id, people_seen)
        store.link_conversation(conv_id)


# -- saying you did it ticks the to-do off ------------------------------------------------

_DID_RE = re.compile(
    r"^\W*(?:i|we)(?:'ve|\s+have|\s+had)?\s+(?:(?:just|already|finally|also|then|now)\s+)*([a-z]+)\s+(.+)$", re.I)
_IRREGULAR = {
    "did": "do", "done": "do", "paid": "pay", "bought": "buy", "sent": "send", "got": "get", "made": "make",
    "wrote": "write", "written": "write", "took": "take", "taken": "take", "gave": "give", "given": "give",
    "went": "go", "saw": "see", "met": "meet", "found": "find", "told": "tell", "brought": "bring",
    "held": "hold", "kept": "keep", "left": "leave", "ran": "run", "read": "read", "put": "put", "set": "set",
}
_NOT_PAST = frozenset("need indeed proceed succeed exceed feed speed bleed breed".split())
# Finishing words fit any to-do about the same thing; other verbs must be the same verb.
_FINISHING = frozenset("finish complete do handle sort clear wrap".split())
_TODO_NOISE = frozenset("need must should gotta remind forget todo".split())


def _lemma(verb: str) -> str:
    v = verb.lower()
    if v in _IRREGULAR:
        return _IRREGULAR[v]
    if v.endswith("ied") and len(v) > 4:
        return v[:-3] + "y"
    if v.endswith("ed") and len(v) > 4:
        v = v[:-2]
        if len(v) > 3 and v[-1] == v[-2] and v[-1] not in "lsz":
            v = v[:-1]
    return v


def _same_verb(lemma: str, word: str) -> bool:
    w = conflicts.stem(word)
    a, b = lemma.rstrip("e"), w.rstrip("e")
    return len(a) >= 3 and len(b) >= 3 and (a == b or a.startswith(b) or b.startswith(a))


def _finish_todo(store: Any, text: str, *, actor: str = AI) -> Record | None:
    """The one open to-do that *text* says is now done, ticked off. None when unsure.

    Only a plain first-person "I submitted / paid / finished ..." counts. A negation, a wish
    or a plan never does, and when two to-dos could match nothing is touched (it is then
    saved as an ordinary memory).
    """
    low = (text or "").replace("\u2019", "'").strip()
    m = _DID_RE.match(low)
    if not m or topics.is_todo(low) or conflicts.is_hedged(low):
        return None
    verb = m.group(1).lower()
    past = verb in _IRREGULAR or (verb.endswith("ed") and len(verb) > 4 and verb not in _NOT_PAST)
    if not past or any(w in conflicts._NEGATORS for w in conflicts._WORD_RE.findall(conflicts._normalise(low))):
        return None
    lemma = _lemma(verb)
    objects = {conflicts.stem(w) for w in conflicts._WORD_RE.findall(conflicts._normalise(m.group(2)))
               if w not in conflicts._STOP and not any(ch.isdigit() for ch in w) and len(w) > 2}
    if not objects:
        return None
    best: list[tuple[float, Record]] = []
    for rec in store.list_records(status=ACTIVE, limit=20000):
        if topics.TODO_TAG not in rec.tags or topics.DONE_TAG in rec.tags or rec.never_send:
            continue
        words = conflicts._WORD_RE.findall(conflicts._normalise(_text_of_record(rec)))
        stems = {conflicts.stem(w) for w in words if w not in conflicts._STOP and w not in _TODO_NOISE}
        if lemma not in _FINISHING and not any(_same_verb(lemma, w) for w in words):
            continue
        shared = len(objects & stems) / len(objects)
        if shared >= 0.6:
            best.append((shared, rec))
    if len(best) != 1:
        return None
    return mark_done(store, best[0][1].id, done=True, vault=None, actor=actor,
                     reason="you said you did it")


def _text_of_record(rec: Record) -> str:
    return rec.body or rec.title or ""


def settle_fact(
    store: Any, fact_id: str, text: str, *, kind: str, source: dict[str, Any], out: Outcome,
    model_used: bool, people: list[str], actor: str = AI,
    reason: str = "remembered from what you said", force: bool = False,
    log: bool = True, judge: Any | None = None, filing: dict[str, Any] | None = None,
    hedged: bool = False,
) -> str:
    """Decide what happens to one statement. Returns what was done.

    *filing* is where the AI librarian put it (category, note, project, to-do,
    passing moment). Whatever it did not say is decided by simple rules.

    One of ``saved``, ``duplicate``, ``asked``, ``unsure``, ``waiting``.
    ``force`` is the owner saying "yes, remember this" to something the AI was
    unsure about: the unsure check is skipped, the conflict check is not.

    The fact's own status says where it went: ``promoted`` (saved), ``duplicate``,
    ``asked`` (a question is waiting), ``unsure`` (the owner sounded unsure) or
    ``waiting`` (to be read when an AI helper is available).
    """
    if not force and (hedged or conflicts.is_hedged(text)):
        # `hedged`: the owner's own words sounded unsure even if the AI's wording does not.
        store.set_fact_status(fact_id, "unsure")
        out.unsure += 1
        return "unsure"
    if (not force and not model_used and not _FIRST_PERSON.search(text)
            and not topics.thread_of(text, _known_threads(store))):
        # Not said in the first person and not about one of your projects: read it later.
        store.set_fact_status(fact_id, "waiting")
        out.waiting += 1
        return "waiting"

    filing = filing or {}
    moment = filing.get("moment")
    if moment is None:
        moment = topics.is_moment(text)
    if not moment and not force and log and not filing.get("todo"):
        closed = _finish_todo(store, text, actor=actor)
        if closed is not None:
            # "I submitted my thesis proposal" ticks off "I need to submit my thesis proposal".
            store.set_fact_status(fact_id, "duplicate")
            out.finished += 1
            out.finished_ids.append(closed.id)
            return "finished"
    if moment:
        # A passing moment is kept, dated, in the Journal. It is only checked for repeats.
        found = conflicts.find(text, _comparable(store, moments=True))
        if found is not None and found[0] != conflicts.DUPLICATE:
            found = None
    else:
        found = conflicts.find(text, _comparable(store), judge)
    if found is not None:
        verdict, existing = found
        if verdict == conflicts.DUPLICATE:
            store.set_fact_status(fact_id, "duplicate")
            out.duplicates += 1
            return "duplicate"
        card = ask_conflict(store, existing, text, source={**source, "fact_id": fact_id})
        store.set_fact_status(fact_id, "asked")
        if card.id not in out.card_ids:       # a second clause joins the same question
            out.asked += 1
            out.card_ids.append(card.id)
        return "asked"

    extra: list[str] = []
    event_time = None
    if moment:
        kind = "journal"
        extra.append(topics.MOMENT_TAG)
        event_time = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    else:
        kind = kind if kind in ("profile", "note", "learning") else "note"
        todo = filing.get("todo")
        if todo is None:
            todo = topics.is_todo(text)
        if todo:
            extra.append(topics.TODO_TAG)
        known = _known_threads(store)
        if filing.get("project"):
            slug = topics.thread_slug(filing["project"])
            same = next((t for t in known if t[len(topics.THREAD_PREFIX):] == slug), "")
            thread = topics.thread_title(same) if same else filing["project"]
        else:
            thread = topics.thread_of(text, known)
        if thread:
            extra.append(topics.thread_tag(thread))
        elif filing.get("note") and not todo:
            extra.append(topics.note_tag(filing["note"]))
    rec = sign_new(
        store, text, kind=kind, tags=extra, event_time=event_time,
        source={**source, "fact_id": fact_id}, people=people, actor=actor, reason=reason,
        log=log, category=filing.get("category") or None,
    )
    store.set_fact_status(fact_id, "promoted")
    out.saved += 1
    out.record_ids.append(rec.id)
    return "saved"


def keep_unsure(store: Any, fact_id: str, *, vault: Path | None = None) -> dict[str, Any]:
    """The owner says an unsure statement is true. It is saved (conflicts still ask)."""
    fact = store.get_fact(fact_id)
    if fact is None or fact["status"] != "unsure":
        return {"result": "gone"}
    out = Outcome()
    from .extract import kind_hint_for

    people = [n for n, _ in people_in(fact["text"])]
    verdict = settle_fact(
        store, fact_id, fact["text"], kind=kind_hint_for(fact["text"]),
        source=fact.get("source") or {}, out=out, model_used=True, people=people,
        actor=OWNER, reason="you said yes", force=True,
    )
    _tidy(store, vault, out)
    return {"result": verdict, **out.to_dict()}


def skip_unsure(store: Any, fact_id: str) -> dict[str, Any]:
    fact = store.get_fact(fact_id)
    if fact is None or fact["status"] != "unsure":
        return {"result": "gone"}
    store.set_fact_status(fact_id, "rejected")
    return {"result": "skipped"}


def process_waiting(
    store: Any, *, model_call: Any | None, vault: Path | None = None,
    guardrails: list[str] | None = None, limit: int = 20,
) -> Outcome:
    """Read the conversations that were saved while no AI helper was running.

    Their earlier, partial reading is set aside and the whole conversation is
    read again properly. Statements already saved the first time are found as
    duplicates and skipped, so nothing is saved twice.
    """
    out = Outcome()
    if model_call is None:
        return out
    for conv in store.unprocessed_conversations(limit=limit):
        helper = Helper(model_call)
        parts = conv.get("parts") or None
        source = {"origin": conv.get("origin") or "api", "session": conv.get("session") or "",
                  "conversation_id": conv["id"]}
        cands = _extract(conv["text"], parts, source, helper, librarian_context(store))
        if not helper.worked:
            break  # the helper is not answering; try again later, change nothing
        for fact in store.list_facts(status="waiting", limit=5000):
            if (fact.get("source") or {}).get("conversation_id") == conv["id"]:
                store.set_fact_status(fact["id"], "reprocessed")
        _settle_all(store, cands, out, model_used=True, guardrails=guardrails or [],
                    actor=AI, reason="read once the AI helper was available", conv_id=conv["id"],
                    ignore=ignored_people(vault), judge=helper,
                    owner_text=_owner_text(parts, conv["text"]), source_text=conv["text"])
        store.mark_conversation_processed(conv["id"])
        out.read += 1
    if out.saved or out.asked or out.unsure:
        store.log_activity("process-waiting", f"saved {out.saved}, asked {out.asked}", actor=AI)
    _tidy(store, vault, out)
    return out


# -- after any change -----------------------------------------------------------


def _tidy(store: Any, vault: Path | None, out: Outcome | None = None, *, record_ids: list[str] | None = None) -> None:
    """Keep the notes in the vault up to date. Never lets a file error block memory."""
    if vault is None:
        return
    try:
        ids = record_ids if record_ids is not None else ((out.record_ids + out.finished_ids) if out else [])
        vault_mod.ensure_layout(vault)
        idx = vault_mod._load_index(vault)  # noqa: SLF001
        dirty: set[str] = set()
        cache: dict[str, Any] = {}
        names = set(out.people) if out else set()
        for rid in ids:
            rec = store.get_record(rid)
            if rec is not None:
                vault_mod.write_record(store, vault, rec, index=idx, dirty=dirty, cache=cache)
                names.update(vault_mod._record_people(rec))  # noqa: SLF001
        vault_mod._save_index(vault, idx)  # noqa: SLF001
        # People first, so a line links to a person who already has a note.
        for name in names:
            person = store.find_person(name)
            if person:
                vault_mod.write_person(store, vault, person)
        idx = vault_mod._load_index(vault)  # noqa: SLF001
        vault_mod.render_notes(store, vault, dirty, idx, cache=cache)
        vault_mod._save_index(vault, idx)  # noqa: SLF001
        if out and out.conversation_id:
            conv = store.get_conversation(out.conversation_id)
            if conv:
                vault_mod.write_conversation(vault, conv, store.private_phrases())
        from . import biography

        vault_mod.write_summary_notes(store, vault, biography=biography.load(vault)["text"] or None)
    except Exception:  # noqa: BLE001
        logger.warning("could not update the vault notes", exc_info=True)


def refresh_vault(store: Any, vault: Path | None, record_ids: list[str] | None = None) -> None:
    """Public: rewrite the notes for some records."""
    _tidy(store, vault, None, record_ids=record_ids or [])


# -- answering a question ------------------------------------------------------


def answer_conflict(
    store: Any, card_id: str, answer: str, *, vault: Path | None = None
) -> dict[str, Any]:
    """The owner's answer to "your answer changed?".

    ``new``: the new statement replaces the old one. ``old``: nothing changes.
    ``both``: both stay (for things that are both true, like two hobbies).
    """
    actions = {"new": TAKE_NEW, "old": TAKE_OLD, "both": KEEP_BOTH}
    if answer not in actions:
        raise ValueError("answer must be new, old or both")
    cards = CardStore(store)
    card = cards.get(card_id)
    if card is None or card.status != "pending":
        return {"result": "gone"}
    before = store.get_record(card.record_id) if card.record_id else None
    resolved = cards.resolve(card_id, actions[answer], by=OWNER)
    touched: list[str] = []
    after = store.get_record(card.record_id) if card.record_id else None
    card_src = (card.new or {}).get("source") or {}
    fact_ids = list(card_src.get("fact_ids") or ([card_src["fact_id"]] if card_src.get("fact_id") else []))
    if answer == "new" and before is not None and after is not None:
        log_record_change(store, action="update", before=before, after=after, actor=OWNER,
                          reason="you said the new answer is right")
        touched.append(after.id)
    elif answer == "both":
        new_rec = _find_by_card(store, card_id)
        if new_rec is not None:
            log_record_change(store, action="create", before=None, after=new_rec, actor=OWNER,
                              reason="you said both are true")
            touched.append(new_rec.id)
            if vault is not None and card.record_id:
                from . import audit

                audit.pair_answered(vault, card.record_id, new_rec.id)      # the check-up must not ask again
    elif answer == "old":
        store.log_change(entity="doubt", entity_id=card_id, action="keep_old", before=None,
                         after={"text": (card.new or {}).get("body", "")}, actor=OWNER,
                         reason="you said the old answer is right")
    for fact_id in fact_ids:
        store.set_fact_status(fact_id, "rejected" if answer == "old" else "promoted")
    _tidy(store, vault, None, record_ids=touched)
    return {"result": "ok", "answer": answer, "resolved": resolved is not None}


def _find_by_card(store: Any, card_id: str) -> Record | None:
    for rec in store.list_records(status=ACTIVE, limit=2000):
        if (rec.confirmed_by or "").startswith(f"{card_id}@"):
            return rec
    return None


# -- owner edits ----------------------------------------------------------------


def edit_record(
    store: Any, record_id: str, *, body: str | None = None, category: str | None = None,
    note: str | None = None, vault: Path | None = None,
) -> Record | None:
    """The owner edits a memory's text, moves it to another category, or files it in another note."""
    rec = store.get_record(record_id)
    if rec is None:
        return None
    before = Record.from_dict(rec.to_dict())
    if body is not None:
        body, _ = credentials.redact(body)       # a password typed into an edit is hidden too
    if body is not None and body.strip():
        rec.body = body.strip()
        rec.title = rec.body[:120]
    cat = category if category in topics.CATEGORIES else topics.category_of(rec.tags, rec.body)
    if category in topics.CATEGORIES or body is not None:
        rec.tags = topics.with_category(
            [t for t in rec.tags if not t.startswith(topics.TAG_PREFIX)], cat
        )
    if category in topics.CATEGORIES and category != topics.category_of(before.tags, before.body):
        # Choosing a category yourself takes the note out of its project folder.
        rec.tags = [t for t in rec.tags if not str(t).startswith((topics.THREAD_PREFIX, topics.NOTE_PREFIX))]
    if note is not None:
        rec.tags = [t for t in rec.tags if not str(t).startswith(topics.NOTE_PREFIX)]
        if note.strip() and note.strip().lower() != topics.category_of(rec.tags, rec.body).lower():
            rec.tags.append(topics.note_tag(vault_mod.note_name(note, fallback="Note")))
    revisit = topics.revisit_date(rec.body)
    if revisit:
        rec.source = {**rec.source, "revisit_at": revisit}
    saved = store.sign_record(rec, card_id=OWNER, changed_by=OWNER, reason="you edited it")
    log_record_change(store, action="update", before=before, after=saved, actor=OWNER,
                      reason="you edited it")
    _tidy(store, vault, None, record_ids=[record_id])
    return saved


def mark_done(store: Any, record_id: str, *, done: bool = True, vault: Path | None = None,
              actor: str = OWNER, reason: str | None = None) -> Record | None:
    """Tick a to-do off (or put it back). Logged, so Undo works.

    *actor* is the owner for a tick in the app; the AI when the owner said in their own
    words that they did it ("I submitted my thesis proposal").
    """
    rec = store.get_record(record_id)
    if rec is None:
        return None
    before = Record.from_dict(rec.to_dict())
    rec.tags = [t for t in rec.tags if t not in (topics.TODO_TAG, topics.DONE_TAG)]
    rec.tags.append(topics.DONE_TAG if done else topics.TODO_TAG)
    why = reason or ("you ticked it off" if done else "you put it back on the list")
    saved = store.sign_record(rec, card_id=AI_CARD if actor == AI else OWNER, changed_by=actor, reason=why)
    log_record_change(store, action="update", before=before, after=saved, actor=actor, reason=why)
    _tidy(store, vault, None, record_ids=[record_id])
    return saved


def reminders(store: Any, *, today: str | None = None, limit: int = 6) -> list[dict[str, str]]:
    """What the owner still has to do, and what they said they would come back to.

    Open to-dos (not ticked off) and anything whose revisit day has arrived.
    Private and hazardous memories never appear. Used by the AI helper's
    start-of-session note and nowhere else that could leak.
    """
    from .exit import keep

    day = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out: list[dict[str, str]] = []
    for rec in store.list_records(status="active", limit=10000):
        if not keep(rec):
            continue
        text = (rec.body or rec.title or "").strip().replace("\n", " ")
        if not text:
            continue
        revisit = topics.revisit_of(rec.source)
        if topics.DONE_TAG in rec.tags:
            continue
        if revisit and revisit <= day:
            out.append({"kind": "revisit", "due": revisit, "text": text[:160]})
        elif topics.TODO_TAG in rec.tags:
            out.append({"kind": "todo", "due": revisit or "", "text": text[:160]})
    out.sort(key=lambda r: (r["kind"] != "revisit", r["due"] or "9999", r["text"]))
    return out[:limit]


def _refresh_conversation_notes(store: Any, vault: Path | None, rec: Record) -> None:
    """Rewrite the saved-conversation notes that quote *rec*, so a private sentence is blanked
    (or shown again) there too."""
    from .exit import mask

    if vault is None:
        return
    words = [w for w in (rec.body, rec.title, (rec.source or {}).get("quote")) if w]
    hide = store.private_phrases()
    for row in store.list_conversations(limit=100000):
        if mask(row["text"], words) == row["text"]:
            continue                                  # does not quote it
        conv = store.get_conversation(row["id"])
        if conv:
            try:
                vault_mod.write_conversation(vault, conv, hide)
            except Exception:  # noqa: BLE001
                logger.warning("could not update a conversation note", exc_info=True)


def make_private(store: Any, record_id: str, *, vault: Path | None = None) -> bool:
    """Hide one memory from every screen and every AI. It stays in the database.

    The sentence is also blanked inside the saved conversations it came from.
    """
    rec = store.set_never_send(record_id, value=True, changed_by=OWNER, reason="you made it private")
    if rec is None:
        return False
    store.delete_embedding(record_id)          # its meaning-search numbers go too; they come back if it is brought back
    store.log_activity("made-private", f"record {record_id}", actor=OWNER)
    _tidy(store, vault, None, record_ids=[record_id])
    _refresh_conversation_notes(store, vault, rec)
    return True


def bring_back(store: Any, record_id: str, *, vault: Path | None = None) -> bool:
    """Make a private memory visible again."""
    rec = store.set_never_send(record_id, value=False, changed_by=OWNER, reason="you brought it back")
    if rec is None:
        return False
    store.log_activity("brought-back", f"record {record_id}", actor=OWNER)
    _tidy(store, vault, None, record_ids=[record_id])
    _refresh_conversation_notes(store, vault, rec)
    return True


def forget_record(store: Any, record_id: str, *, vault: Path | None = None) -> Record | None:
    """Remove a memory from use. It goes to the trash; nothing is destroyed."""
    rec = store.get_record(record_id)
    if rec is None:
        return None
    before = Record.from_dict(rec.to_dict())
    trashed = store.trash(record_id, reason="the owner removed it", by=OWNER)
    log_record_change(store, action="remove", before=before, after=trashed, actor=OWNER,
                      reason="you removed it")
    _tidy(store, vault, None, record_ids=[record_id])
    return trashed


def add_journal_entry(
    store: Any, text: str, *, day: str | None = None, vault: Path | None = None
) -> Record:
    """The owner writes a dated journal entry. Signed as theirs."""
    text, _ = credentials.redact(text)
    rec = sign_new(
        store, text.strip(), kind="journal", source={"origin": "journal"},
        actor=OWNER, reason="you wrote it", card_id=OWNER, event_time=day,
        tags=None,
    )
    _tidy(store, vault, None, record_ids=[rec.id])
    return rec


# -- people ---------------------------------------------------------------------


def merge_people(store: Any, keep_id: str, other_id: str, *, vault: Path | None = None) -> dict[str, Any] | None:
    """The owner says two profiles are the same person."""
    info = store.merge_people(keep_id, other_id)
    if info is None:
        return None
    store.log_change(
        entity="person", entity_id=keep_id, action="merge", before=info, after=info["keep_after"],
        actor=OWNER, reason="you said they are the same person",
    )
    if vault is not None:
        try:
            vault_mod.write_person(store, vault, info["keep_after"])
            _remove_person_note(vault, other_id)
        except Exception:  # noqa: BLE001
            logger.warning("could not update person notes", exc_info=True)
    return info


def _remove_person_note(vault: Path, person_id: str) -> None:
    idx = vault_mod._load_index(vault)  # noqa: SLF001
    rel = idx.pop(f"person:{person_id}", None)
    if rel:
        vault_mod._remove(Path(vault) / rel)  # noqa: SLF001
        vault_mod._save_index(vault, idx)  # noqa: SLF001


def update_person(
    store: Any, person_id: str, *, vault: Path | None = None, **fields: Any
) -> dict[str, Any] | None:
    before = store.get_person(person_id)
    if isinstance(fields.get("notes"), str):
        fields["notes"], _ = credentials.redact(fields["notes"])
    after = store.update_person(person_id, **fields)
    if before is None or after is None:
        return None
    if before != after:
        store.log_change(entity="person", entity_id=person_id, action="update", before=before,
                         after=after, actor=OWNER, reason="you edited the profile")
    if vault is not None:
        try:
            vault_mod.write_person(store, vault, after)
        except Exception:  # noqa: BLE001
            logger.warning("could not update person note", exc_info=True)
    return after


def add_person(
    store: Any, name: str, *, relation: str = "", notes: str = "", vault: Path | None = None,
) -> dict[str, Any]:
    """The owner adds a person by hand."""
    existing = store.find_person(name)
    if existing is not None:
        return existing
    person = store.upsert_person(name, relation=relation, notes=notes)
    store.log_change(entity="person", entity_id=person["id"], action="create", before=None, after=person,
                     actor=OWNER, reason="you added the profile")
    if vault is not None:
        _save_ignored(vault, ignored_people(vault) - {name.lower()})
        try:
            vault_mod.write_person(store, vault, person)
        except Exception:  # noqa: BLE001
            logger.warning("could not write person note", exc_info=True)
    return person


def delete_person(
    store: Any, person_id: str, *, vault: Path | None = None, chats: bool = False,
) -> dict[str, Any] | None:
    """Remove a profile the owner says is wrong. The name is not made into a profile again.

    With ``chats=True`` the saved conversations that were only with this person
    go too (a group chat with others is kept). They are kept in the change log,
    so Undo brings them back with the profile.
    """
    names = set()
    person = store.get_person(person_id)
    if person is None:
        return None
    names = {person["name"].lower(), *(a.lower() for a in person["aliases"])}
    removed_chats: list[dict[str, Any]] = []
    if chats:
        for conv in store.person_conversations(person):
            full = store.get_conversation(conv["id"])
            involved = {str(p).lower() for p in (full or {}).get("people", [])}
            if full and involved and involved <= names:
                saved = store.delete_conversation(conv["id"])
                if saved:
                    removed_chats.append(saved)
    person = store.delete_person(person_id)
    if person is None:
        return None
    before = {**person, "conversations": removed_chats} if removed_chats else person
    store.log_change(entity="person", entity_id=person_id, action="remove", before=before, after=None,
                     actor=OWNER, reason="you removed the profile" + (" and your chats with them" if chats else ""))
    if vault is not None:
        try:
            _save_ignored(vault, ignored_people(vault) | names)
            _remove_person_note(vault, person_id)
            for saved in removed_chats:
                vault_mod._remove(Path(vault) / "Sources" / "Conversations"  # noqa: SLF001
                                  / f"{vault_mod.conversation_note_stem(saved)}.md")
        except Exception:  # noqa: BLE001
            logger.warning("could not update person notes", exc_info=True)
    return {**person, "chats_removed": len(removed_chats)}


def suggest_same_person(store: Any) -> int:
    """Ask whether two profiles are the same person. The AI never merges them itself.

    Two profiles are suggested when one name is the first word of the other
    ("Rahim" and "Rahim Uddin"). The owner answers yes or no; "no" is remembered.
    Returns how many new questions were raised.
    """
    import json

    people = store.list_people(limit=10000)
    asked = {
        (c["context"] or "") for c in
        store.list_confirmations(status="pending", limit=500) + store.list_confirmations(status="answered", limit=2000)
    }
    raised = 0
    for i, a in enumerate(people):
        for b in people[i + 1:]:
            na, nb = a["name"].lower().split(), b["name"].lower().split()
            if not na or not nb or na == nb:
                continue
            short, long_ = (na, nb) if len(na) < len(nb) else (nb, na)
            if len(short) == 1 and long_[0] == short[0] and len(long_) > 1:
                ctx = json.dumps({"kind": "same_person", "ids": sorted([a["id"], b["id"]])})
                if ctx in asked:
                    continue
                store.ask_confirmation(
                    question=f"Are {a['name']} and {b['name']} the same person?", context=ctx,
                    created_by="memory_ob",
                )
                raised += 1
    return raised


def answer_confirmation(
    store: Any, cid: str, answer: str, *, vault: Path | None = None
) -> dict[str, Any] | None:
    """Answer a yes/no question. "Yes" to a same-person question merges them."""
    import json

    conf = store.get_confirmation(cid)
    if conf is None:
        return None
    conf = store.answer_confirmation(cid, answer=answer, by=OWNER) or conf
    merged = None
    if answer == "yes":
        try:
            ctx = json.loads(conf["context"] or "{}")
        except ValueError:
            ctx = {}
        if ctx.get("kind") == "same_person" and len(ctx.get("ids", [])) == 2:
            first, second = ctx["ids"]
            # Keep the profile with the longer name.
            a, b = store.get_person(first), store.get_person(second)
            if a and b:
                keep, other = (a, b) if len(a["name"]) >= len(b["name"]) else (b, a)
                merged = merge_people(store, keep["id"], other["id"], vault=vault)
    return {"confirmation": conf, "merged": merged is not None}


# -- undo -------------------------------------------------------------------------


def undo(store: Any, seq: int, *, vault: Path | None = None) -> dict[str, Any]:
    """Put back what one logged change did. Returns what happened."""
    change = store.get_change(seq)
    if change is None:
        raise LookupError("no such change")
    if change.get("undone_at"):
        return {"result": "already"}
    entity, action = change["entity"], change["action"]
    touched: list[str] = []
    result = "undone"
    if store.has_later_change(change["entity_id"], seq):
        return {"result": "changed_since", "seq": seq}

    if entity == "record":
        rid = change["entity_id"]
        rec = store.get_record(rid)
        if rec is None:
            result = "gone"
        elif action == "create":
            store.trash(rid, reason=f"undone (change {seq})", by=OWNER)
            touched.append(rid)
        elif action in ("update", "remove"):
            before = change["before"] or {}
            restored = Record.from_dict({**rec.to_dict(), **before})
            store.sign_record(restored, card_id=f"undo-{seq}", changed_by=OWNER, reason=f"undo change {seq}")
            touched.append(rid)
    elif entity == "person":
        if action == "merge":
            store.restore_merged_people(change["before"])
            if vault is not None:
                try:
                    for key in ("keep_before", "other_before"):
                        vault_mod.write_person(store, vault, change["before"][key])
                except Exception:  # noqa: BLE001
                    logger.warning("could not update person notes", exc_info=True)
        elif action == "update":
            b = change["before"]
            store.update_person(change["entity_id"], name=b["name"], aliases=b["aliases"],
                                relation=b["relation"], notes=b["notes"])
        elif action == "remove":
            store.restore_person(change["before"])
            for saved in change["before"].get("conversations", []):
                store.restore_conversation(saved)
                if vault is not None:
                    conv = store.get_conversation(saved["id"])
                    if conv:
                        vault_mod.write_conversation(vault, conv, store.private_phrases())
            if vault is not None:
                try:
                    vault_mod.write_person(store, vault, change["before"])
                    names = ignored_people(vault) - {change["before"]["name"].lower()}
                    _save_ignored(vault, names)
                except Exception:  # noqa: BLE001
                    logger.warning("could not update person notes", exc_info=True)
        elif action == "create":
            store.delete_person(change["entity_id"])
            if vault is not None:
                _remove_person_note(vault, change["entity_id"])
    elif entity == "import":
        for rid in change["after"].get("record_ids", []):
            if store.get_record(rid) is not None:
                store.trash(rid, reason=f"import undone (change {seq})", by=OWNER)
                touched.append(rid)
        imported = set(change["after"].get("conversation_ids", []))
        if imported:
            # Memories the AI read out of those chats later on go with them, unless you changed them since.
            for rec in store.list_records(status=ACTIVE, limit=20000):
                if ((rec.source or {}).get("conversation_id") in imported
                        and str(rec.confirmed_by or "").startswith("ai@") and rec.id not in touched):
                    store.trash(rec.id, reason=f"import undone (change {seq})", by=OWNER)
                    touched.append(rec.id)
        for cid in change["after"].get("conversation_ids", []):
            saved = store.delete_conversation(cid)
            if saved and vault is not None:
                vault_mod._remove(Path(vault) / "Sources" / "Conversations"  # noqa: SLF001
                                  / f"{vault_mod.conversation_note_stem(saved)}.md")
        for name in change["after"].get("people_created", []):
            person = store.find_person(name)
            if person and not store.person_conversations(person):
                store.delete_person(person["id"])
                if vault is not None:
                    _remove_person_note(vault, person["id"])
    elif entity == "doubt":
        result = "cannot"  # keeping the old answer changed nothing, so there is nothing to put back
    else:
        result = "cannot"

    if result == "undone":
        store.mark_change_undone(seq)
        store.log_activity("undo", f"change {seq}", actor=OWNER)
    _tidy(store, vault, None, record_ids=touched)
    return {"result": result, "seq": seq}


# -- bringing things in from elsewhere ---------------------------------------------


def import_notes(
    store: Any, notes: list[str], *, source_name: str, vault: Path | None = None,
    guardrails: list[str] | None = None,
) -> dict[str, Any]:
    """Memories the owner brought in on purpose (a memory file, pasted notes).

    They are the owner's own statements, so each one is kept as written. The
    same safety checks apply as anywhere else: anything that looks like a
    password, key or card number is skipped, "never remember" words are
    respected, repeats are ignored, and anything that contradicts what is
    already saved becomes a question instead of being saved over it.
    """
    from . import hazards

    out = Outcome()
    skipped = 0
    for text in notes:
        if (hazards.is_hazardous(text) or credentials.has_secret(text)
                or blocked_by_guardrails(guardrails or [], text)):
            skipped += 1
            continue
        fid = store.add_fact(text, trust=0.5, source={"origin": "import", "file": source_name})
        settle_fact(store, fid, text, kind="note", source={"origin": "import", "file": source_name},
                    out=out, model_used=True, people=[n for n, _ in people_in(text)],
                    actor=OWNER, reason=f"imported from {source_name}", force=True, log=False)
    summary = {"count": out.saved, "source": source_name, "record_ids": out.record_ids}
    if out.saved:
        store.log_change(entity="import", entity_id=f"import-{out.record_ids[0]}", action="create",
                         before=None, after=summary, actor=OWNER,
                         reason=f"you imported {source_name}")
    store.log_activity("import", f"{out.saved} saved, {out.duplicates} already known, "
                       f"{out.asked} asked, {skipped} skipped", actor=OWNER)
    _tidy(store, vault, out)
    return {**out.to_dict(), "skipped": skipped, "source": source_name}


def store_chats(
    store: Any, chats: list[dict[str, Any]], *, source_name: str, vault: Path | None = None,
) -> dict[str, Any]:
    """Keep whole conversations exactly as they were, to be read when a helper is free.

    Nothing is guessed about them here. Each conversation is saved raw, the
    people in it get a profile linked to it, and the AI reads it later.
    """
    kept = 0
    already = 0
    people_all: list[str] = []
    new_conversations: list[str] = []
    new_people: list[str] = []
    for chat in chats:
        parts, _ = credentials.redact_parts(chat["parts"])
        # In a group chat each person is named, so "who said what" survives in the saved text.
        text = "\n".join(f"{p.get('name') or p['role']}: {p['content']}" for p in parts)
        names = [str(n) for n in chat.get("people", [])]
        origin, title = str(chat.get("origin", "")), str(chat.get("title", ""))
        if store.has_conversation(text, origin=origin, session=title):
            already += 1                      # importing the same export again adds nothing
            continue
        cid = store.add_conversation(
            text, origin=str(chat.get("origin", "")), session=str(chat.get("title", "")),
            speaker="user", parts=parts, people=names, processed=False,
        )
        for name in names:
            if store.find_person(name) is None and name not in new_people:
                new_people.append(name)
            store.upsert_person(name)
            if name not in people_all:
                people_all.append(name)
        if names:
            store.link_conversation(cid)
        new_conversations.append(cid)
        kept += 1
        if vault is not None:
            try:
                conv = store.get_conversation(cid)
                if conv:
                    vault_mod.write_conversation(vault, conv, store.private_phrases())
            except Exception:  # noqa: BLE001
                logger.warning("could not write conversation note", exc_info=True)
    store.log_activity("import-chats", f"{kept} conversation(s) from {source_name}", actor=OWNER)
    if new_conversations:
        store.log_change(
            entity="import", entity_id=f"import-{new_conversations[0]}", action="create", before=None,
            after={"count": kept, "unit": "conversations", "source": source_name, "record_ids": [],
                   "conversation_ids": new_conversations, "people_created": new_people},
            actor=OWNER, reason=f"you imported {source_name}")
    if vault is not None:
        for name in people_all:
            person = store.find_person(name)
            if person:
                try:
                    vault_mod.write_person(store, vault, person)
                except Exception:  # noqa: BLE001
                    logger.warning("could not write person note", exc_info=True)
    return {"conversations": kept, "already": already, "people": people_all, "source": source_name}
