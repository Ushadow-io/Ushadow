"""Read API (L6) shapes: requests (HTTP query models = MCP tool arguments) and answers.

Every answer carries, next to its items:
- `evidence` on each item (recording id + time range + quote);
- `gaps`: the CaptureGaps that overlap the asked range, with their cause (G11);
- `withheld`: how many items the caller's scope removed (a count, never content) (G12);
- `partial` + `partialReasons` when a part (memory) could not answer.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from ledger.l2_models import ConvState
from ledger.schema import CaptureGap, EvidenceRef, Link, LinkKind, TimeRange


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ItemKind(StrEnum):
    conversation = "conversation"
    knowledge = "knowledge"
    action = "action"


# ---- scoped items (the gate filters every one of these, wherever it is in an answer) ----


class ScopedItem(_Strict):
    kind: ItemKind
    subKind: str | None = Field(
        default=None, description="action: task | commitment | decision | constraint"
    )
    sensitivity: str = Field(default="normal", description="Sensitivity; not set = normal")
    requires: list[str] = Field(
        default_factory=list, exclude=True,
        description="More scope classes the caller needs to see this (internal)",
    )

    @property
    def scope_class(self) -> str:
        return f"{self.kind.value}:{self.subKind}" if self.subKind else self.kind.value


class Item(ScopedItem):
    """A fact (from memory) or a conversation (from the ledger), with its proof."""

    id: str
    text: str | None = Field(default=None, description="Fact sentence, or conversation title")
    summary: str | None = Field(default=None, description="Conversation summary")
    at: datetime | None = Field(default=None, description="Fact valid from / conversation start")
    end: datetime | None = Field(default=None, description="Conversation end")
    validTo: datetime | None = Field(default=None, description="Fact closed at (not current)")
    open: bool | None = Field(default=None, description="Conversation still open")
    revision: int | None = None
    source: str | None = Field(default=None, description="Fact: person | agent | sensor")
    direction: str | None = Field(default=None, description="owed_by_me | owed_to_me")
    due: str | None = None
    about: list[str] = Field(default_factory=list, description="Entity ids")
    people: list[str] = Field(default_factory=list, description="Conversation: names heard")
    state: ConvState | None = None
    conversationId: str | None = Field(default=None, description="Action fact: made from")
    confidence: float | None = Field(default=None, description="Fact: 0..1, how sure memory is")
    heard: str | None = Field(default=None, description=(
        "Fact: known (the owner or a recognised speaker said it) | unknown (only unknown "
        "speakers did; can be media). Show unknown ones in another style"))
    evidence: list[EvidenceRef] = Field(default_factory=list)


class EntityCandidate(ScopedItem):
    id: str
    name: str
    summary: str | None = None
    match: Literal["exact", "partial"]
    facts: list[Item] = Field(default_factory=list)


class WhyStep(ScopedItem):
    role: str = Field(description="opened_by | joined | split | closed_by | asserted")
    decidedBy: str = Field(description="human | model | rule")
    source: str | None = Field(default=None, description="human | daypass | rule | model | ...")
    link: Link | None = None
    conversationId: str | None = Field(default=None, description="Step on this conversation")
    at: datetime | None = Field(default=None, description="Human decision: when")
    text: str | None = Field(default=None, description="Human decision: the human's own words")


# ---- answers ----


class Answer(_Strict):
    userId: str
    range: TimeRange | None = None
    gaps: list[CaptureGap] = Field(default_factory=list)
    withheld: int = Field(default=0, description="Items removed by the caller's scope")
    partial: bool = False
    partialReasons: list[str] = Field(default_factory=list)

    def after_scope(self) -> None:
        """Values computed from what the caller may see (run after the gate)."""


class ContextAnswer(Answer):
    now: AwareDatetime
    conversations: list[Item]
    people: list[EntityCandidate]


class ResolveAnswer(Answer):
    text: str
    candidates: list[EntityCandidate]
    ambiguous: bool = False
    resolved: str | None = Field(default=None, description="Set only when ONE candidate is left")

    def after_scope(self) -> None:
        self.ambiguous = len(self.candidates) > 1
        self.resolved = self.candidates[0].id if len(self.candidates) == 1 else None


class SearchAnswer(Answer):
    query: str
    items: list[Item]


class BriefAnswer(Answer):
    subject: dict[str, str] = Field(description="{kind: entity | conversation, id}")
    entity: EntityCandidate | None = None
    conversation: Item | None = None
    lastTalk: Item | None = None
    conversations: list[Item] = Field(default_factory=list)
    people: list[EntityCandidate] = Field(default_factory=list)
    openTasks: list[Item] = Field(default_factory=list)
    commitmentsByMe: list[Item] = Field(default_factory=list)
    commitmentsToMe: list[Item] = Field(default_factory=list)
    commitmentsOther: list[Item] = Field(default_factory=list)
    decisions: list[Item] = Field(default_factory=list)
    facts: list[Item] = Field(default_factory=list)


class TimelineAnswer(Answer):
    conversations: list[Item]


class WhyAnswer(Answer):
    target: dict[str, str]
    item: Item | None = None
    conversations: list[Item] = Field(
        default_factory=list, description="Fact: the conversations its evidence comes from"
    )
    steps: list[WhyStep] = Field(default_factory=list)


class WriteAnswer(_Strict):
    userId: str
    owner: Literal["memory", "ledger"]
    decisions: list[dict[str, Any]] = Field(
        default_factory=list, description="Human decisions written (ids, op; no fact words)"
    )
    link: Link | None = None
    effective: Link | None = None


class KnownEntity(_Strict):
    """One entry of the owner's word list: `name` and its other names are ONE entity."""

    id: str
    name: str
    aliases: list[str] = Field(default_factory=list)
    type: str | None = None
    at: datetime | None = None


