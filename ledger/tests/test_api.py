"""HTTP contract: the shapes the Chronicle adapter and the UI use."""

from __future__ import annotations

import json

from ledger.models import DUPLICATE_POLICY
from tests.fixtures.bundle import USER, golden_day

DAY = {"start": "2026-11-14T00:00:00Z", "end": "2026-11-15T00:00:00Z"}


def _body() -> dict:
    return {"userId": USER, "bundle": json.loads(golden_day().model_dump_json())}


async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200 and resp.json()["status"] == "ok"


async def test_ingest_erase_decide_over_http(client):
    first = (await client.post("/ingest", json=_body())).json()
    second = (await client.post("/ingest", json=_body())).json()
    assert first["recordings"]["created"] == 5
    assert second["recordings"]["present"] == 5 and second["segments"]["created"] == 0

    recs = (await client.get("/recordings", params={"userId": USER, **DAY})).json()
    assert len(recs) == 5
    moments = (await client.get("/moments", params={"userId": USER, **DAY})).json()
    assert moments and {"key", "status", "attempts", "range"} <= set(moments[0])

    erase = await client.post(
        "/erase",
        json={
            "userId": USER,
            "recordingId": "rec-a",
            "range": {"start": "2026-11-14T11:02:00Z", "end": "2026-11-14T11:03:00Z"},
        },
    )
    assert erase.status_code == 200 and erase.json()["segmentsRemoved"] == 4
    gaps = (await client.get("/gaps", params={"userId": USER, **DAY})).json()
    assert {g["cause"] for g in gaps} == {"not_recording", "excluded"}

    key = f"duplicate_of:rec-tv:rec-tv-copy:{DUPLICATE_POLICY}"
    decided = await client.post(
        "/decisions",
        json={
            "userId": USER,
            "kind": "unrelated",
            "fromId": "rec-tv",
            "toId": "rec-tv-copy",
            "key": key,
            "reason": "different channels",
        },
    )
    assert decided.status_code == 200 and decided.json()["effective"]["decidedBy"] == "human"
    links = (await client.get("/links", params={"userId": USER, "effective": "true", **DAY})).json()
    assert [link["decidedBy"] for link in links if link["key"] == key] == ["human"]


async def test_http_errors(client):
    assert (
        await client.post("/erase", json={"userId": USER, "recordingId": "x"})
    ).status_code == 404
    bad = await client.post(
        "/decisions",
        json={
            "userId": USER,
            "kind": "unrelated",
            "fromId": "a",
            "toId": "b",
            "key": "k",
            "retracts": "missing",
        },
    )
    assert bad.status_code == 404
    assert (
        await client.get("/moments", params={"userId": USER, "start": DAY["start"]})
    ).status_code == 422
    assert (await client.post("/ingest", json={"bundle": {}})).status_code == 422
