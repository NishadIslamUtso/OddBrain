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
        r"lift(?:ing|s|ed)?|weights?|bench press|squats?|deadlift\w*|"
        r"anxiety|depress\w*|dentist|clinic|vaccin\w*|yoga|cardio|push-?ups?|marathon|stretch\w*)\b|"
        r"\b(?:run|ran|running|jog\w*|walk\w*|cycl\w*|swim\w*)\b[^.!?]{0,20}"
        r"\b\d+(?:\.\d+)?\s?(?:km|kms|k|miles?|laps?|minutes?|mins?)\b", re.I)),
    (LIFE, re.compile(
        r"\b(?:i (?:live|stay|grew up|was born|am from|come from|moved)\b|my name is|my birthday|"
        r"i(?:'m| am) \d+ years old|i(?:'m| am) from)", re.I)),
    (MONEY, re.compile(
        r"\b(salary|income|rent|budget\w*|loan|debt|savings?|invest\w*|"
        r"stocks?|crypto\w*|tax(es)?|expenses?|bills?|mortgage|"
        r"taka|bdt|usd|dollars?)\b|\$\s?\d", re.I)),
    (LIFE, re.compile(
        r"\bmy\s+(?:sister|brother|mother|mom|mum|father|dad|wife|husband|cousin|uncle|aunt|son|"
        r"daughter|grandmother|grandfather|grandma|grandpa|fianc\w*|girlfriend|boyfriend|partner|"
        r"best friend|friend|roommate|neighbou?r)\b", re.I)),
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


# -- which note a memory is written in ----------------------------------------------

NOTE_PREFIX = "note/"


def note_tag(title: str) -> str:
    """The tag that says which note (inside its category folder) a memory belongs to."""
    return NOTE_PREFIX + re.sub(r"\s+", " ", (title or "").strip())


def note_of_tags(tags: list[str] | None) -> str:
    """The note title recorded in *tags*, or ''."""
    for tag in tags or []:
        if str(tag).startswith(NOTE_PREFIX):
            return str(tag)[len(NOTE_PREFIX):].strip()
    return ""


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


# -- moments: what happened or how you felt, not who you are --------------------

_FEELING = (r"tired|sleepy|exhausted|bored|hungry|thirsty|sad|angry|stressed|annoyed|anxious|excited|sick|"
            r"down|nervous|lonely|relieved|cold|hot|late|awake|upset|worried|scared|nauseous|dizzy|sore|unwell|"
            r"back|home|away|offline|online|sorry|confused|frustrated|overwhelmed|restless|cranky|grumpy|moody|"
            r"jealous|calm|energetic|lazy|sleepless|jet-?lagged|hungover")
# Words that are a feeling on their own ("I'm happy") but a trait or a state of things with
# "with / at / of / in..." ("I'm happy with my job", "I'm good at math", "I'm busy with my startup").
_TRAITLIKE = r"great|good|bad|fine|happy|busy|free|okay|ok|ready|done|proud"
_MOOD = _FEELING + r"|(?:" + _TRAITLIKE + r")(?!\s+(?:with|at|of|in|for|to|from)\b)"
_DOING = (r"watching|eating|drinking|waiting|heading|walking|driving|cooking|sitting|lying|standing|queuing|queueing|"
          r"resting|napping|sleeping|showering|texting|chatting|commuting|leaving|arriving|reaching|travelling|traveling|"
          r"stuck|running late|getting ready|on my way|having (?:breakfast|lunch|dinner|tea|coffee|a break)")
