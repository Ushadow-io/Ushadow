"""L2 entry points used by the routes: read conversations, explain them, run, and the
cascades of human decisions and erase into the conversation layer."""

from __future__ import annotations

from datetime import datetime, timedelta

from ledger.l2_models import ConversationView, ConvState, RunResult, WhyDecision, WhyView
from ledger.models import DecisionError, DecisionRequest, DecisionResponse, EraseRequest, Erasure
from ledger.schema import Conversation, Fragment, Link, TimeRange
from ledger.services.decision_service import DecisionService
from ledger.services.erase_service import EraseService
from ledger.services.l2.pipeline import Pipeline
from ledger.stores import Stores
from ledger.timeutil import utc

EDGE = timedelta(seconds=1)


_TEXT = ("title", "summary", "citations")


def _when(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _view(doc: dict) -> ConversationView:
    if not doc.get("active", True):
        return _retired_view(doc)
    state = doc.get("state")
    return ConversationView(
        conversation=Conversation.model_validate(doc["body"]),
        fragments=[Fragment.model_validate(f) for f in doc.get("fragments", [])],
        state=ConvState.model_validate(state) if state else None,
        changedAt=_when(doc.get("changedAt")),
    )


def _retired_view(doc: dict) -> ConversationView:
    """No text: no title, summary, citations, state or fragment topics (the store already
    removed them; this makes sure)."""
    body = {k: v for k, v in doc["body"].items() if k not in _TEXT}
    fragments = [{**f, "topic": None, "summary": None} for f in doc.get("fragments", [])]
    return ConversationView(
        conversation=Conversation.model_validate(body),
        fragments=[Fragment.model_validate(f) for f in fragments],
        state=None,
        retired=True,
        retiredAt=_when(doc.get("retiredAt")),
        replacedBy=list(doc.get("replacedBy") or []),
        changedAt=_when(doc.get("changedAt")),
    )


class ConversationService:
    def __init__(
        self, stores: Stores, pipeline: Pipeline, l1: tuple[DecisionService, EraseService]
    ) -> None:
        self._s = stores
        self.pipeline = pipeline
        self._decisions, self._erase = l1

    async def list(
        self, user_id: str, rng: TimeRange | None, include_retired: bool = False
    ) -> list[ConversationView]:
        docs = await self._s.conversations.listing(user_id, rng, include_retired)
        return [_view(doc) for doc in docs]

    async def get(self, user_id: str, conv_id: str) -> ConversationView | None:
        """One active conversation of this owner, or None."""
        doc = await self._s.conversations.load(user_id, conv_id)
        return _view(doc) if doc is not None and doc.get("active") else None

    async def changes(self, user_id: str, since: datetime) -> list[ConversationView]:
        """Conversations (retired too) whose changedAt is after `since`, oldest change first."""
        return [_view(doc) for doc in await self._s.conversations.changes(user_id, since)]

    async def why(self, user_id: str, conv_id: str) -> WhyView | None:
        doc = await self._s.conversations.load(user_id, conv_id)
        if doc is None or not doc.get("active"):
            return None
        rows = []
        for row in doc.get("decisions", []):
            link = await self._s.links.load(user_id, row["linkId"]) if row["linkId"] else None
            rows.append(WhyDecision(role=row["role"], source=row["source"], link=link))
        return WhyView(
            conversationId=conv_id,
            revision=doc["revision"],
            momentKeys=doc.get("momentKeys", []),
            decisions=rows,
        )

    async def run(self, user_id: str, rng: TimeRange) -> RunResult:
        return await self.pipeline.run(user_id, rng)

    async def decide(self, req: DecisionRequest) -> DecisionResponse | DecisionError:
        """Save a human decision, then rebuild only the conversations around its subjects."""
        result = await self._decisions.decide(req)
        if isinstance(result, DecisionError) or not result.created:
            return result
        rng = await self._link_span(req.userId, result.link)
        if rng is not None:
            await self.pipeline.run(req.userId, rng)
        return result

    async def _link_span(self, user_id: str, link: Link) -> TimeRange | None:
        times: list[datetime] = [utc(link.at)] if link.at else []
        for item in (link.fromId, link.toId):
            if not item:
                continue
            moment = await self._s.moments.get(item)
            if moment is not None and moment["userId"] == user_id:
                body = moment["body"]["range"]
                times += [
                    datetime.fromisoformat(body["start"]),
                    datetime.fromisoformat(body["end"]),
                ]
                continue
            rec = await self._s.recordings.load(user_id, item)
            if rec is not None:
                times += [utc(rec.range.start), utc(rec.range.end)]
        if not times:
            return None
        return TimeRange(start=min(times) - EDGE, end=max(times) + EDGE)

    async def erase(self, req: EraseRequest) -> Erasure | None:
        """Erase evidence (L1), then remove every derived text of the conversations that held
        it (state records, title, summary, citations, fragment topics) and rebuild them."""
        erasure = await self._erase.erase(req)
        if erasure is None:
            return None
        user_id = req.userId
        affected = await self._s.conversations.active(user_id, erasure.range)
        starts = [utc(erasure.range.start)] + [_t(d["start"]) for d in affected]
        ends = [utc(erasure.range.end)] + [_t(d["end"]) for d in affected]
        span = TimeRange(start=min(starts), end=max(ends))
        await self._s.states.delete_overlapping(user_id, span)
        for doc in affected:
            await self._s.conversations.redact(doc)
        await self.pipeline.run(user_id, span)
        return erasure


def _t(value: str) -> datetime:
    return datetime.fromisoformat(value)
