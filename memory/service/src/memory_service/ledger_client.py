"""How the memory service reads the ledger: HTTP only, never an import of ledger code.

Ledger routes used (all with `Authorization: Bearer $LEDGER_TOKEN`, all scoped by `userId`):
  GET /conversations?userId&start&end[&includeRetired=true]
        -> [{conversation, fragments, state, retired?, retiredAt?, replacedBy?}]
  GET /conversations/changes?userId&since -> the same items, retired included, ordered
  GET /recordings/{id}/transcripts?userId -> [Transcript + status (provisional | final)]
  GET /recordings/{id}/corrections?userId -> [TranscriptCorrection]
  GET /erasures?userId -> [Erasure]
A retired item carries no text: only its conversation id (and revision) is read from it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal, Protocol

import httpx
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from memory_service.schema import Conversation, TimeRange, Transcript, TranscriptCorrection
from memory_service.textutil import iso

EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


class LedgerTranscript(Transcript):
    """A ledger transcript with its `status`. Absent = final. Only final words are proof."""

    status: Literal["provisional", "final"] = "final"


class ConversationItem(BaseModel):
    """One entry of a ledger conversation list: the conversation and whether it is retired.
    `conversation` is None for a retired item (it carries no text); `conversation_id` is always set."""

    conversation_id: str
    conversation: Conversation | None = None
    retired: bool = False
    retired_at: datetime | None = None
    replaced_by: list[str] = Field(default_factory=list)


class LedgerErasure(BaseModel):
    """The part of the ledger's Erasure record the memory service needs. It holds no words."""

    model_config = ConfigDict(extra="ignore")
    id: str
    recordingId: str
    range: TimeRange
    erasedAt: AwareDatetime | None = None


def parse_item(raw: dict[str, Any]) -> ConversationItem:
    """The one place that reads a ledger list item (`{conversation, fragments, state, ...}`)."""
    conv = raw["conversation"]
    if raw.get("retired"):
        return ConversationItem(conversation_id=conv["id"], retired=True,
                                retired_at=raw.get("retiredAt"),
                                replaced_by=list(raw.get("replacedBy") or []))
    c = Conversation.model_validate(conv)
    return ConversationItem(conversation_id=c.id, conversation=c)


class LedgerClient(Protocol):
    async def conversations(self, user_id: str, start: datetime, end: datetime,
                            include_retired: bool = False) -> list[ConversationItem]: ...

    async def changes(self, user_id: str, since: datetime) -> list[ConversationItem]: ...

    async def transcripts(self, user_id: str, recording_id: str) -> list[LedgerTranscript]: ...

    async def corrections(self, user_id: str, recording_id: str) -> list[TranscriptCorrection]: ...

    async def erasures(self, user_id: str) -> list[LedgerErasure]: ...


def _list(body: Any, what: str) -> list[Any]:
    if not isinstance(body, list):
        raise ValueError(f"ledger answer for {what} is not a list")
    return body


class HttpLedgerClient:
    def __init__(self, base_url: str, token: str, http: httpx.AsyncClient | None = None) -> None:
        if not token:
            raise ValueError("LEDGER_TOKEN is required: the ledger refuses calls without it")
        self._base = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}"}
        self._http = http or httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0))

    async def _get(self, path: str, params: dict[str, str]) -> Any:
        r = await self._http.get(self._base + path, params=params, headers=self._headers)
        r.raise_for_status()
        return r.json()

    async def conversations(self, user_id: str, start: datetime, end: datetime,
                            include_retired: bool = False) -> list[ConversationItem]:
        params = {"userId": user_id, "start": iso(start), "end": iso(end)}
        if include_retired:
            params["includeRetired"] = "true"
        return [parse_item(i) for i in _list(await self._get("/conversations", params), "conversations")]

    async def changes(self, user_id: str, since: datetime) -> list[ConversationItem]:
        body = await self._get("/conversations/changes", {"userId": user_id, "since": iso(since)})
        return [parse_item(i) for i in _list(body, "conversation changes")]

    async def transcripts(self, user_id: str, recording_id: str) -> list[LedgerTranscript]:
        body = await self._get(f"/recordings/{recording_id}/transcripts", {"userId": user_id})
        return [LedgerTranscript.model_validate(t) for t in _list(body, "transcripts")]

    async def corrections(self, user_id: str, recording_id: str) -> list[TranscriptCorrection]:
        body = await self._get(f"/recordings/{recording_id}/corrections", {"userId": user_id})
        return [TranscriptCorrection.model_validate(c) for c in _list(body, "corrections")]

    async def erasures(self, user_id: str) -> list[LedgerErasure]:
        body = await self._get("/erasures", {"userId": user_id})
        return [LedgerErasure.model_validate(e) for e in _list(body, "erasures")]

    async def aclose(self) -> None:
        await self._http.aclose()


