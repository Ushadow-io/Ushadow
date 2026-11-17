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


HUMAN = "human"  # the source of a name a person gave (not an episode id); see known_names.py


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
    source: float = 1.0  # who said it (stage 1b): 1.0 owner or a known speaker, low if unknown only

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.subject, norm(self.relation), self.object)


@dataclass
class Extraction:
    lines: list[SourceLine]
    entities: dict[str, NewEntity] = field(default_factory=dict)
    facts: list[NewFact] = field(default_factory=list)
    chunks: int = 0
    owner: str = "Owner"  # the name every fact uses for the user
    owner_names: frozenset[str] = frozenset()  # normalised names that mean the user (stage 1b)

    def line(self, ref: str) -> SourceLine | None:
        return next((ln for ln in self.lines if ln.ref == ref), None)

    def facts_about(self, key: str) -> list[NewFact]:
        return [f for f in self.facts if key in (f.subject, f.object)]


# ---- what the store holds -------------------------------------------------------------------------


@dataclass
class StoredEntity:
    """Name provenance: `name_sources` and `alias_sources` say which episodes said the name and
    each alias. An alias exists only while it has a source, so erasing the last episode that said
    a name removes it (see erase.py for the entity's own name)."""

    id: str
    name: str
    type: str = "Entity"
    aliases: list[str] = field(default_factory=list)
    match_root: str | None = None  # the match decision (chain) that created it; gives its confidence
    summary: str = ""
    created_at: datetime = field(default_factory=utcnow)
    name_sources: list[str] = field(default_factory=list)  # episodes that said `name`
    alias_sources: dict[str, list[str]] = field(default_factory=dict)  # alias -> episodes

    def names(self) -> set[str]:
        return {norm(n) for n in (self.name, *self.aliases) if norm(n)}

    def add_name(self, name: str, sources: list[str]) -> bool:
        """Record that `sources` said `name`: the entity's name, else an alias. Never makes an
        alias without a source. Gives whether anything changed."""
        sources = [s for s in sources if s]
        if not sources or not norm(name):
            return False
        if norm(name) == norm(self.name):
            have = self.name_sources
        else:
            alias = next((a for a in self.aliases if norm(a) == norm(name)), None)
            if alias is None:
                alias = name.strip()
                self.aliases.append(alias)
            have = self.alias_sources.setdefault(alias, [])
        fresh = [s for s in sources if s not in have]
        have += fresh
        return bool(fresh)

    @property
    def named_by_human(self) -> bool:
        """On the person's word list: it stays when no fact points at it."""
        return HUMAN in self.name_sources or any(HUMAN in s for s in self.alias_sources.values())

    def forget_episode(self, episode_id: str) -> None:
        """Take an erased episode out of every source list; drop aliases left with none."""
        if episode_id in self.name_sources:
            self.name_sources.remove(episode_id)
        for alias in list(self.aliases):
            src = self.alias_sources.get(alias, [])
            if episode_id in src:
                src.remove(episode_id)
            if not src:
                self.aliases.remove(alias)
                self.alias_sources.pop(alias, None)


@dataclass
class StoredFact:
    """A fact edge. `source_name`/`target_name` are the names as said in the episode that wrote
    it, fixed then, so the service's fact id (a hash of the names) stays the same when maintenance
    re-points the edge. `variants` keeps each supporting episode's own words
    (episode -> [text, source name, target name]); `text_episode` says whose words are shown, so
    an erase can switch to a surviving episode's words."""

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
    heard: str = "known"  # known: the owner or a recognised speaker said it | unknown: nobody known did
    source_match: str | None = None  # root of the match decision that linked its subject
    target_match: str | None = None
    variants: dict[str, list[str]] = field(default_factory=dict)
    text_episode: str | None = None

    def say(self, episode_id: str, words: list[str]) -> None:
        """Keep this episode's own wording of the fact."""
        self.variants.setdefault(episode_id, list(words))

    def unsay(self, episode_id: str) -> bool:
        """Forget an episode's words. If they were the ones shown, show a surviving supporting
        episode's words instead. Gives False when no supporting episode's words are left."""
        self.variants.pop(episode_id, None)
        if self.text_episode != episode_id:
            return True
        nxt = next((e for e in self.episodes if e in self.variants), None)
        if nxt is None:
            return False
        self.text, self.source_name, self.target_name = self.variants[nxt]
        self.text_episode = nxt
        return True

    @property
    def closed(self) -> bool:
        return self.invalid_at is not None

    def to_engine(self, hints: list[EvidenceRef] | None = None,
                  confidence: float | None = None) -> EngineFact:
        return EngineFact(engine_id=self.id, source=self.source_name, relation=self.relation,
                          target=self.target_name, text=self.text, valid_at=self.valid_at,
                          invalid_at=self.invalid_at, episodes=list(self.episodes), human=self.human,
                          source_entity_id=self.source_id, target_entity_id=self.target_id,
                          hints=list(hints or []), confidence=confidence, heard=self.heard)


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
    key: str  # a digest of what was decided (never clear text: it can name a person)
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
    episode_id: str | None = None  # the episode it came from (a review inherits its root's)

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
