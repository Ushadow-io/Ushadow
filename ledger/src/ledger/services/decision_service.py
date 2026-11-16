"""Human decisions. A human Link for a key wins over rule and model Links for that key."""

from __future__ import annotations

from ledger.models import DecisionError, DecisionRequest, DecisionResponse
from ledger.schema import Decider, Link, LinkKind
from ledger.services.decision_rules import effective
from ledger.services.moment_service import Clock
from ledger.stores import Stores
from ledger.timeutil import now_utc, stable_hash


class DecisionService:
    def __init__(self, stores: Stores, clock: Clock = now_utc) -> None:
        self._s = stores
        self._clock = clock

    async def decide(self, req: DecisionRequest) -> DecisionResponse | DecisionError:
        problem = await self._check(req)
        if problem is not None:
            return problem
        link_id = "link-h-" + stable_hash(
            req.userId, req.key, req.kind.value, req.fromId, req.toId, req.at, req.retracts
        )
        stored = await self._s.links.load(req.userId, link_id)
        created = stored is None
        if stored is None:  # the same decision posted twice is one Link
            stored = Link(
                id=link_id,
                kind=req.kind,
                fromId=req.fromId,
                toId=req.toId,
                at=req.at,
                key=req.key,
                decidedBy=Decider.human,
                reason=req.reason,
                recordedAt=self._clock(),
                retracts=req.retracts,
            )
            await self._s.links.save(req.userId, stored)
        return DecisionResponse(
            link=stored, created=created, effective=await self.effective(req.userId, req.key)
        )

    async def _check(self, req: DecisionRequest) -> DecisionError | None:
        needs_at = req.kind == LinkKind.split_at
        if (needs_at and req.at is None) or (not needs_at and req.toId is None):
            return DecisionError.missing_target
        if req.retracts is None:
            return None
        target = await self._s.links.load(req.userId, req.retracts)
        if target is None:
            return DecisionError.unknown_retracts
        if target.key != req.key:
            return DecisionError.key_mismatch
        return None

    async def effective(self, user_id: str, key: str) -> Link | None:
        return effective(await self._s.links.by_key(user_id, key))
