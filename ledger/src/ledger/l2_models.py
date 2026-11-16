"""L2 (conversation layer) types: the rolling state, API views and run results.

`Conversation`, `Fragment`, `Link` and `EvidenceRef` come from life-datatypes. The types here
are ledger-only: the rolling state has no shared type, and the API envelopes add the
fragments and the decisions next to a Conversation.
"""

from __future__ import annotations

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from ledger.llm.structured import ModelStats
from ledger.schema import Conversation, Fragment, Link, TimeRange

# ---- Policies (a change of rules is a new version, not an edit of old records) ----

JOIN_POLICY = "join-v1"
SPLIT_POLICY = "split-v1"
STATE_POLICY = "state-v1"
CONVERSATION_POLICY = "conv-v2"  # v2: id anchored on the oldest moment
DAYPASS_POLICY = "daypass-v1"
COMPOSER_POLICY = "compose-v1"

TOPIC_MAX = 120
PEOPLE_MAX = 8
NAME_MAX = 40
THREADS_MAX = 5
THREAD_MAX = 100


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ConvState(BaseModel):
    """Rolling state of one open conversation. Bounded: longer values are cut, not refused."""

    model_config = ConfigDict(extra="ignore")

    topic: str = ""
    people: list[str] = Field(default_factory=list)
    threads: list[str] = Field(default_factory=list)

    @field_validator("topic", mode="before")
    @classmethod
    def _topic(cls, value: object) -> str:
        return str(value or "")[:TOPIC_MAX]

    @field_validator("people", mode="before")
    @classmethod
    def _people(cls, value: object) -> list[str]:
        items = value if isinstance(value, list) else []
        return [str(p)[:NAME_MAX] for p in items if p][:PEOPLE_MAX]

    @field_validator("threads", mode="before")
    @classmethod
    def _threads(cls, value: object) -> list[str]:
        items = value if isinstance(value, list) else []
        return [str(t)[:THREAD_MAX] for t in items if t][-THREADS_MAX:]


EMPTY_STATE = ConvState()
EMPTY_STATE_ID = "st-empty"


class ConversationView(_Strict):
    conversation: Conversation
    fragments: list[Fragment]
    state: ConvState | None = Field(default=None, description="Rolling state at the end")
    retired: bool = Field(
        default=False, description="No longer built; carries no title, summary or fragment text"
    )
    retiredAt: AwareDatetime | None = Field(default=None, description="Set when retired")
    replacedBy: list[str] | None = Field(
        default=None,
        description="Set when retired: the conversations that now cover its time range "
        "(empty after an erase that left nothing)",
    )
    changedAt: AwareDatetime | None = Field(
        default=None,
        description="Last change of revision, retired state, closedAt or composed text; "
        "the cursor for GET /conversations/changes",
    )


class WhyDecision(_Strict):
    role: str = Field(description="opened_by | joined | split | closed_by")
    source: str = Field(description="human | daypass | rule | model | fallback")
    link: Link | None = Field(description="None: a rule used for this build only (no model)")


class WhyView(_Strict):
    conversationId: str
    revision: int
    momentKeys: list[str]
    decisions: list[WhyDecision]


class RunRequest(_Strict):
    userId: str = Field(min_length=1)
    range: TimeRange


class ConversationCounts(_Strict):
    created: int = 0
    changed: int = 0
    unchanged: int = 0
    retired: int = 0
    composed: int = 0


class RunResult(_Strict):
    userId: str
    range: TimeRange
    moments: int
    conversations: ConversationCounts
    linksCreated: int
    model: ModelStats
