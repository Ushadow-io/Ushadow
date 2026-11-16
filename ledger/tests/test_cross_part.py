"""Cross-part tests: the real Chronicle adapter mapping and the real export tool, into the
ledger over its own entry points (HTTP with auth; the `ledger-day run` CLI).

Both producers are loaded read-only from their files, so these tests check the contract the
parts really speak, not a copy of it. All text is made up.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import motor.motor_asyncio
import pytest
from mongomock_motor import AsyncMongoMockClient

from ledger import day_cli
from ledger.main import create_app
from ledger.services import build_services
from ledger.stores import build_stores
from tests.conftest import TOKEN, fake_models, new_db
from tests.test_live import CID, REC, T0, _facts, raw_segments

ROOT = Path(__file__).resolve().parents[1]
OWNER = "chronicle-user-1"  # the Chronicle account id: the ledger's userId
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # dataclasses look the module up while it loads
    spec.loader.exec_module(module)
    return module


mapping = _load("chronicle_mapping_x", ROOT / "adapters" / "chronicle" / "mapping.py")
export = _load("export_golden_days_x", ROOT / "tools" / "export_golden_days.py")


def _facts_of(seconds: float, final: bool) -> dict:
    return {**_facts(seconds, final), "user_id": OWNER}


def _plugin_posts() -> list[dict]:
    """What the plugin queues: live deltas (new or changed segments only), then the final."""
    posts, sent = [], {}
    for last in range(10, 61, 10):
        payload = {
            "conversation_id": CID,
            "segments": raw_segments()[:last],  # Chronicle re-sends the whole live transcript
            "timestamp_clock": "conversation",
        }
        delta, sent = mapping.new_or_changed(payload["segments"], sent)
        seconds = max(s["end"] for s in payload["segments"]) + 1
        facts = _facts_of(seconds, False)
        bundle, why = mapping.build_bundle(
            mapping.EVENT_STREAMING, {**payload, "segments": delta}, facts
        )
        assert bundle, why
        posts.append(mapping.ingest_request(facts["user_id"], bundle)[0])
    final_facts = _facts_of(420, True)
    bundle, why = mapping.build_bundle(
        mapping.EVENT_COMPLETE, {"conversation_id": CID}, final_facts
    )
    assert bundle, why
    posts.append(mapping.ingest_request(final_facts["user_id"], bundle)[0])
    return posts


@pytest.fixture
async def live_http(monkeypatch):
    monkeypatch.setenv("LEDGER_TOKEN", TOKEN)
    monkeypatch.delenv("LEDGER_TOKENS", raising=False)
    clock = {"t": T0}
    app = create_app(db=object(), sweep=False)
    app.state.services = build_services(
        build_stores(new_db()), clock=lambda: clock["t"], models=fake_models()
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://ledger") as http:
        yield http, clock


async def _get(http, path: str, **params) -> list[dict]:
    resp = await http.get(path, params={"userId": OWNER, **params}, headers=AUTH)
    assert resp.status_code == 200, resp.status_code
    return resp.json()


async def test_adapter_live_then_final_over_http_to_conversations_and_changes(live_http):
    http, clock = live_http
    posts = _plugin_posts()
    assert [p["bundle"]["transcripts"][0]["status"] for p in posts] == ["provisional"] * 6 + [
        "final"
    ]
    assert (await http.post("/ingest", json=posts[0])).status_code == 401  # auth is required

    for i, post in enumerate(posts[:-1]):
        clock["t"] = T0 + timedelta(seconds=i * 60 + 70)
        resp = await http.post("/ingest", json=post, headers=AUTH)
        assert resp.status_code == 200 and resp.json()["refusals"] == []
    live = await _get(http, f"/recordings/{REC}/transcripts")
    assert [(t["revision"], t["status"], len(t["segments"])) for t in live] == [
        ("live", "provisional", 60)
    ]
    assert await _get(http, "/moments"), "work starts during the conversation"

    clock["t"] = T0 + timedelta(seconds=430)
    final = await http.post("/ingest", json=posts[-1], headers=AUTH)
    assert final.status_code == 200 and final.json()["transcripts"]["created"] == 1
    late = (await http.post("/ingest", json=posts[2], headers=AUTH)).json()
    assert late["transcripts"]["frozen"] == 1 and late["refusals"] == []
    recordings = await _get(http, "/recordings")
    assert recordings[0]["currentTranscriptRevision"] == "ver-1"
    statuses = {
        t["revision"]: t["status"] for t in await _get(http, f"/recordings/{REC}/transcripts")
    }
    assert statuses == {"live": "provisional", "ver-1": "final"}
    moments = await _get(http, "/moments")
    assert moments and all(m["contentRevision"] == "ver-1" for m in moments)

    clock["t"] = T0 + timedelta(hours=2)  # quiet long enough: the conversation is closed
    day = {"start": "2026-11-14T00:00:00Z", "end": "2026-11-15T00:00:00Z"}
    run = await http.post("/pipeline/run", json={"userId": OWNER, "range": day}, headers=AUTH)
    assert run.status_code == 200 and run.json()["conversations"]["created"] >= 1
    convs = await _get(http, "/conversations", **day)
    assert convs and all(p["recordingId"] == REC for c in convs for p in c["conversation"]["parts"])
    assert all(c["conversation"]["closedAt"] and not c["retired"] for c in convs)

    resp = await http.get(
        "/conversations/changes",
        params={"userId": OWNER, "since": "2026-11-14T00:00:00Z"},
        headers=AUTH,
    )
    changes = resp.json()
    assert sorted(c["conversation"]["id"] for c in changes) == sorted(
        c["conversation"]["id"] for c in convs
    )
    assert resp.headers["X-Ledger-Cursor"].replace("Z", "+00:00") == changes[-1][
        "changedAt"
    ].replace("Z", "+00:00")
    again = await http.get(
        "/conversations/changes",
        params={"userId": OWNER, "since": resp.headers["X-Ledger-Cursor"]},
        headers=AUTH,
    )
    assert again.json() == []


# ---- an exported golden day through `ledger-day run` ----


def _chronicle_doc(cid: str, start: str, end: str, lines: list[str]) -> dict:
    """The Mongo shape the export tool reads (synthetic)."""
    return {
        "conversation_id": cid,
        "user_id": OWNER,
        "client_id": "omi-pendant",
        "deleted": False,
        "created_at": start,
        "audio_ranges": [
            {"capture_source_id": "omi-pendant:input:mic0", "started_at": start, "ended_at": end}
        ],
        "segments": [
            {"start": 6.0 * i, "end": 6.0 * i + 5, "text": t, "speaker": f"Speaker {i % 2}"}
            for i, t in enumerate(lines)
        ],
        "active_transcript_version": "v1",
        "end_reason": "user_stopped",
    }


def _exported_day(tmp_path: Path) -> Path:
    docs = [
        _chronicle_doc(
            "c-morning",
            "2026-11-14T09:00:00Z",
            "2026-11-14T09:20:00Z",
            [f"line {i} about the garden plan" for i in range(30)],
        ),
        _chronicle_doc(
            "c-noon",
            "2026-11-14T12:00:00Z",
            "2026-11-14T12:10:00Z",
            [f"line {i} about the kitchen tiles" for i in range(20)],
        ),
    ]
    privacy = [
        (
            "omi-pendant:input:mic0",
            datetime(2026, 11, 14, 9, 15, tzinfo=UTC),
            datetime(2026, 11, 14, 9, 16, tzinfo=UTC),
        )
    ]
    convs = [export.normalize_conversation(d) for d in docs]
    bundle, _ = export.build_bundle(convs, date(2026, 11, 14), "UTC", privacy=privacy)
    path = tmp_path / "2026-11-14.bundle.json"
    path.write_bytes(export.dump_json(bundle))
    return path


async def test_exported_bundle_runs_through_ledger_day(tmp_path, monkeypatch, capsys):
    path = _exported_day(tmp_path)
    bundle = json.loads(path.read_text())
    assert {t["status"] for t in bundle["transcripts"]} == {"final"}
    assert [(g["cause"], g.get("recordingId")) for g in bundle["gaps"]] == [
        ("excluded", "c-morning"),  # 09:15, inside the morning recording
        ("paused", None),  # 09:20-12:00, between recordings
    ]
    mongo = AsyncMongoMockClient()
    monkeypatch.setattr(motor.motor_asyncio, "AsyncIOMotorClient", lambda *a, **k: mongo)
    monkeypatch.setenv("LEDGER_DB", "ledger_day_test")

    # day_cli runs its own event loop; run it off this test's loop
    import asyncio

    code = await asyncio.to_thread(day_cli.main, ["run", str(path), "--user-id", OWNER, "--fake"])
    assert code == 0
    out = json.loads(capsys.readouterr().out)
    assert out["run"]["conversations"]["created"] == 2
    assert [r["note"] for r in out["conversations"]] == ["rev 1, 1 part(s)"] * 2
    assert "garden" not in json.dumps(out) and "kitchen" not in json.dumps(out)

    stores = build_stores(mongo["ledger_day_test"])
    gaps = {g.cause.value: g for g in await stores.gaps.list(OWNER)}
    assert gaps["excluded"].recordingId == "c-morning"
    headers = await stores.transcripts.revisions(OWNER, "c-morning")
    assert [(h.revision, h.status.value) for h in headers] == [("v1", "final")]
