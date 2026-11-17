"""Service models: what the memory port takes and gives, and the work-unit record."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from memory_service.schema import Conversation, ConversationPart, EvidenceRef, TimeRange


class ApiModel(BaseModel):
    """camelCase on the wire (like life-datatypes), snake_case in code."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class FactKind(StrEnum):
    knowledge = "knowledge"  # people, relations, preferences: the knowledge engine
    action = "action"  # tasks, commitments, decisions, constraints: the action-fact store


class UnitStatus(StrEnum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"
    superseded = "superseded"
    skipped = "skipped"  # owner gate: too few owner words; not ingested


# ---- episode text (built from ledger transcripts; never stored by us) -------------------------


class EpisodeLine(BaseModel):
    """One transcript segment that goes into an episode."""

    recording_id: str
    transcript_revision: str
    start: datetime
    end: datetime
    speaker: str
    role: str
    text: str

    def render(self) -> str:
        return f"[{self.start:%Y-%m-%d %H:%M:%S}Z] {self.speaker} ({self.role}): {self.text}"


class EpisodeInput(BaseModel):
    name: str  # our episode key: "<conversationId>@<revision>"
    reference_time: datetime
    lines: list[EpisodeLine]

    @property
    def body(self) -> str:
        return "\n".join(line.render() for line in self.lines)


# ---- work units -------------------------------------------------------------------------------


class WorkUnit(ApiModel):
    """One ingest job: one (user, conversation id, revision). Holds no transcript text."""

    id: str
    user_id: str
    conversation_id: str
    revision: int
    parts: list[ConversationPart]
    reference_time: AwareDatetime
    status: UnitStatus = UnitStatus.pending
    attempts: int = 0
    last_error: str | None = None  # an exception type name, never a message (it can quote text)
    next_attempt_at: AwareDatetime | None = None  # a failed unit is retried by the worker after this
    engine_episode_id: str | None = None
    facts_written: int = 0
    facts_rejected: int = 0
    actions_written: int = 0
    actions_rejected: int = 0
    updated_at: AwareDatetime | None = None

    @property
    def episode_key(self) -> str:
        return f"{self.conversation_id}@{self.revision}"

    @staticmethod
    def make_id(user_id: str, conversation_id: str, revision: int) -> str:
        return f"{user_id}|{conversation_id}|{revision}"


# ---- port requests ----------------------------------------------------------------------------


class IngestRequest(ApiModel):
    user_id: str = Field(min_length=1)
    conversation: Conversation
    reference_time: AwareDatetime | None = None  # default: the start of the conversation


class SyncRequest(ApiModel):
    """No range: pull what changed since the saved cursor. With start and end: that range."""

    user_id: str = Field(min_length=1)
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None

    @model_validator(mode="after")
    def _both_or_none(self) -> SyncRequest:
        if (self.start is None) != (self.end is None):
            raise ValueError("give both start and end, or neither")
        return self


class UserRequest(ApiModel):
    user_id: str = Field(min_length=1)


class RebuildRequest(ApiModel):
    user_id: str = Field(min_length=1)
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None


class Statement(ApiModel):
    """A knowledge fact as a human states it."""

    subject: str = Field(min_length=1)
    relation: str = Field(min_length=1)
    object: str = Field(min_length=1)
    text: str | None = None


class CorrectRequest(ApiModel):
    """A human correction. `retract` alone: the fact was wrong. With `statement` (knowledge) or
    `text` (action): the fact was wrong and this is what is true."""

    user_id: str = Field(min_length=1)
    fact_id: str = Field(min_length=1)
    retract: bool = False
    statement: Statement | None = None
    text: str | None = None
    due: str | None = None
    direction: str | None = None

    @model_validator(mode="after")
    def _something(self) -> CorrectRequest:
        if not self.retract and self.statement is None and self.text is None:
            raise ValueError("give retract=true, a statement or a text")
        return self


class ForgetRequest(ApiModel):
    user_id: str = Field(min_length=1)
    fact_ids: list[str] = Field(default_factory=list)
    entity_id: str | None = None

    @model_validator(mode="after")
    def _selector(self) -> ForgetRequest:
        if not self.fact_ids and not self.entity_id:
            raise ValueError("give factIds or entityId")
        return self


class EraseRequest(ApiModel):
    user_id: str = Field(min_length=1)
    recording_id: str = Field(min_length=1)
    range: TimeRange


class SearchFilters(ApiModel):
    kinds: list[FactKind] = Field(default_factory=lambda: [FactKind.knowledge, FactKind.action])
    include_closed: bool = False
    limit: int = Field(default=20, ge=1, le=200)


# ---- port answers -----------------------------------------------------------------------------


class MemoryFact(ApiModel):
    id: str
    user_id: str
    kind: FactKind
    key: str
    text: str | None = None
    subject: dict[str, str] | None = None
    about: list[str] = Field(default_factory=list)
    valid_at: datetime | None = None
    invalid_at: datetime | None = None
    source: str  # person | agent | sensor
    evidence: list[EvidenceRef] = Field(default_factory=list)
    direction: str | None = None
    due: str | None = None
    sensitivity: str | None = None


class MemoryEntity(ApiModel):
    id: str
    user_id: str
    name: str
    summary: str | None = None
    facts: list[MemoryFact] = Field(default_factory=list)


class Decision(ApiModel):
    """A human-wins row. Holds keys (hashes), not the words of the fact it overrides."""

    id: str
    user_id: str
    kind: FactKind
    op: str  # suppress | assert | suppress_entity
    key_hash: str
    payload: dict[str, Any] | None = None  # assert only: the human's own statement
    created_at: AwareDatetime


class FactDecision(ApiModel):
    """A human decision on one fact, as shown to a reader. No stored words except the human's
    own corrected statement (on `correct`). `kind`: correct (the human asserted this fact) |
    suppress (the human removed it: a retract or a forget, which the table stores alike)."""

    id: str
    fact_id: str
    kind: str
    by: str = "person"
    at: AwareDatetime
    statement: Statement | None = None  # correct, knowledge
    text: str | None = None  # correct, action
    due: str | None = None
    direction: str | None = None


class EraseReport(ApiModel):
    proofs_removed: int = 0
    facts_deleted: int = 0
    facts_kept: int = 0
    episodes_removed: int = 0
    episodes_reingested: int = 0
    closures_reopened: int = 0
    action_facts_erased: int = 0
    action_facts_erase_unsupported: int = 0


class SyncReport(ApiModel):
    units: list[WorkUnit] = Field(default_factory=list)
    retired: int = 0  # conversations undone because the ledger retired them
    erasures_applied: int = 0  # ledger erasures run here for the first time
    deferred: int = 0  # work held by another worker; the cursor did not move
    retried: int = 0  # earlier failed or waiting units that were run again during this sync
    cursor: AwareDatetime | None = None


class RebuildReport(ApiModel):
    conversations: int = 0
    units_done: int = 0
    units_skipped: int = 0
    units_failed: int = 0
    decisions_applied: int = 0
    erasures_applied: int = 0  # ledger erasures not yet applied here, taken in before the rebuild