_MOMENT = re.compile(
    r"\b(today|tonight|this (?:morning|afternoon|evening)|yesterday|last night|just now|right now|at the moment)\b"
    r"|\b(?:i|we)\s+(?:had|ate|drank|cooked)\b[^.!?]{0,40}\b(?:breakfast|lunch|dinner|supper|snack)\b"
    r"|^\s*(?:ugh|argh|omg|wow|damn|yay|haha|lol|phew)\b"
    r"|\b(?:i(?:'|\u2019)?m|i am|i feel|i felt|feeling)\s+(?:so |really |very |a bit |a little |kind of |too |super |pretty |quite )?"
    r"(?:" + _MOOD + r")\b"
    r"|\b(?:i(?:'|\u2019)?m|i am)\s+(?:" + _DOING + r")\b"
    r"|\b(?:i(?:'|\u2019)?m|i am)\s+(?:in|at|on)\s+(?:a|an|the|my)\s+(?:meeting|class|lecture|traffic|queue|line|car|bus|train|"
    r"rickshaw|library|cafe|gym|office|mall|market|hospital|clinic|airport|station|lab|bad mood|good mood|hurry|rush)\b"
    r"|\bi\s+just\s+(?:woke up|got up|got home|got back|came back|arrived|reached|landed|left|finished|ate|had|woke)\b"
    r"|\bi\s+(?:have|got)\s+(?:a|an)\s+(?:headache|fever|cold|cough|stomach ?ache|sore throat|toothache|migraine|cramp)\b"
    r"|\bi\s+(?:don(?:'|\u2019)?t|do not|didn(?:'|\u2019)?t)\s+feel\s+(?:like|well|good)\b"
    r"|\bi\s+(?:feel|felt)\s+like\b"
    r"|\bi\s+(?:slept|woke up)\s+(?:late|early|badly|poorly|well)\b"
    r"|\bit(?:'|\u2019)?s\s+(?:raining|snowing|sunny|cloudy|foggy|windy|hot|cold)\b", re.I)

# A feeling that comes with "usually", "in crowds", "whenever..." is how the person is, not how they are right now.
_LASTING_FEELING = re.compile(
    r"\b(usually|always|often|every\s+\w+|whenever|when(?:ever)? i|in (?:crowds|public|general|groups|the (?:morning|evening))|"
    r"around (?:people|strangers|crowds)|most days|these days|lately|since)\b", re.I)

# A moment that is really a decision or a plan is not just a mood.
_MOMENT_BUT_LASTING = re.compile(
    r"\b(decided|signed up|started|joined|got (?:a|the) job|got accepted|moved|promoted|resigned|"
    r"graduated|diagnosed|married|engaged|born)\b", re.I)


def is_moment(text: str) -> bool:
    """True for a passing moment ("tired today", "had biryani for lunch").

    Moments are kept, dated, in the Journal. They are not filed as lasting facts,
    so they never overwrite or contradict what is true about you.
    """
    t = text or ""
    if not _MOMENT.search(t) or _MOMENT_BUT_LASTING.search(t) or _INTENT.search(t):
        return False
    # "today" / "right now" make it a moment whatever else it says; a bare feeling that is
    # tied to "usually" or "in crowds" is a lasting trait.
    if _LASTING_FEELING.search(t) and not re.search(r"\b(today|tonight|right now|just now|at the moment|this (?:morning|afternoon|evening))\b", t, re.I):
        return False
    return True


# -- to-dos ------------------------------------------------------------------------

_TODO = re.compile(
    r"\b(?:i\s+(?:need|have|has|got|gotta|must|should)\s+to|i(?:'|\u2019)ve\s+got\s+to|i\s+gotta|"
    r"remind me to|don(?:'|\u2019)?t forget to|i must|"
    r"i have an?\s+(?:assignment|exam|deadline|appointment|meeting|interview|presentation))\b|^\s*to-?do\b",
    re.I)
TODO_TAG = "todo"
DONE_TAG = "done"
MOMENT_TAG = "moment"


def is_todo(text: str) -> bool:
    """True when something has to be done ("I need to renew my passport")."""
    return bool(_TODO.search(text or ""))


# -- projects: things that grow over time ------------------------------------------

THREAD_PREFIX = "project/"

