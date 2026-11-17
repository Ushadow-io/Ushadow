"""The data the stages pass to each other. Plain dataclasses, no I/O.

Words used: a *new* entity or fact comes from the episode being read; a *stored* one is
already in the graph store. Entity keys inside one episode are normalised names.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal

from memory_service.engine.base import EngineFact
from memory_service.schema import EvidenceRef
from memory_service.textutil import norm

if TYPE_CHECKING:
    from memory_service.engine.staged.llm import LLM
    from memory_service.engine.staged.settings import StagedSettings
    from memory_service.engine.staged.store import GraphStore


def utcnow() -> datetime:
    return datetime.now(UTC)


# ---- input: one episode, whatever its source ------------------------------------------------------


@dataclass(frozen=True)
class SourceLine:
    """One line of an episode. `kind` says where it came from (speech today; a photo caption or a
    screen action later). `locator` is the proof pointer; each fact fills in its own quote."""

    ref: str  # "L1", "L2", ...: how the model points at a line
    kind: str
    speaker: str
    role: str
    text: str
    at: datetime | None = None
    locator: EvidenceRef | None = None

    def render(self) -> str:
        when = f" {self.at:%Y-%m-%d %H:%M}Z" if self.at else ""
        return f"{self.ref} [{self.kind}{when}] {self.speaker} ({self.role}): {self.text}"

    def proof(self, quote: str | None) -> EvidenceRef | None:
        """A proof pointer for this line. The quote is kept only if it is really in the line."""
        if self.locator is None:
            return None
        q = quote if quote and norm(quote) and norm(quote) in norm(self.text) else self.text
        return self.locator.model_copy(update={"quote": q})


# ---- stage 1: what the episode says ---------------------------------------------------------------


@dataclass
class NewEntity:
    key: str  # normalised name
    name: str
    type: str = "Entity"
    aliases: list[str] = field(default_factory=list)

    def names(self) -> list[str]:
        return [self.name, *self.aliases]


@dataclass
class NewFact:
    subject: str  # entity key
    relation: str
    object: str  # entity key
    text: str
    line_refs: list[str]
    valid_at: datetime | None = None
    invalid_at: datetime | None = None
    quote: str | None = None

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.subject, norm(self.relation), self.object)


@dataclass
class Extraction:
    lines: list[SourceLine]
    entities: dict[str, NewEntity] = field(default_factory=dict)
    facts: list[NewFact] = field(default_factory=list)
    chunks: int = 0

    def line(self, ref: str) -> SourceLine | None:
        return next((ln for ln in self.lines if ln.ref == ref), None)

    def facts_about(self, key: str) -> list[NewFact]:
        return [f for f in self.facts if key in (f.subject, f.object)]


# ---- what the store holds -------------------------------------------------------------------------


@dataclass
class StoredEntity:
    id: str
    name: str
    type: str = "Entity"
    aliases: list[str] = field(default_factory=list)
    match_root: str | None = None  # the match decision (chain) that created it; gives its confidence
    summary: str = ""
    created_at: datetime = field(default_factory=utcnow)

    def names(self) -> set[str]:
        return {norm(n) for n in (self.name, *self.aliases) if norm(n)}


@dataclass
class StoredFact:
    """A fact edge. `source_name`/`target_name` are fixed when the fact is written, so the
    service's fact id (a hash of the names) stays the same when maintenance re-points the edge."""

    id: str
    source_id: str
    target_id: str
    source_name: str
    target_name: str
    relation: str
    text: str
    valid_at: datetime | None = None
    invalid_at: datetime | None = None
    episodes: list[str] = field(default_factory=list)
    human: bool = False
    created_at: datetime = field(default_factory=utcnow)
    confidence: float = 1.0  # its own reconcile decision; entity scores are added at read time
    source_match: str | None = None  # root of the match decision that linked its subject
    target_match: str | None = None

    @property
    def closed(self) -> bool:
        return self.invalid_at is not None

    def to_engine(self, hints: list[EvidenceRef] | None = None,
                  confidence: float | None = None) -> EngineFact:
        return EngineFact(engine_id=self.id, source=self.source_name, relation=self.relation,
                          target=self.target_name, text=self.text, valid_at=self.valid_at,
                          invalid_at=self.invalid_at, episodes=list(self.episodes), human=self.human,
                          source_entity_id=self.source_id, target_entity_id=self.target_id,
                          hints=list(hints or []), confidence=confidence)


@dataclass
class StoredEpisode:
    id: str
    name: str
    reference_time: datetime
    lines: list[str]  # rendered lines; the review of uncertain entities reads them
    fact_ids: list[str] = field(default_factory=list)
    entity_ids: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class FactQuery:
    subject_id: str
    text: str
    k: int
    open_only: bool = True


@dataclass(frozen=True)
class FactKey:
    subject_id: str
    relation: str
    object_id: str


@dataclass
class Decision:
    """One machine (or human) decision, kept for good: a later decision supersedes it, never
    overwrites it. Field meanings follow the ledger's Link record (key, decidedBy, policyVersion,
    model, confidence). `root` names the chain; the newest decision of a chain is the current one."""

    id: str
    kind: str  # entity_match | fact_reconcile
    key: str  # what was decided, e.g. "entity|<episode>|<name>" or "pair|<fact a>|<fact b>"
    subject_id: str  # the stored entity / fact the decision is about
    outcome: str  # entity: same | new | inconclusive; fact: new | duplicate | contradicts
    confidence: float
    decided_by: str = "rule"  # rule | model | human
    model: str | None = None
    target_ids: list[str] = field(default_factory=list)  # same: [entity]; duplicate: [fact]; closed
    candidates: list[str] = field(default_factory=list)  # the ids it compared with
    policy_version: str = ""
    root: str = ""  # the first decision of the chain ("" on the first one = itself)
    supersedes: str | None = None
    deep: bool = False  # made by the deeper review: never reviewed again
    at: datetime = field(default_factory=utcnow)

    def __post_init__(self) -> None:
        self.root = self.root or self.id


# ---- stages 2-4: candidates and decisions ---------------------------------------------------------


@dataclass
class Candidate:
    entity: StoredEntity
    score: float
    exact: bool
    facts: list[StoredFact] = field(default_factory=list)


@dataclass
class EntityCandidates:
    entity: NewEntity
    candidates: list[Candidate] = field(default_factory=list)


EntityOutcome = Literal["same", "new", "inconclusive"]
FactOutcome = Literal["new", "duplicate", "contradicts"]


@dataclass
class EntityDecision:
    key: str
    outcome: EntityOutcome
    confidence: float
    entity_id: str | None = None  # same: the stored entity
    candidates: list[str] = field(default_factory=list)  # the stored entities it was compared with
    by: str = "rule"


@dataclass
class EntityMatch:
    decisions: dict[str, EntityDecision] = field(default_factory=dict)

    def resolved(self, key: str) -> str | None:
        d = self.decisions.get(key)
        return d.entity_id if d and d.outcome == "same" else None


@dataclass
class FactDecision:
    index: int  # into Extraction.facts
    outcome: FactOutcome
    confidence: float
    ids: list[str] = field(default_factory=list)  # duplicate: [the stored fact]; contradicts: closed
    candidates: list[str] = field(default_factory=list)  # the stored facts it was compared with
    by: str = "rule"


# ---- what every stage gets ------------------------------------------------------------------------


@dataclass
class Ctx:
    group: str
    store: GraphStore
    llm: LLM
    cfg: StagedSettings
    tally: Counter[str] = field(default_factory=Counter)  # rule/model decision counts
    clock: Callable[[], datetime] = utcnow
