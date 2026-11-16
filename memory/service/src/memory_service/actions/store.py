"""Action facts in the taskfacts fact shape, and where they are kept.

Shape (ushadow_facts/facts.py): id, subject{kind,id}, key, occurred_at, recorded_at, value,
source (person|agent|sensor), scope, seq, retracts. No status is stored: "standing" is worked
out from retractions, as in taskfacts.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal, Protocol

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

RETRACTION = "retraction"  # taskfacts' reserved key
ERASED = "erased"  # controlled-erase marker proposed for taskfacts (design: "A change that taskfacts needs")


class ActionSubject(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: str
    id: str


class ActionFact(BaseModel):
    """Exactly the taskfacts fact fields. `extra=forbid`: a `status` field cannot sneak in."""

    model_config = ConfigDict(extra="forbid")
    id: str
    subject: ActionSubject
    key: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    occurred_at: AwareDatetime
    recorded_at: AwareDatetime
    value: dict[str, Any] = Field(default_factory=dict)
    source: Literal["person", "agent", "sensor"]
    scope: str | None = None
    seq: int | None = None
    retracts: str | None = None


class ActionFactDraft(BaseModel):
    subject: ActionSubject
    key: str
    occurred_at: AwareDatetime
    value: dict[str, Any]  # must hold "memory_key": the idempotency key
    source: Literal["person", "agent", "sensor"]
    scope: str


class ControlledEraseUnsupported(RuntimeError):
    """The store cannot remove words from a stored fact (taskfacts today: uf_facts is append-only)."""


class ActionFactStore(Protocol):
    async def record(self, draft: ActionFactDraft) -> ActionFact:
        """Append once per value['memory_key'] in the subject. A repeat gives the stored fact."""
        ...

    async def retract(self, fact: ActionFact, source: str) -> ActionFact: ...

    async def erase(self, fact: ActionFact) -> None:
        """Controlled erase: blank the value, keep the row, record an `erased` fact."""
        ...

    async def standing(self, scope: str) -> list[ActionFact]: ...

    async def rows(self, scope: str) -> list[ActionFact]:
        """Every row of the scope, retractions included (for audits and tests)."""
        ...


def standing_of(rows: list[ActionFact]) -> list[ActionFact]:
    """taskfacts' rule, reduced to what memory writes: a fact stands unless a fact retracts it.
    Retractions and erase markers never stand themselves."""
    gone = {f.retracts for f in rows if f.retracts}
    live = [f for f in rows if not f.retracts and f.id not in gone]
    return sorted(live, key=lambda f: (f.occurred_at, f.id))


class InMemoryActionFactStore:
    def __init__(self) -> None:
        self.log: list[ActionFact] = []

    def _append(self, draft: ActionFactDraft, retracts: str | None = None) -> ActionFact:
        seq = len(self.log) + 1
        f = ActionFact(id=f"f{seq:012d}", subject=draft.subject, key=draft.key,
                       occurred_at=draft.occurred_at, recorded_at=datetime.now(UTC),
                       value=dict(draft.value), source=draft.source, scope=draft.scope, seq=seq,
                       retracts=retracts)
        self.log.append(f)
        return f

    async def record(self, draft: ActionFactDraft) -> ActionFact:
        mk = draft.value.get("memory_key")
        for f in self.log:
            if f.subject == draft.subject and mk and f.value.get("memory_key") == mk:
                return f
        return self._append(draft)

    async def retract(self, fact: ActionFact, source: str) -> ActionFact:
        draft = ActionFactDraft(subject=fact.subject, key=RETRACTION, occurred_at=fact.occurred_at,
                                value={}, source=source, scope=fact.scope or "")
        return self._append(draft, retracts=fact.id)

    async def erase(self, fact: ActionFact) -> None:
        for i, f in enumerate(self.log):
            if f.id == fact.id:
                self.log[i] = f.model_copy(update={"value": {}})
        draft = ActionFactDraft(subject=fact.subject, key=ERASED, occurred_at=fact.occurred_at,
                                value={}, source="person", scope=fact.scope or "")
        self._append(draft, retracts=fact.id)

    async def standing(self, scope: str) -> list[ActionFact]:
        return standing_of(await self.rows(scope))

    async def rows(self, scope: str) -> list[ActionFact]:
        return [f for f in self.log if f.scope == scope]


class TaskfactsActionFactStore:
    """Writes through taskfacts' public FactStore port (`append`, `facts`, `subjects`), e.g.
    `ushadow_facts.postgres.store.PgStore` or `ushadow_facts.memory.MemoryStore`, without any
    change to taskfacts. `subject_cls` is `ushadow_facts.facts.Subject`.

    Limits, because taskfacts lacks them today:
    - erase raises ControlledEraseUnsupported (uf_facts refuses UPDATE/DELETE/TRUNCATE);
    - no idempotency key on `append`: we look for our `memory_key` in the subject's facts first
      (a race between two writers can still double-append);
    - no read by scope: `standing` walks every subject.
    """

    def __init__(self, store: Any, subject_cls: Any) -> None:
        self.store = store
        self.subject_cls = subject_cls

    @staticmethod
    def _ours(f: Any) -> ActionFact:
        return ActionFact(id=f.id, subject=ActionSubject(kind=f.subject.kind, id=f.subject.id),
                          key=f.key, occurred_at=f.occurred_at, recorded_at=f.recorded_at,
                          value=dict(f.value), source=f.source, scope=f.scope, seq=f.seq,
                          retracts=f.retracts)

    async def record(self, draft: ActionFactDraft) -> ActionFact:
        subject = self.subject_cls(draft.subject.kind, draft.subject.id)
        mk = draft.value.get("memory_key")
        for f in await self.store.facts(subject):
            if mk and f.value.get("memory_key") == mk:
                return self._ours(f)
        f = await self.store.append(subject, draft.key, draft.value, occurred_at=draft.occurred_at,
                                    recorded_at=datetime.now(UTC), source=draft.source,
                                    scope=draft.scope)
        return self._ours(f)

    async def retract(self, fact: ActionFact, source: str) -> ActionFact:
        subject = self.subject_cls(fact.subject.kind, fact.subject.id)
        f = await self.store.append(subject, RETRACTION, {}, occurred_at=fact.occurred_at,
                                    recorded_at=datetime.now(UTC), source=source,
                                    scope=fact.scope, retracts=fact.id)
        return self._ours(f)

    async def erase(self, fact: ActionFact) -> None:
        raise ControlledEraseUnsupported(
            "taskfacts has no controlled erase: uf_facts refuses UPDATE and DELETE. Needed: "
            "erase(fact_id) that blanks `value` in place, keeps the row, and appends an `erased` fact")

    async def rows(self, scope: str) -> list[ActionFact]:
        out = []
        for s in await self.store.subjects():
            out += [self._ours(f) for f in await self.store.facts(s) if f.scope == scope]
        return out

    async def standing(self, scope: str) -> list[ActionFact]:
        return standing_of(await self.rows(scope))