_THREAD_NOUNS = (
    "business|startup|project|company|shop|store|cafe|restaurant|bakery|app|website|channel|course|"
    "book|podcast|brand|agency|studio|farm|platform|tool|game|plugin|product|newsletter|blog|band"
)
_GENERIC_HEAD = frozenset("""
a an the my our your his her their this that these those another other new own side small big
good great first next last old online local family mobile web side-hustle real any some every each
business startup project company idea plan thing one same whole full part time long short
""".split())

# Single words that can never be a project NAME (they are grammar or common
# nouns). "From", "What", "With", "Note", "Windows", "Application" are real
# examples the filing model once produced from pasted report text.
_THREAD_FUNC_WORDS = frozenset("""
from what with which where when while why how who whom whose than then thus
here there this that these those they them their there about into onto upon
within without through across behind beside between beyond above below under
note notes report reports line lines list lists text words message messages
question questions answer answers run runs file files page pages part parts
one two three four five thing things stuff way ways import imports
application applications independent windows macos linux mac android chrome
firefox update updates build builds test tests change changes fix fixes
item items step steps button buttons screen screens folder folders session
sessions model models server servers script scripts command commands prompt
prompts systems errors logs examples numbers versions today yesterday
""".split())


def valid_thread_title(title: str) -> bool:
    """True when *title* is usable as a project display name.

    Guards the filing model's ``project`` field: a report word ("From",
    "What") must never become a project folder. Real names ("Bakery",
    "Study Buddy") pass.
    """
    t = " ".join((title or "").split()).strip(" -")
    if not t or len(t) > 40:
        return False
    if not re.match(r"^[A-Za-z][A-Za-z0-9 &'-]*$", t):
        return False
    words = t.lower().split()
    if len(words) == 1:
        w = words[0]
        if w in _THREAD_FUNC_WORDS or _root(w) in _THREAD_FUNC_WORDS:
            return False
        if w in _GENERIC_HEAD:
            return False
    return True

_THREAD_PATTERNS = (
    re.compile(r"\b([a-z][a-z-]{2,18})\s+(?:" + _THREAD_NOUNS + r")\b"),
    re.compile(r"\b(?:idea|plan|plans|dream)\s+(?:for|of|about|to (?:open|start|build|launch))\s+(?:a|an|the|my|our)?\s*"
               r"(?:new\s+)?([a-z][a-z-]{2,18})\b"),
    re.compile(r"\b(?:starting|opening|launching|building|creating)\s+(?:a|an|my|our)\s+(?:new\s+)?"
               r"(" + _THREAD_NOUNS + r")\b"),
)


# The words for a person who is in the owner's life ("my doctor Rahman"). One list, used to
# make a profile for them (manager) and to know a sentence is about them, not about the owner (extract).
PEOPLE_ROLES = (
    "sister", "brother", "mother", "mom", "mum", "father", "dad", "wife", "husband",
    "best friend", "friend", "cousin", "uncle", "aunt", "boss", "manager", "teacher",
    "professor", "roommate", "girlfriend", "boyfriend", "partner", "colleague",
    "coworker", "neighbor", "neighbour", "classmate", "mentor", "son", "daughter",
    "grandmother", "grandfather", "grandma", "grandpa", "fiance", "fiancee",
    "doctor", "dentist", "nurse", "therapist", "counselor", "counsellor", "psychologist", "psychiatrist",
    "coach", "trainer", "tutor", "lecturer", "instructor", "supervisor", "advisor", "adviser",
    "principal", "dean", "headmaster", "landlord", "landlady", "lawyer", "barber", "driver",
    "teammate", "batchmate", "schoolmate", "flatmate", "housemate", "employer", "client",
    "nephew", "niece", "grandson", "granddaughter", "stepmother", "stepfather", "stepbrother",
    "stepsister", "mother-in-law", "father-in-law", "brother-in-law", "sister-in-law",
    "godfather", "godmother", "ex", "crush", "senior", "junior",
)
# Other things a sentence can be about that are not the owner (no profile is made for them).
OTHER_SUBJECTS = (
    "family", "parents", "parent", "relatives", "kids", "children", "child", "baby", "siblings",
    "grandparents", "in-laws", "dog", "cat", "pet", "pets", "twin",
)


