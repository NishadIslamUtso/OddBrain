"""The owner's own signature.

From an empty vault, nothing can ever become truth: the only path that signs a
record is a Review card, and every card type needs a record that already
exists. The first memory was unreachable — the loop was open at the start.

The owner's answer is a direct "this is true" action in their own screens. It
goes through a proposal card and approves it in the same breath, so:

* ``sign_record`` stays the only thing that can create truth (§2), and the
  trap test that forbids a cardless approval still holds;
* the card exists, so the audit trail shows exactly what was signed and when;
* the agent cannot reach it — its tools import the library directly and never
  see this route.

The button is the owner's signature. The card is the receipt.
"""

from __future__ import annotations

from typing import Any

from .extract import kind_hint_for
from .records import CONFIRMED_MIN
from .review import CardStore

# What happens to a fact once the owner has dealt with it.
PROMOTED = "promoted"
REJECTED = "rejected"


def remember_fact(
    store,
    fact_id: str,
    *,
    by: str = "owner",
    title: str | None = None,
    kind: str | None = None,
    note: str | None = None,
) -> Any:
    """Turn a candidate fact into confirmed truth, signed by the owner.

    Returns the card that signed it — the receipt, not the record.

    Raises ``LookupError`` when the fact does not exist.
    """
    fact = store.get_fact(fact_id)
    if fact is None:
        raise LookupError(f"no candidate fact {fact_id!r}")

    text = str(fact.get("text") or "").strip()
    if not text:
        raise ValueError("that candidate is empty")

    source = dict(fact.get("source") or {})
    source["fact_id"] = fact_id

    payload = {
        "kind": kind or kind_hint_for(text),
        "subject": "self",
        "speaker": "user",
        "title": (title or text)[:120],
        "body": text,
        "trust": CONFIRMED_MIN,
        "source": source,
    }

    cards = CardStore(store)
    card = cards.propose_record(
        new=payload, title=payload["title"], body=text, speakers=["user"]
    )
    cards.resolve(card.id, "approve", by=by, note=note or "owner remembered")
    store.set_fact_status(fact_id, PROMOTED)
    store.log_activity(
        "remember", f"{fact_id} → {card.id}", actor=by,
    )
    return card


def dismiss_fact(store, fact_id: str, *, by: str = "owner") -> None:
    """The owner says this is not true. The text is kept, out of the pool."""
    fact = store.get_fact(fact_id)
    if fact is None:
        raise LookupError(f"no candidate fact {fact_id!r}")
    store.set_fact_status(fact_id, REJECTED)
    store.log_activity("dismiss", fact_id, actor=by)


def candidates(store, *, limit: int = 200) -> list[dict[str, Any]]:
    """Every candidate fact still waiting, strongest first."""
    return store.list_facts(status="candidate", limit=limit)
