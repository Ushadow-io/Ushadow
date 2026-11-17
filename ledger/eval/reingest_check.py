"""L1 check: does ingesting the SAME bundle again cut new moments or change L2? Ids and counts
only (golden bundles are private speech: never print text).

    uv run python eval/reingest_check.py tools/golden/2026-11-*.bundle.json

Per bundle: moments after 1, 2 and 3 ingests; then (fake model) a pipeline run, a re-ingest
and a second run: new Links, changed conversations and model calls of the second run.
"""

import asyncio
import sys
from datetime import timedelta
from pathlib import Path

from mongomock_motor import AsyncMongoMockClient

from ledger.llm import FakeModel, Models
from ledger.replay import load_request
from ledger.services import build_services
from ledger.stores import build_stores


async def check(path: str) -> None:
    req = load_request(Path(path), "u")
    fixed = req.bundle.range.start + timedelta(days=2)
    models = Models(FakeModel(name="fake-small"), FakeModel(name="fake-composer"))
    s = build_services(
        build_stores(AsyncMongoMockClient()["x"]), clock=lambda: fixed, models=models
    )
    counts, created = [], []
    for _ in range(3):
        result = await s.ingest.ingest(req)
        counts.append(len(await s.stores.moments.find({})))
        created.append(result.moments.created)
    first = await s.conversations.run("u", req.bundle.range)
    links = len(await s.stores.links.find({}))
    await s.ingest.ingest(req)
    again = await s.conversations.run("u", req.bundle.range)
    c = again.conversations
    print(
        f"{Path(path).name}: moments after 1/2/3 ingests {counts} (created {created}); "
        f"run 1: {first.conversations.created} conversations, {first.model.calls} model calls; "
        f"after re-ingest: {again.linksCreated} new links "
        f"({len(await s.stores.links.find({})) - links} stored), {c.created} created, "
        f"{c.changed} changed, {c.retired} retired, {again.model.calls} model calls"
    )


for arg in sys.argv[1:]:
    asyncio.run(check(arg))
