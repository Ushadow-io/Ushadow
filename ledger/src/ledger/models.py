"""Ledger-internal types and API shapes.

Evidence types come from life-datatypes (ledger.schema). The types here are either API
envelopes (life-datatypes has no owner field) or ledger-only work units (Moment).
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from ledger.schema import CaptureBundle, Link, LinkKind, TimeRange

# ---- Policies (a change of rules is a new version, not an edit of old records) ----

MOMENT_POLICY = "moments-v1"
DUPLICATE_POLICY = "dup-v1"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---- Moment (L1 work unit; not in the shared schema by design) ----


class MomentStatus(StrEnum):
    open = "open"
    ready = "ready"
    processing = "processing"
    done = "done"
    error = "error"


class Moment(_Strict):
    key: str = Field(description="hash(policyVersion, userId, recordingId, start, end)")
    userId: str
    recordingId: str
    range: TimeRange
    policyVersion: str
    transcriptRevision: str = Field(description="Revision the cut was made from")
    segmentCount: int
    wordCount: int
    contentRevision: str = Field(description="Revision whose text the moment now stands for")
    contentHash: str = Field(description="Hash of that text in the range; a change means re-run")
    status: MomentStatus = MomentStatus.ready
    attempts: int = 0
    reruns: int = Field(default=0, description="Times the content changed after the cut")
    createdAt: AwareDatetime


# ---- Ingest ----


class IngestRequest(_Strict):
    userId: str = Field(min_length=1, description="Owner of every record in the bundle")
    bundle: CaptureBundle


class TypeCounts(_Strict):
    created: int = 0
    present: int = 0
    extended: int = 0
    replaced: int = 0  # live (provisional) segments only
    excluded: int = 0  # dropped because the range was erased
    frozen: int = 0  # live posts after a final revision exists: accepted as no-ops
    refused: int = 0
    rerun: int = 0  # moments only: content changed, marked for a new run


class Refusal(_Strict):
    type: str
    id: str
    reason: str


class IngestResult(_Strict):
    recordings: TypeCounts = TypeCounts()
    transcripts: TypeCounts = TypeCounts()
    segments: TypeCounts = TypeCounts()
    corrections: TypeCounts = TypeCounts()
    gaps: TypeCounts = TypeCounts()
    links: TypeCounts = TypeCounts()
    moments: TypeCounts = TypeCounts()
    duplicateLinks: TypeCounts = TypeCounts()
    ignored: dict[str, int] = Field(
        default_factory=dict, description="Bundle lists M1 does not store"
    )
    refusals: list[Refusal] = Field(default_factory=list)


# ---- Erase ----


class EraseRequest(_Strict):
    userId: str = Field(min_length=1)
    recordingId: str
    range: TimeRange | None = Field(default=None, description="Not set: the whole recording")


class Erasure(_Strict):
    """The record that an erase happened. Holds no erased content."""

    id: str
    userId: str
    recordingId: str
    range: TimeRange
    gapId: str
    erasedAt: AwareDatetime
    segmentsRemoved: int
    correctionsRemoved: int
    momentsRemoved: int
    audioPointerRemoved: bool


# ---- Decisions ----


class DecisionRequest(_Strict):
    userId: str = Field(min_length=1)
    kind: LinkKind
    fromId: str
    toId: str | None = None
    at: AwareDatetime | None = None
    key: str = Field(
        min_length=1, description="The question decided; same key as the Link it overrides"
    )
    reason: str | None = None
    retracts: str | None = Field(default=None, description="Link.id this decision overrides")


class DecisionResponse(_Strict):
    link: Link
    created: bool
    effective: Link | None = Field(description="The Link that now answers the key")


class DecisionError(StrEnum):
    unknown_retracts = "unknown_retracts"
    key_mismatch = "key_mismatch"
    missing_target = "missing_target"
