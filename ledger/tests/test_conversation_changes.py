"""Retired conversations and the change feed (the memory service contract), and conversation
id stability when a conversation grows at the start."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import httpx
import pytest

from ledger.main import create_app
from ledger.models import DecisionRequest, IngestRequest
from ledger.schema import CaptureBundle, LinkKind
from ledger.services import build_services
from ledger.stores import build_stores
from tests.conftest import TOKEN, fake_models, new_db
from tests.fixtures.l2_day import DAY, DAY_RANGE, USER, l2_day
from tests.l2_helpers import l2_services

DAY_Q = {"start": "2026-11-14T00:00:00Z", "end": "2026-11-15T00:00:00Z"}
EPOCH = "2000-01-01T00:00:00Z"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
async def app_and_services(monkeypatch):
    monkeypatch.setenv("LEDGER_TOKEN", TOKEN)
    monkeypatch.delenv("LEDGER_TOKENS", raising=False)
    app = create_app(db=object(), sweep=False)
    services = l2_services()
    app.state.services = services
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ledger") as http:
        yield http, services


async def _changes(http, since: str) -> tuple[list[dict], str]:
    resp = await http.get(
        "/conversations/changes", params={"userId": USER, "since": since}, headers=AUTH
    )
    assert resp.status_code == 200
    return resp.json(), resp.headers["X-Ledger-Cursor"]


def _t(value: str) -> datetime:
    return datetime.fromisoformat(value)


async def _join_rec_x(services) -> str:
    """Human join of rec-x (13:00) into the plumber conversation; returns rec-x's old id."""
    views = await services.conversations.list(USER, None)
    target = views[3].conversation.id
    why = await services.conversations.why(USER, target)
    opened = next(d.link for d in why.decisions if d.role == "opened_by")
    req = DecisionRequest(
        userId=USER,
        kind=LinkKind.continues,
        fromId=opened.fromId,
        toId=opened.toId,
        key=opened.key,
        retracts=opened.id,
    )
    await services.conversations.decide(req)
    return target


async def test_change_feed_orders_changes_and_a_repeat_with_the_cursor_is_empty(app_and_services):
    http, services = app_and_services
    body = {"userId": USER, "bundle": json.loads(l2_day().model_dump_json())}
    assert (await http.post("/ingest", json=body, headers=AUTH)).status_code == 200
    run = {"userId": USER, "range": DAY_Q}
    assert (await http.post("/pipeline/run", json=run, headers=AUTH)).status_code == 200

    first, cursor = await _changes(http, EPOCH)
    assert len(first) == 4 and not any(i["retired"] for i in first)
    times = [_t(i["changedAt"]) for i in first]
    assert times == sorted(times) and len(set(times)) == 4  # strictly increasing per owner
    assert _t(cursor) == times[-1]
    assert (await _changes(http, cursor))[0] == []

    retired_id = await _join_rec_x(services)  # a rebuild between the two reads
    second, cursor2 = await _changes(http, cursor)
    by_id = {i["conversation"]["id"]: i for i in second}
    assert [_t(i["changedAt"]) for i in second] == sorted(_t(i["changedAt"]) for i in second)
    assert _t(second[0]["changedAt"]) > _t(cursor)
    gone = by_id[retired_id]
    merged = next(i for i in second if not i["retired"])
    assert gone["retired"] is True and gone["retiredAt"]
    assert gone["replacedBy"] == [merged["conversation"]["id"]]
    assert merged["conversation"]["revision"] == 2
    for key in ("title", "summary", "citations"):
        assert gone["conversation"].get(key) is None
    assert gone["state"] is None and all(f["topic"] is None for f in gone["fragments"])
    assert (await _changes(http, cursor2))[0] == []

    plain = await http.get("/conversations", params={"userId": USER, **DAY_Q}, headers=AUTH)
    assert [i["retired"] for i in plain.json()] == [False, False, False]
    params = {"userId": USER, **DAY_Q, "includeRetired": "true"}
    full = (await http.get("/conversations", params=params, headers=AUTH)).json()
    assert len(full) == 4 and [i["conversation"]["id"] for i in full if i["retired"]] == [
        retired_id
    ]


async def test_change_feed_needs_a_timezone_and_auth(app_and_services):
    http, _ = app_and_services
    params = {"userId": USER, "since": "2026-11-14T00:00:00"}
    assert (
        await http.get("/conversations/changes", params=params, headers=AUTH)
    ).status_code == 422
    params["since"] += "Z"
    assert (await http.get("/conversations/changes", params=params)).status_code == 401


# ---- id stability: growth at the start keeps the id ----


def _only(*rec_ids: str) -> IngestRequest:
    day = l2_day()
    bundle = CaptureBundle(
        schemaVersion=day.schemaVersion,
        range=day.range,
        recordings=[r for r in day.recordings if r.id in rec_ids],
        transcripts=[t for t in day.transcripts if t.recordingId in rec_ids],
    )
    return IngestRequest(userId=USER, bundle=bundle)


async def _grow_at_start() -> tuple[str, list]:
    """rec-n (09:12) arrives first; rec-m (09:00, same talk) arrives an hour later."""
    clock = {"t": DAY + timedelta(hours=10)}
    services = build_services(
        build_stores(new_db()), clock=lambda: clock["t"], models=fake_models()
    )
    await services.ingest.ingest(_only("rec-n"))
    await services.conversations.run(USER, DAY_RANGE)
    (only_n,) = await services.conversations.list(USER, None)
    clock["t"] += timedelta(hours=1)
    await services.ingest.ingest(_only("rec-m"))
    result = await services.conversations.run(USER, DAY_RANGE)
    assert result.conversations.retired == 0
    views = await services.conversations.list(USER, None, include_retired=True)
    return only_n.conversation.id, [
        (v.conversation.id, v.conversation.revision, [p.recordingId for p in v.conversation.parts])
        for v in views
    ]


async def test_growth_at_the_start_keeps_the_id_and_three_replays_agree():
    runs = [await _grow_at_start() for _ in range(3)]
    assert runs[0] == runs[1] == runs[2]
    first_id, views = runs[0]
    (only,) = views
    assert only[0] == first_id  # the same id, the next revision, now starting in rec-m
    assert only[1] == 2 and only[2][0] == "rec-m" and only[2][-1] == "rec-n"

    one_shot = l2_services(behaviour=None)  # all evidence at once: anchored on rec-m
    await one_shot.ingest.ingest(_only("rec-m", "rec-n"))
    await one_shot.conversations.run(USER, DAY_RANGE)
    (view,) = await one_shot.conversations.list(USER, None)
    assert view.conversation.id != first_id
