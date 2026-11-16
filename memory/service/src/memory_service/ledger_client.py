"""How the memory service reads the ledger: HTTP only, never an import of ledger code.

Assumed ledger read routes (being built in parallel; shapes not yet verified against it):
  GET {LEDGER_URL}/conversations?userId&start&end -> [Conversation] or {"conversations": [...]}
  GET {LEDGER_URL}/recordings/{id}/transcripts?userId -> [Transcript] or {"transcripts": [...]}
Both with `Authorization: Bearer $LEDGER_TOKEN`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

import httpx

from memory_service.schema import Conversation, Transcript
from memory_service.textutil import iso


class LedgerClient(Protocol):
    async def conversations(self, user_id: str, start: datetime, end: datetime) -> list[Conversation]:
        ...

    async def transcripts(self, user_id: str, recording_id: str) -> list[Transcript]: ...


def _items(body: Any, key: str) -> list[Any]:
    if isinstance(body, dict):
        body = body.get(key, [])
    if not isinstance(body, list):
        raise ValueError(f"ledger answer for {key} is not a list")
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

    async def conversations(self, user_id: str, start: datetime, end: datetime) -> list[Conversation]:
        body = await self._get("/conversations", {"userId": user_id, "start": iso(start),
                                                   "end": iso(end)})
        return [Conversation.model_validate(c) for c in _items(body, "conversations")]

    async def transcripts(self, user_id: str, recording_id: str) -> list[Transcript]:
        body = await self._get(f"/recordings/{recording_id}/transcripts", {"userId": user_id})
        return [Transcript.model_validate(t) for t in _items(body, "transcripts")]

    async def aclose(self) -> None:
        await self._http.aclose()


class FakeLedger:
    """In-memory ledger for tests. It keeps the words: erasing them in the ledger is the
    ledger's job, so tests also prove the memory service drops erased ranges by itself."""

    def __init__(self) -> None:
        self.convs: dict[str, dict[str, Conversation]] = {}
        self.trans: dict[str, dict[str, list[Transcript]]] = {}

    def add_conversation(self, user_id: str, conv: Conversation) -> None:
        self.convs.setdefault(user_id, {})[conv.id] = conv

    def add_transcript(self, user_id: str, t: Transcript) -> None:
        self.trans.setdefault(user_id, {}).setdefault(t.recordingId, []).append(t)

    async def conversations(self, user_id: str, start: datetime, end: datetime) -> list[Conversation]:
        return [c for c in self.convs.get(user_id, {}).values()
                if c.range.start < end and start < c.range.end]

    async def transcripts(self, user_id: str, recording_id: str) -> list[Transcript]:
        return [t.model_copy(deep=True) for t in self.trans.get(user_id, {}).get(recording_id, [])]
