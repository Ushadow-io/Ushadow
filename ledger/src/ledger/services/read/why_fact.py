"""`why` for one fact: its evidence, the conversations that evidence is from (and who decided
they are those conversations), and the human decisions on the fact. UNSCOPED; the gateway's
gate runs on it. Memory carries the fact and its decisions; the ledger carries the rest."""

from __future__ import annotations

from ledger.clients.memory import MemoryFact, MemoryFactDecision
from ledger.l2_models import ConversationView, WhyView
from ledger.read_models import Item, ItemKind, Refusal, RefusalCode, WhyAnswer, WhyStep
from ledger.services.read.answers import ReadDeps
from ledger.services.read.memory_view import MemoryView
from ledger.services.read.views import conversation_item, fact_item, overlaps

NOT_FOUND = Refusal(code=RefusalCode.not_found, detail="not found for this user")


def conversation_steps(why: WhyView) -> list[WhyStep]:
    return [WhyStep(kind=ItemKind.conversation, role=row.role, source=row.source,
                    decidedBy=row.link.decidedBy.value if row.link else "rule", link=row.link,
                    conversationId=why.conversationId) for row in why.decisions]


def _human_step(item: Item, d: MemoryFactDecision) -> WhyStep:
    st = d.statement
    words = (st.get("text") or f"{st.get('subject')} {st.get('relation')} {st.get('object')}"
             if st else d.text)
    return WhyStep(kind=item.kind, subKind=item.subKind, sensitivity=item.sensitivity,
                   role="corrected" if d.kind == "correct" else "removed", source="human",
                   decidedBy="human", at=d.at, text=words if d.kind == "correct" else None)


def _asserted(item: Item) -> WhyStep:
    """Who made the fact: a person (a human decision) or the extractor model."""
    return WhyStep(kind=item.kind, subKind=item.subKind, sensitivity=item.sensitivity,
                   role="asserted", source=item.source,
                   decidedBy="human" if item.source == "person" else "model")


async def _sources(deps: ReadDeps, user_id: str, fact: MemoryFact) -> list[ConversationView]:
    found: dict[str, ConversationView] = {}
    for ev in fact.evidence:
        for view in await deps.conversations.list(user_id, ev.range):
            if any(p.recordingId == ev.recordingId and overlaps(
                    ev.range, p.range.start, p.range.end) for p in view.conversation.parts):
                found.setdefault(view.conversation.id, view)
    return sorted(found.values(), key=lambda v: (v.conversation.range.start, v.conversation.id))


async def why_fact(deps: ReadDeps, user_id: str, fact_id: str) -> WhyAnswer | Refusal:
    mem = MemoryView(deps.memory, user_id)
    target = {"kind": "fact", "id": fact_id}
    fact = await mem.fact(fact_id)
    if fact is None:
        return mem.mark(WhyAnswer(userId=user_id, target=target)) if mem.reasons else NOT_FOUND
    item = fact_item(fact)
    steps = [_asserted(item)]
    sources = await _sources(deps, user_id, fact)
    for view in sources:
        why = await deps.conversations.why(user_id, view.conversation.id)
        steps += conversation_steps(why) if why else []
    steps += [_human_step(item, d) for d in await mem.fact_decisions(fact_id) or []]
    answer = WhyAnswer(userId=user_id, target=target, item=item, steps=steps,
                       conversations=[conversation_item(v) for v in sources])
    return mem.mark(answer)
