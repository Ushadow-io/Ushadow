"""The HTTP ledger client against the real response shapes (recorded, no network)."""

from __future__ import annotations

import httpx
import pytest

from memory_service.ledger_client import HttpLedgerClient, LedgerUnavailable
from tests.helpers import T0, USER_A

CONV = {"id": "c1", "revision": 2, "closedAt": "2024-01-10T09:01:00Z",
        "range": {"start": "2024-01-10T09:00:00Z", "end": "2024-01-10T09:01:00Z"},
        "parts": [{"recordingId": "r1", "range": {"start": "2024-01-10T09:00:00Z",
                                                  "end": "2024-01-10T09:01:00Z"}}]}
ACTIVE = {"conversation": CONV, "fragments": [], "state": None, "retired": False}
RETIRED = {"conversation": {"id": "c9", "revision": 3}, "fragments": [], "state": None,
           "retired": True, "retiredAt": "2024-01-11T00:00:00Z", "replacedBy": ["c10", "c11"]}
TRANSCRIPT = {"recordingId": "r1", "revision": "v2", "createdAt": "2024-01-10T09:05:00Z",
              "status": "provisional", "segments": []}
CORRECTION = {"id": "k1", "recordingId": "r1", "range": {"start": "2024-01-10T09:00:00Z",
                                                          "end": "2024-01-10T09:00:09Z"},
              "text": "fixed", "recordedAt": "2024-01-10T10:00:00Z"}
ERASURE = {"id": "er1", "userId": USER_A, "recordingId": "r1", "gapId": "g1",
           "range": CORRECTION["range"], "erasedAt": "2024-01-10T11:00:00Z", "segmentsRemoved": 3,
           "correctionsRemoved": 0, "momentsRemoved": 0, "audioPointerRemoved": True}
ROUTES = {"/conversations": [ACTIVE, RETIRED], "/conversations/changes": [RETIRED, ACTIVE],
          "/recordings/r1/transcripts": [TRANSCRIPT, {**TRANSCRIPT, "revision": "v3"}],
          "/recordings/r1/corrections": [CORRECTION], "/erasures": [ERASURE]}


def make() -> tuple[HttpLedgerClient, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json=ROUTES[req.url.path])

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return HttpLedgerClient("http://ledger:8200", "secret", http), seen


def make_with(path: str, body: object, headers: dict[str, str]) -> HttpLedgerClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json=body if r.url.path == path else [], headers=headers)))
    return HttpLedgerClient("http://ledger:8200", "secret", http)


async def test_conversations_unwrap_items_and_ask_for_retired():
    ledger, seen = make()
    items = await ledger.conversations(USER_A, T0, T0.replace(hour=10), include_retired=True)
    assert [(i.conversation_id, i.retired) for i in items] == [("c1", False), ("c9", True)]
    assert items[0].conversation is not None and items[0].conversation.revision == 2
    assert items[1].conversation is None and items[1].replaced_by == ["c10", "c11"]
    assert items[1].retired_at is not None
    assert seen[0].url.params["includeRetired"] == "true"
    await ledger.conversations(USER_A, T0, T0.replace(hour=10))
    assert "includeRetired" not in seen[1].url.params


async def test_changes_sends_since_and_user():
    ledger, seen = make()
    page = await ledger.changes(USER_A, T0)
    assert [i.conversation_id for i in page.items] == ["c9", "c1"]
    assert page.cursor == T0  # no header, no changedAt: the cursor stays at `since`
    assert seen[0].url.path == "/conversations/changes"
    assert seen[0].url.params["userId"] == USER_A and "since" in seen[0].url.params
    assert seen[0].headers["authorization"] == "Bearer secret"


async def test_transcripts_carry_status_corrections_and_erasures_parse():
    ledger, _ = make()
    ts = await ledger.transcripts(USER_A, "r1")
    assert [t.status for t in ts] == ["provisional", "provisional"]
    [c] = await ledger.corrections(USER_A, "r1")
    assert c.text == "fixed"
    [e] = await ledger.erasures(USER_A)
    assert e.id == "er1" and e.recordingId == "r1"


async def test_a_wrapped_answer_is_refused_not_guessed():
    http = httpx.AsyncClient(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"conversations": []})))
    ledger = HttpLedgerClient("http://ledger:8200", "secret", http)
    with pytest.raises(ValueError):
        await ledger.conversations(USER_A, T0, T0.replace(hour=10))


async def test_changes_cursor_is_the_ledger_header():
    items = [{**RETIRED, "changedAt": "2024-01-11T00:00:00.000005Z"}]
    ledger = make_with("/conversations/changes", items,
                       {"X-Ledger-Cursor": "2024-01-11T00:00:00.000005Z"})
    page = await ledger.changes(USER_A, T0)
    assert page.items[0].changed_at == page.cursor
    assert page.cursor.isoformat() == "2024-01-11T00:00:00.000005+00:00"


async def test_changes_cursor_falls_back_to_last_changed_at():
    items = [{**RETIRED, "changedAt": "2024-01-11T00:00:00Z"},
             {**ACTIVE, "changedAt": "2024-01-12T00:00:00Z"}]
    page = await make_with("/conversations/changes", items, {}).changes(USER_A, T0)
    assert page.cursor.isoformat() == "2024-01-12T00:00:00+00:00"


async def test_a_refused_token_is_a_clean_error_without_the_user_or_the_body():
    http = httpx.AsyncClient(transport=httpx.MockTransport(
        lambda r: httpx.Response(401, json={"detail": "Kim lives in Quokkaville"})))
    ledger = HttpLedgerClient("http://ledger:8200", "wrong", http)
    with pytest.raises(LedgerUnavailable) as err:
        await ledger.transcripts(USER_A, "r1")
    msg = str(err.value)
    assert "401" in msg and "/recordings/{id}/transcripts" in msg and "LEDGER_TOKEN" in msg
    assert USER_A not in msg and "r1" not in msg and "Quokkaville" not in msg


async def test_an_unreachable_ledger_is_a_clean_error():
    def down(r: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    http = httpx.AsyncClient(transport=httpx.MockTransport(down))
    ledger = HttpLedgerClient("http://ledger:8200", "t", http)
    with pytest.raises(LedgerUnavailable, match="could not be reached"):
        await ledger.erasures(USER_A)