class FakeLedger:
    """In-memory ledger for tests, answering with the real shapes. It keeps the words: erasing
    them in the ledger is the ledger's job, so tests also prove the memory service drops erased
    ranges by itself. `clock` stamps each change so `changes(since)` can be tested."""

    def __init__(self, clock: Any = None) -> None:
        self.clock = clock or (lambda: datetime.now(UTC))
        self.convs: dict[str, dict[str, tuple[ConversationItem, datetime]]] = {}
        self.trans: dict[str, dict[str, list[LedgerTranscript]]] = {}
        self.corr: dict[str, dict[str, list[TranscriptCorrection]]] = {}
        self.erased: dict[str, list[LedgerErasure]] = {}
        self.calls: list[str] = []

    def add_conversation(self, user_id: str, conv: Conversation) -> None:
        self._put(user_id, ConversationItem(conversation_id=conv.id, conversation=conv))

    def retire(self, user_id: str, conv_id: str, replaced_by: list[str] | None = None) -> None:
        self._put(user_id, ConversationItem(conversation_id=conv_id, retired=True,
                                            retired_at=self.clock(), replaced_by=replaced_by or []))

    def _put(self, user_id: str, item: ConversationItem) -> None:
        self.convs.setdefault(user_id, {})[item.conversation_id] = (item, self.clock())

    def add_transcript(self, user_id: str, t: Transcript, status: str | None = None) -> None:
        data = t.model_dump(mode="json")
        data["status"] = status or getattr(t, "status", "final")
        self.trans.setdefault(user_id, {}).setdefault(t.recordingId, []).append(
            LedgerTranscript.model_validate(data))

    def add_correction(self, user_id: str, c: TranscriptCorrection) -> None:
        self.corr.setdefault(user_id, {}).setdefault(c.recordingId, []).append(c)

    def add_erasure(self, user_id: str, e: LedgerErasure) -> None:
        self.erased.setdefault(user_id, []).append(e)

    async def conversations(self, user_id: str, start: datetime, end: datetime,
                            include_retired: bool = False) -> list[ConversationItem]:
        self.calls.append("conversations")
        out = []
        for item, _ in self.convs.get(user_id, {}).values():
            if item.retired:
                if include_retired:
                    out.append(item)
            elif item.conversation and item.conversation.range.start < end and start < (
                    item.conversation.range.end):
                out.append(item)
        return out

    async def changes(self, user_id: str, since: datetime) -> list[ConversationItem]:
        self.calls.append("changes")
        rows = [(at, item) for item, at in self.convs.get(user_id, {}).values() if at > since]
        return [item for _, item in sorted(rows, key=lambda r: (r[0], r[1].conversation_id))]

    async def transcripts(self, user_id: str, recording_id: str) -> list[LedgerTranscript]:
        return [t.model_copy(deep=True) for t in self.trans.get(user_id, {}).get(recording_id, [])]

    async def corrections(self, user_id: str, recording_id: str) -> list[TranscriptCorrection]:
        return list(self.corr.get(user_id, {}).get(recording_id, []))

    async def erasures(self, user_id: str) -> list[LedgerErasure]:
        return list(self.erased.get(user_id, []))
