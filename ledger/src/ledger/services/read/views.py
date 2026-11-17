"""Pure mappings for the read API: ledger conversations and memory facts to answer items, and
the small word matching used to find conversations by words or names."""

from __future__ import annotations

import re
from datetime import datetime

from ledger.clients.memory import MemoryEntity, MemoryFact
from ledger.l2_models import ConversationView
from ledger.read_models import EntityCandidate, Item, ItemKind
from ledger.schema import SpeakerRole, TimeRange
from ledger.timeutil import utc

_WORD = re.compile(r"[a-z0-9]+")
STOP = frozenset(
    "a an and are at be did do does for from had has have he her him his how i in is it me my "
    "of on or our she that the their them they this to was we were what when where which who "
    "why will with you your about".split()
)
_HIDDEN_ROLES = {SpeakerRole.owner, SpeakerRole.media, SpeakerRole.background}


def words(text: str | None) -> set[str]:
    return set(_WORD.findall((text or "").lower())) - STOP


def norm(text: str | None) -> str:
    return " ".join(_WORD.findall((text or "").lower()))


def people(view: ConversationView) -> list[str]:
    """Names heard in a conversation, the owner and media left out."""
    names = [p.displayName for p in view.conversation.participants or []
             if p.displayName and p.role not in _HIDDEN_ROLES]
    owners = {norm(p.displayName) for p in view.conversation.participants or []
              if p.role == SpeakerRole.owner}
    for name in view.state.people if view.state else []:
        if norm(name) not in owners and norm(name) not in {norm(n) for n in names}:
            names.append(name)
    return names


def conversation_item(view: ConversationView) -> Item:
    c = view.conversation
    return Item(id=c.id, kind=ItemKind.conversation, text=c.title, summary=c.summary,
                at=c.range.start, end=c.range.end, open=c.closedAt is None, revision=c.revision,
                people=people(view), state=view.state, evidence=list(c.citations or []))


def conversation_words(view: ConversationView) -> set[str]:
    c, st = view.conversation, view.state
    parts = [c.title, c.summary, *(people(view))]
    if st:
        parts += [st.topic, *st.threads]
    return set().union(*(words(p) for p in parts))


def fact_item(f: MemoryFact) -> Item:
    action = f.kind == ItemKind.action.value
    sub = (f.subject or {}).get("kind") if action else None
    return Item(id=f.id, kind=ItemKind.action if action else ItemKind.knowledge, subKind=sub,
                sensitivity=f.sensitivity or "normal", text=f.text, at=f.validAt,
                validTo=f.invalidAt, source=f.source, direction=f.direction, due=f.due,
                about=list(f.about), conversationId=f.conversationId, evidence=list(f.evidence),
                confidence=f.confidence, heard=f.heard)


def candidate(e: MemoryEntity, match: str, requires: list[str] | None = None) -> EntityCandidate:
    return EntityCandidate(kind=ItemKind.knowledge, id=e.id, name=e.name, summary=e.summary,
                           match=match, facts=[fact_item(f) for f in e.facts],
                           requires=list(requires or []))


def name_match(name: str, text: str) -> str | None:
    """exact | partial | None. Partial: every word of the shorter one is in the other."""
    a, b = norm(name), norm(text)
    if not a or not b:
        return None
    if a == b:
        return "exact"
    wa, wb = set(a.split()), set(b.split())
    return "partial" if wa <= wb or wb <= wa else None


def overlaps(rng: TimeRange, start: datetime | None, end: datetime | None) -> bool:
    if start is None:
        return False
    lo, hi = utc(rng.start), utc(rng.end)
    s = utc(start)
    e = utc(end) if end else s
    return s <= hi and lo <= e


def fact_in_range(f: MemoryFact, rng: TimeRange) -> bool:
    """A fact is in a range when its proof (or, without proof, its valid-from) is in it."""
    if f.evidence:
        return any(overlaps(rng, ev.range.start, ev.range.end) for ev in f.evidence)
    return overlaps(rng, f.validAt, None)
