"""L1 check: does ingesting the SAME bundle twice cut new moments? Prints ids and counts only.

    uv run python eval/reingest_check.py tools/golden/2026-11-14.bundle.json
"""

import asyncio, sys
from collections import Counter
from pathlib import Path
from datetime import timedelta
from mongomock_motor import AsyncMongoMockClient
from ledger.llm import NullModel, Models
from ledger.replay import load_request
from ledger.services import build_services
from ledger.stores import build_stores

async def main(path):
    req = load_request(Path(path), "u")
    db = AsyncMongoMockClient()["x"]
    fixed = req.bundle.range.start + timedelta(days=2)
    s = build_services(build_stores(db), clock=lambda: fixed, models=Models(NullModel(), NullModel()))
    await s.ingest.ingest(req)
    a = Counter(d["body"]["recordingId"] for d in await s.stores.moments.find({}))
    first = {d["_id"] for d in await s.stores.moments.find({})}
    await s.ingest.ingest(req)
    docs = await s.stores.moments.find({})
    b = Counter(d["body"]["recordingId"] for d in docs)
    print("new moments per recording:", {k: b[k] - a.get(k, 0) for k in b if b[k] != a.get(k, 0)})
    links = [d["body"] for d in await s.stores.links.find({})]
    print("duplicate links:", [(l["fromId"], l["toId"]) for l in links if l["kind"] == "duplicate_of"])
    new = [d for d in docs if d["_id"] not in first]
    print("new moment statuses:", Counter(d["body"]["status"] for d in new), "segment counts:", [d["body"].get("segmentCount") for d in new])
asyncio.run(main(sys.argv[1]))
