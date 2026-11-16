"""One L2 run: its owner, its stats, and the saved Decisions (Links) it reads and writes.

Keys (the question that is decided; the answer is the Link kind):
- join:{prevMomentKey}:{nextMomentKey}:{JOIN_POLICY}   continues | unrelated
- split:{momentKey}:{SPLIT_POLICY}                     split_at (or a rejected split)
- daypass:{prevMomentKey}:{nextMomentKey}:{DAYPASS_POLICY}   continues

A machine Link (rule or model) has id hash(owner, key, input digest). A run first looks for a
human Link on the key (it always wins), then for the machine Link of the current inputs. Only
when neither exists does it decide, and then it saves the Link: a replay with the same inputs
finds it and asks no model. When the inputs change (late evidence, an erase), the new machine
Link retracts the old one.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime

from ledger.l2_models import DAYPASS_POLICY, JOIN_POLICY, SPLIT_POLICY
from ledger.llm.structured import ModelStats
from ledger.schema import Decider, Link, LinkKind
from ledger.services.decision_rules import effective
from ledger.stores import Stores
from ledger.timeutil import stable_hash


def join_key(prev_key: str, next_key: str) -> str:
    return f"join:{prev_key}:{next_key}:{JOIN_POLICY}"


def split_key(moment_key: str) -> str:
    return f"split:{moment_key}:{SPLIT_POLICY}"


def daypass_key(prev_key: str, next_key: str) -> str:
    return f"daypass:{prev_key}:{next_key}:{DAYPASS_POLICY}"


def human_link(links: list[Link]) -> Link | None:
    return effective([link for link in links if link.decidedBy == Decider.human])


@dataclass(frozen=True)
class LinkSpec:
    key: str
    digest: str
    kind: LinkKind
    from_id: str
    to_id: str | None = None
    at: datetime | None = None
    decided_by: Decider = Decider.rule
    policy: str = JOIN_POLICY
    model: str | None = None
    confidence: float | None = None
    gap_seconds: float | None = None
    reason: str | None = None  # a code, never words from a transcript


@dataclass
class RunCtx:
    user_id: str
    stores: Stores
    clock: Callable[[], datetime]
    stats: ModelStats = field(default_factory=ModelStats)
    human_splits: list[Link] = field(default_factory=list)
    links_created: int = 0
    _by_key: dict[str, list[Link]] = field(default_factory=dict)

    async def links(self, key: str) -> list[Link]:
        if key not in self._by_key:
            self._by_key[key] = await self.stores.links.by_key(self.user_id, key)
        return self._by_key[key]

    def machine_id(self, key: str, digest: str) -> str:
        return "link-l2-" + stable_hash(self.user_id, key, digest)

    async def find_machine(self, key: str, digest: str) -> Link | None:
        wanted = self.machine_id(key, digest)
        return next((link for link in await self.links(key) if link.id == wanted), None)

    async def write(self, spec: LinkSpec) -> Link:
        """Save the machine decision for these inputs (or return the saved one)."""
        found = await self.find_machine(spec.key, spec.digest)
        if found is not None:
            return found
        links = await self.links(spec.key)
        machine = [link for link in links if link.decidedBy != Decider.human]
        prior = effective(machine)
        link = Link(
            id=self.machine_id(spec.key, spec.digest),
            kind=spec.kind,
            fromId=spec.from_id,
            toId=spec.to_id,
            at=spec.at,
            key=spec.key,
            decidedBy=spec.decided_by,
            policyVersion=spec.policy,
            model=spec.model,
            confidence=spec.confidence,
            gapSeconds=spec.gap_seconds,
            reason=spec.reason,
            recordedAt=self.clock(),
            retracts=prior.id if prior else None,
        )
        await self.stores.links.save(self.user_id, link)
        links.append(link)
        self.links_created += 1
        return link
