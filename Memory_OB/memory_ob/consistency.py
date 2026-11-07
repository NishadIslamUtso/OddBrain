"""Consistency sweep + Monthly Audit.

Walks every connection in the store and reports what is broken:

* dead links      — an edge points at a record that no longer exists
* contradictions  — two linked records that disagree
* stale citations — a live record cites a superseded one
* orphans         — records with no connections at all (informational)
* date sanity     — event_time later than capture_time (impossible)
* merge candidates— near-duplicate records the owner may want to merge

The sweep only *reports* and opens cards. It never mutates the ledger.
"""

from __future__ import annotations

import re
from typing import Any

from .review import CardStore


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2}


def sweep(store: Any, *, open_cards: bool = True) -> dict[str, Any]:
    """Run the consistency sweep and return a report."""
    cards = CardStore(store) if open_cards else None
    records = store.list_records(include_private=False, limit=10000)
    by_id = {r.id: r for r in records}

    dead_links: list[dict[str, str]] = []
    contradictions: list[dict[str, Any]] = []
    stale_citations: list[dict[str, str]] = []
    orphans: list[str] = []
    date_issues: list[dict[str, str]] = []

    edges = store.edges()
    connected: set[str] = set()
    for src, dst, label in edges:
        connected.add(src)
        connected.add(dst)
        src_ok = src in by_id
        dst_ok = dst in by_id
        if not (src_ok and dst_ok):
            dead_links.append(
                {
                    "src": src,
                    "dst": dst,
                    "label": label,
                    "missing": ",".join(
                        n for n, ok in (("src", src_ok), ("dst", dst_ok)) if not ok
                    ),
                }
            )
            continue
        if label == "contradicts":
            contradictions.append(
                {
                    "a": src,
                    "b": dst,
                    "a_title": by_id[src].title,
                    "b_title": by_id[dst].title,
                }
            )
        if label in ("supports", "cites") and by_id[dst].status == "superseded":
            stale_citations.append(
                {
                    "from": src,
                    "to": dst,
                    "to_status": by_id[dst].status,
                }
            )

    for r in records:
        if r.id not in connected:
            orphans.append(r.id)
        if r.event_time and r.capture_time and r.event_time > r.capture_time:
            date_issues.append(
                {
                    "id": r.id,
                    "event_time": r.event_time,
                    "capture_time": r.capture_time,
                }
            )

    merge_candidates = _merge_candidates(records)

    if cards is not None:
        for d in dead_links:
            src_rec = by_id.get(d["src"])
            speakers = [src_rec.speaker] if src_rec is not None else []
            cards.propose_ask(
                title="Dead link",
                body=(
                    f"An edge points at a missing record "
                    f"({d['missing']}): {d['src']} --{d['label']}--> {d['dst']}"
                ),
                speakers=speakers or ["memory_ob"],
            )
        for c in contradictions:
            a_rec = by_id.get(c["a"])
            b_rec = by_id.get(c["b"])
            speakers = []
            if a_rec is not None:
                speakers.append(a_rec.speaker)
            if b_rec is not None and b_rec.speaker not in speakers:
                speakers.append(b_rec.speaker)
            cards.propose_ask(
                title="Contradiction",
                body=(
                    f"Two records disagree: {c['a_title']!r} (id {c['a']}) "
                    f"vs {c['b_title']!r} (id {c['b']})"
                ),
                speakers=speakers or ["memory_ob"],
            )
        for m in merge_candidates:
            cards.propose_merge(
                record_id=m["a"],
                other_id=m["b"],
                title="Possible duplicate",
                body=f"Similar records: {m['a_title']!r} and {m['b_title']!r}",
            )

    trust_dist = {"raw": 0, "candidate": 0, "confirmed": 0}
    for r in records:
        if r.trust < 0.3:
            trust_dist["raw"] += 1
        elif r.trust < 0.8:
            trust_dist["candidate"] += 1
        else:
            trust_dist["confirmed"] += 1

    return {
        "links_checked": len(edges),
        "dead_links": dead_links,
        "contradictions": contradictions,
        "stale_citations": stale_citations,
        "orphans": len(orphans),
        "date_issues": date_issues,
        "merge_candidates": merge_candidates,
        "records": len(records),
        "trust_distribution": trust_dist,
        "cards_opened": bool(cards),
    }


def _merge_candidates(records: list[Any]) -> list[dict[str, str]]:
    """Find pairs of records with strongly overlapping title tokens."""
    out: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for i, a in enumerate(records):
        ta = _tokens(a.title) | set(a.tags)
        if not ta:
            continue
        for b in records[i + 1 :]:
            tb = _tokens(b.title) | set(b.tags)
            if not tb:
                continue
            overlap = len(ta & tb)
            if overlap >= 2 and overlap / max(1, len(ta | tb)) >= 0.5:
                key = tuple(sorted((a.id, b.id)))
                if key in seen:
                    continue
                seen.add(key)
                out.append(
                    {"a": a.id, "b": b.id, "a_title": a.title, "b_title": b.title}
                )
    return out[:50]


def monthly_audit(store: Any) -> dict[str, Any]:
    """The Monthly Audit: growth, trust distribution, connection health."""
    report = sweep(store, open_cards=False)
    stats = store.stats()
    return {
        "records": stats["records"],
        "confirmed": stats["confirmed"],
        "trash": stats["trash"],
        "retracted": stats["retracted"],
        "trust_distribution": report["trust_distribution"],
        "links_checked": report["links_checked"],
        "dead_links": len(report["dead_links"]),
        "contradictions": len(report["contradictions"]),
        "orphans": report["orphans"],
        "merge_candidates": len(report["merge_candidates"]),
    }