# "my app called StudyBuddy": the name is given, so use it (read from the original capitals).
_NAMED_THREAD = re.compile(
    r"\b(?i:a|an|my|our|the)\s+(?:(?i:new|small|little|side|personal|mobile|web|online)\s+)*"
    r"(?i:" + _THREAD_NOUNS + r")\s+(?i:called|named)\s+([A-Z][A-Za-z0-9]{2,}(?:\s[A-Z][A-Za-z0-9]{2,})?)")


def _named_thread(text: str) -> str:
    m = _NAMED_THREAD.search(text or "")
    if not m:
        return ""
    name = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", m.group(1))        # StudyBuddy -> Study Buddy
    return name if name.split()[0].lower() not in _GENERIC_HEAD else ""


def thread_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


def thread_tag(name: str) -> str:
    return THREAD_PREFIX + thread_slug(name)


def thread_title(tag_or_slug: str) -> str:
    slug = tag_or_slug[len(THREAD_PREFIX):] if tag_or_slug.startswith(THREAD_PREFIX) else tag_or_slug
    return " ".join(w.capitalize() for w in slug.split("-") if w)


def thread_of_tags(tags: list[str] | None) -> str:
    """The project a record belongs to (its display name), or ''."""
    for tag in tags or []:
        if str(tag).startswith(THREAD_PREFIX):
            return thread_title(str(tag))
    return ""


def _root(word: str) -> str:
    w = word.lower()
    for suffix in ("ies", "es", "s"):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            return w[: -len(suffix)] + ("y" if suffix == "ies" else "")
    return w


def thread_of(text: str, known: list[str] | None = None) -> str:
    """The project this statement is about (a display name), or ''.

    A statement joins an existing project when it mentions it by name ("the
    bakery"). Otherwise a new project is started only when the words clearly
    name one ("a bakery business", "an idea for a bakery").
    """
    low = (text or "").lower()
    words = {_root(w) for w in re.findall(r"[a-z][a-z-]+", low)}
    squashed = {w.replace("-", "") for w in words}
    for tag in known or []:
        slug = tag[len(THREAD_PREFIX):] if tag.startswith(THREAD_PREFIX) else tag
        parts = [p for p in slug.split("-") if p]
        if slug and (_root(slug) in words or slug.replace("-", "") in squashed
                     or (len(parts) >= 2 and all(_root(p) in words for p in parts))):
            return thread_title(slug)
    named = _named_thread(text)
    if named:
        return named
    for pattern in _THREAD_PATTERNS:
        # Every match is tried: "for the bakery business" must not be lost to "the bakery".
        # The first pattern is "<name> <kind of thing>", which can overlap, so it is
        # read as neighbouring word pairs.
        if pattern is _THREAD_PATTERNS[0]:
            seq = re.findall(r"[a-z][a-z-]*", low)
            heads = [seq[i] for i in range(len(seq) - 1)
                     if seq[i + 1] in _NOUN_SET and 2 < len(seq[i]) <= 19]
        else:
            heads = [m.group(1) for m in pattern.finditer(low)]
        for head in heads:
            head = head.strip("-")
            if not head or head in _GENERIC_HEAD:
                continue
            if not valid_thread_title(thread_title(head)):
                continue
            if head in _ABSTRACT and pattern is _THREAD_PATTERNS[0]:
                continue                  # "app project": not a name
            return thread_title(head)
    return ""


# Words that name a kind of thing, not the thing itself.
_ABSTRACT = frozenset(
    "business startup project company app website tool platform product game plugin course book "
    "brand agency studio".split())
_NOUN_SET = frozenset(_THREAD_NOUNS.split("|"))