class KnownEntitiesAnswer(_Strict):
    userId: str
    entities: list[KnownEntity] = Field(default_factory=list)


class RefusalCode(StrEnum):
    forbidden = "forbidden"
    not_found = "not_found"
    invalid = "invalid"
    conflict = "conflict"
    unavailable = "unavailable"


class Refusal(_Strict):
    code: RefusalCode
    detail: str


# ---- requests (GET query models; the same models are the MCP tool arguments) ----


class _Request(_Strict):
    userId: str = Field(min_length=1, description="Owner")


class ContextRequest(_Request):
    query: str | None = Field(default=None, description="Only conversations with these words")
    now: AwareDatetime | None = Field(default=None, description="Default: the server clock")
    hours: int = Field(default=6, ge=1, le=168, description="Look back this far from now")


class ResolveRequest(_Request):
    text: str = Field(min_length=1, max_length=200, description="A name")


class _Ranged(_Request):
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None

    @model_validator(mode="after")
    def _both(self) -> _Ranged:
        if (self.start is None) != (self.end is None):
            raise ValueError("give both start and end, or neither")
        if self.start and self.end and self.end < self.start:
            raise ValueError("end is before start")
        return self

    @property
    def range(self) -> TimeRange | None:
        return TimeRange(start=self.start, end=self.end) if self.start and self.end else None


class SearchRequest(_Ranged):
    q: str = Field(min_length=1, max_length=500)
    kinds: list[ItemKind] = Field(default_factory=lambda: list(ItemKind))
    includeClosed: bool = False
    limit: int = Field(default=20, ge=1, le=100)


class TimelineRequest(_Ranged):
    @model_validator(mode="after")
    def _needed(self) -> TimelineRequest:
        if self.range is None:
            raise ValueError("timeline needs start and end")
        return self


class _OneTarget(_Request):
    conversationId: str | None = None

    def _one(self, other: str | None, name: str) -> None:
        if (other is None) == (self.conversationId is None):
            raise ValueError(f"give exactly one of {name} or conversationId")


class BriefRequest(_OneTarget):
    entityId: str | None = None
    days: int = Field(default=90, ge=1, le=3650, description="Look back for the last talk")

    @model_validator(mode="after")
    def _target(self) -> BriefRequest:
        self._one(self.entityId, "entityId")
        return self


class WhyRequest(_OneTarget):
    factId: str | None = None

    @model_validator(mode="after")
    def _target(self) -> WhyRequest:
        self._one(self.factId, "factId")
        return self


class Statement(_Strict):
    subject: str = Field(min_length=1)
    relation: str = Field(min_length=1)
    object: str = Field(min_length=1)
    text: str | None = None


class FactCorrection(_Strict):
    factId: str = Field(min_length=1)
    retract: bool = False
    statement: Statement | None = None
    text: str | None = None
    due: str | None = None
    direction: str | None = None


class ConversationCorrection(_Strict):
    """A human decision on conversation structure (ledger /decisions)."""

    kind: LinkKind
    fromId: str
    toId: str | None = None
    at: AwareDatetime | None = None
    key: str = Field(min_length=1)
    reason: str | None = None
    retracts: str | None = None


class CorrectRequest(_Request):
    fact: FactCorrection | None = None
    conversation: ConversationCorrection | None = None

    @model_validator(mode="after")
    def _one(self) -> CorrectRequest:
        if (self.fact is None) == (self.conversation is None):
            raise ValueError("give exactly one of fact or conversation")
        return self


class ForgetRequest(_Request):
    factIds: list[str] = Field(default_factory=list, max_length=100)
    entityId: str | None = None

    @model_validator(mode="after")
    def _selector(self) -> ForgetRequest:
        if not self.factIds and not self.entityId:
            raise ValueError("give factIds or entityId")
        return self


ENTITY_TYPES = ("Person", "Place", "Organization", "Thing", "Topic", "Event", "Other")


class KnownEntityRequest(_Request):
    name: str = Field(min_length=1, max_length=200)
    aliases: list[str] = Field(default_factory=list, max_length=50)
    type: Literal[ENTITY_TYPES] | None = None  # type: ignore[valid-type]


class KnownEntityRemove(_Request):
    name: str = Field(min_length=1, max_length=200)


ReadRequest = ContextRequest | ResolveRequest | SearchRequest | BriefRequest | TimelineRequest | (
    WhyRequest
)
WriteRequest = CorrectRequest | ForgetRequest
