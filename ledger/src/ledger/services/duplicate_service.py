"""Duplicate rule: two recordings of the same time for the same owner become one, by a rule Link.

Nothing is deleted. The Link is decided once per key; a human Link for the key wins later.
"""

from __future__ import annotations

from ledger.models import DUPLICATE_POLICY, TypeCounts
from ledger.schema import Decider, Link, LinkKind, Recording
from ledger.services.decision_rules import (
    duplicate_key,
    duplicate_pair,
    gap_seconds,
    judge_duplicate,
)
from ledger.services.moment_service import Clock
from ledger.stores import Stores
from ledger.timeutil import now_utc, stable_hash


class DuplicateService:
    def __init__(self, stores: Stores, clock: Clock = now_utc) -> None:
        self._s = stores
        self._clock = clock

    async def check(self, user_id: str, rec: Recording) -> TypeCounts:
        counts = TypeCounts()
        for other in await self._s.recordings.list(user_id, rec.range):
            verdict = judge_duplicate(rec, other)
            if verdict is None:
                continue
            key = duplicate_key(rec, other)
            if await self._s.links.by_key(user_id, key):
                counts.present += 1  # decided once: any Link for this key stands
                continue
            await self._s.links.save(user_id, self._rule_link(user_id, rec, other, verdict))
            counts.created += 1
        return counts

    def _rule_link(
        self, user_id: str, a: Recording, b: Recording, verdict: tuple[float, str]
    ) -> Link:
        first, second = duplicate_pair(a, b)
        key = duplicate_key(a, b)
        confidence, reason = verdict
        return Link(
            id="link-" + stable_hash(user_id, key, Decider.rule.value),
            kind=LinkKind.duplicate_of,
            fromId=first.id,
            toId=second.id,
            key=key,
            decidedBy=Decider.rule,
            policyVersion=DUPLICATE_POLICY,
            confidence=confidence,
            gapSeconds=gap_seconds(a, b),
            reason=reason,
            recordedAt=self._clock(),
        )
