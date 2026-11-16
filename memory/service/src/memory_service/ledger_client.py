"""How the memory service reads the ledger: HTTP only, never an import of ledger code.

Ledger routes used (all with `Authorization: Bearer $LEDGER_TOKEN`, all scoped by `userId`):
  GET /conversations?userId&start&end[&includeRetired=true]
        -> [{conversation, fragments, state, retired?, retiredAt?, replacedBy?}]
  GET /conversations/changes?userId&since -> the same items, retired included, ordered by
        `changedAt`; header `X-Ledger-Cursor` = the next `since` (items have changedAt > since)
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
from memory_service.textutil import iso, parse_iso

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
    changed_at: datetime | None = None  # the ledger's change time: its cursor, not our clock


class ChangePage(BaseModel):
    """One answer of the change feed. `cursor` is the ledger's own: pass it as the next `since`
    (strictly greater), so nothing is missed and nothing is read twice."""

    items: list[ConversationItem]
    cursor: datetime


class LedgerErasure(BaseModel):
    """The part of the ledger's Erasure record the memory service needs. It holds no words."""

    model_config = ConfigDict(extra="ignore")
    id: str
    recordingId: str
    range: TimeRange
    erasedAt: AwareDatetime | None = None


def parse_item(raw: dict[str, Any]) -> ConversationItem:
    """The one place that reads a ledger list item (`{conversation, fragments, state, ...}`)."""
    conv, changed = raw["conversation"], raw.get("changedAt")
    if raw.get("retired"):
        return ConversationItem(conversation_id=conv["id"], retired=True,
                                retired_at=raw.get("retiredAt"),
                                replaced_by=list(raw.get("replacedBy") or []), changed_at=changed)
    c = Conversation.model_validate(conv)
    return ConversationItem(conversation_id=c.id, conversation=c, changed_at=changed)


def page_cursor(header: str | None, items: list[ConversationItem], since: datetime) -> datetime:
    """The ledger's cursor: its `X-Ledger-Cursor` header, else the last item's changedAt, else
    `since`. Never earlier than `since` (a cursor that goes back would re-read)."""
    if header:
        cursor = parse_iso(header)
    else:
        stamps = [i.changed_at for i in items if i.changed_at is not None]
        cursor = max(stamps) if stamps else since
    return max(cursor, since)


class LedgerClient(Protocol):
    async def conversations(self, user_id: str, start: datetime, end: datetime,
                            include_retired: bool = False) -> list[ConversationItem]: ...

    async def changes(self, user_id: str, since: datetime) -> ChangePage: ...

    async def transcripts(self, user_id: str, recording_id: str) -> list[LedgerTranscript]: ...

    async def corrections(self, user_id: str, recording_id: str) -> list[TranscriptCorrection]: ...

    async def erasures(self, user_id: str) -> list[LedgerErasure]: ...


class LedgerUnavailable(RuntimeError):
    """The ledger refused or could not be reached. The message names the HTTP status and the
    route only: never the query (it holds the userId) and never a response body."""

    def __init__(self, path: str, status: int | None) -> None:
        self.path, self.status = path, status
        what = f"answered {status}" if status is not None else "could not be reached"
        hint = " (is LEDGER_TOKEN the token the ledger expects?)" if status in (401, 403) else ""
        super().__init__(f"ledger {what} for {path}{hint}")


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
        return (await self._fetch(path, params)).json()

    async def _fetch(self, path: str, params: dict[str, str]) -> httpx.Response:
        route = path if not path.startswith("/recordings/") else "/recordings/{id}/" + path.rsplit("/", 1)[-1]
        try:
            r = await self._http.get(self._base + path, params=params, headers=self._headers)
        except httpx.TransportError as exc:
            raise LedgerUnavailable(route, None) from exc
        if r.status_code != 200:
            raise LedgerUnavailable(route, r.status_code)
        return r

    async def conversations(self, user_id: str, start: datetime, end: datetime,
                            include_retired: bool = False) -> list[ConversationItem]:
        params = {"userId": user_id, "start": iso(start), "end": iso(end)}
        if include_retired:
            params["includeRetired"] = "true"
        return [parse_item(i) for i in _list(await self._get("/conversations", params), "conversations")]

    async def changes(self, user_id: str, since: datetime) -> ChangePage:
        r = await self._fetch("/conversations/changes", {"userId": user_id, "since": iso(since)})
        items = [parse_item(i) for i in _list(r.json(), "conversation changes")]
        return ChangePage(items=items, cursor=page_cursor(r.headers.get("x-ledger-cursor"), items,
                                                          since))

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

    async def changes(self, user_id: str, since: datetime) -> ChangePage:
        """Like the ledger: changedAt > since, oldest first, cursor = the last changedAt."""
        self.calls.append("changes")
        rows = sorted(((at, item) for item, at in self.convs.get(user_id, {}).values() if at > since),
                      key=lambda r: (r[0], r[1].conversation_id))
        items = [item.model_copy(update={"changed_at": at}) for at, item in rows]
        return ChangePage(items=items, cursor=rows[-1][0] if rows else since)

    async def transcripts(self, user_id: str, recording_id: str) -> list[LedgerTranscript]:
        return [t.model_copy(deep=True) for t in self.trans.get(user_id, {}).get(recording_id, [])]

    async def corrections(self, user_id: str, recording_id: str) -> list[TranscriptCorrection]:
        return list(self.corr.get(user_id, {}).get(recording_id, []))

    async def erasures(self, user_id: str) -> list[LedgerErasure]:
        return list(self.erased.get(user_id, []))
