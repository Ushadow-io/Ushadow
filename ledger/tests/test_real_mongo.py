"""Opt-in: the real store classes against a real MongoDB (replica set).

    LEDGER_TEST_MONGO_URI='mongodb://localhost:27017/?replicaSet=rs0&directConnection=true' \\
        uv run pytest -m real_mongo

Each test gets its own database `ledger_test_<random>` and drops it at the end, also on a
failure. No other database is read or written. Skipped when the env var is not set.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import timedelta

import pytest

from ledger.models import EraseRequest, IngestRequest
from ledger.schema import TimeRange
from ledger.services import build_services
from ledger.stores import _INDEXES, build_stores, ensure_indexes
from tests.conftest import fake_models, fixed_clock, make_services
from tests.fixtures.bundle import USER, golden_day, span
from tests.fixtures.l2_day import DAY_RANGE, l2_request
from tests.fixtures.l2_day import USER as L2_USER
from tests.l2_helpers import SPLIT, shape
from tests.test_live import REC, T0, final_post, live_post
from tests.test_live import USER as LIVE_USER

URI = os.environ.get("LEDGER_TEST_MONGO_URI")
PREFIX = "ledger_test_"

pytestmark = [
    pytest.mark.real_mongo,
    pytest.mark.skipif(not URI, reason="LEDGER_TEST_MONGO_URI not set"),
]


@pytest.fixture
async def db():
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(URI, serverSelectionTimeoutMS=5000)
    name = PREFIX + uuid.uuid4().hex[:12]
    assert name.startswith(PREFIX)  # never any other database
    try:
        database = client[name]
        await ensure_indexes(database)
        yield database
    finally:
        await client.drop_database(name)
        client.close()


async def test_every_index_the_code_uses_exists_after_startup(db):
    await ensure_indexes(db)  # a second start is a no-op
    for name, wanted in _INDEXES.items():
        info = await db[name].index_information()
        assert info["_id_"]["key"] == [("_id", 1)]  # the unique key every store relies on
        have = [list(i["key"]) for i in info.values()]
        for keys in wanted:
            assert [tuple(k) for k in keys] in [[tuple(k) for k in h] for h in have], (name, keys)


async def test_ingest_is_idempotent_also_when_two_posts_race(db):
    services = make_services(db)
    req = IngestRequest(userId=USER, bundle=golden_day())
    first, second = await asyncio.gather(services.ingest.ingest(req), services.ingest.ingest(req))
    assert first.refusals == [] and second.refusals == []
    again = await services.ingest.ingest(req)
    assert again.segments.created == 0 and again.recordings.created == 0
    assert again.moments.created == 0 and again.refusals == []
    single = make_services()  # the same bundle into the in-memory store
    await single.ingest.ingest(req)
    assert await db["segments"].count_documents({}) == len(await single.stores.segments.find({}))
    real_keys = [m.key for m in await services.query.moments(USER, None)]
    memory_keys = [m.key for m in await single.query.moments(USER, None)]
    assert real_keys == memory_keys and real_keys  # moment keys do not depend on the store


async def test_a_different_body_under_a_stored_key_is_refused(db):
    services = make_services(db)
    await services.ingest.ingest(IngestRequest(userId=USER, bundle=golden_day()))
    day = golden_day()
    rev1 = next(t for t in day.transcripts if t.recordingId == "rec-a" and t.revision == "rev-1")
    rev1.segments[0] = rev1.segments[0].model_copy(update={"text": "changed words"})
    result = await services.ingest.ingest(IngestRequest(userId=USER, bundle=day))
    assert result.segments.refused == 1 and result.refusals[0].type == "segment"
    stored = await services.stores.segments.segments(USER, "rec-a", "rev-1")
    assert "changed words" not in [s.text for s in stored]


async def test_provisional_live_then_final(db):
    clock = {"t": T0 + timedelta(seconds=60)}
    services = build_services(build_stores(db), clock=lambda: clock["t"])
    await services.ingest.ingest(live_post(0, 10))
    grown = await services.ingest.ingest(live_post(10, 30))
    assert grown.segments.created == 20
    await services.ingest.ingest(final_post())
    late = await services.ingest.ingest(live_post(30, 40))
    assert late.transcripts.frozen == 1 and late.refusals == []
    headers = await services.stores.transcripts.revisions(LIVE_USER, REC)
    assert [(h.revision, h.status.value) for h in headers] == [
        ("live", "provisional"),
        ("ver-1", "final"),
    ]
    rec = await services.stores.recordings.load(LIVE_USER, REC)
    assert rec.currentTranscriptRevision == "ver-1"


async def test_erase_then_replay_does_not_bring_words_back(db):
    services = make_services(db)
    req = IngestRequest(userId=USER, bundle=golden_day())
    await services.ingest.ingest(req)
    rng = span("11:02:00", "11:03:00")
    erasure = await services.erase.erase(EraseRequest(userId=USER, recordingId="rec-a", range=rng))
    assert erasure.segmentsRemoved == 4 and erasure.audioPointerRemoved
    again = await services.erase.erase(EraseRequest(userId=USER, recordingId="rec-a", range=rng))
    assert again == erasure  # idempotent: the first record stays
    await services.ingest.ingest(req)
    text = " ".join(str(d) for d in await db["segments"].find({}).to_list(None))
    assert "venue" not in text and "launch budget" in text
    gaps = await services.query.gaps(USER, TimeRange(start=rng.start, end=rng.end))
    assert [g.recordingId for g in gaps] == ["rec-a"]


async def test_full_day_through_m2_replays_identically_and_feeds_changes(db):
    services = build_services(build_stores(db), clock=fixed_clock, models=fake_models(SPLIT))
    await services.ingest.ingest(l2_request())
    await services.conversations.run(L2_USER, DAY_RANGE)
    first = await shape(services)
    links = await db["links"].count_documents({})
    assert len(first) == 4 and links > 0

    for _ in range(2):
        await services.ingest.ingest(l2_request())
        rerun = await services.conversations.run(L2_USER, DAY_RANGE)
        assert rerun.model.calls == 0 and rerun.linksCreated == 0
        assert await shape(services) == first
    assert await db["links"].count_documents({}) == links

    feed = await services.conversations.changes(L2_USER, DAY_RANGE.start)
    assert sorted(v.conversation.id for v in feed) == sorted(r[0] for r in first)
    times = [v.changedAt for v in feed]
    assert times == sorted(times) and len(set(times)) == len(times)
    assert await services.conversations.changes(L2_USER, times[-1]) == []
