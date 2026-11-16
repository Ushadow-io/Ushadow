"""Replay job: load a golden day (CaptureBundle JSON) through the ingest path.

    ledger-replay day.json --user-id USER                 # direct to Mongo (LEDGER_MONGO_URI)
    ledger-replay day.json --user-id USER --url http://localhost:8200   # via POST /ingest

The file holds a CaptureBundle, or an IngestRequest ({"userId", "bundle"}).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

from ledger.config import load_settings
from ledger.models import IngestRequest, IngestResult
from ledger.schema import CaptureBundle
from ledger.services import build_services
from ledger.stores import build_stores, ensure_indexes


def load_request(path: Path, user_id: str | None) -> IngestRequest:
    raw = json.loads(path.read_text())
    if "bundle" in raw:
        req = IngestRequest.model_validate(raw)
        return req.model_copy(update={"userId": user_id}) if user_id else req
    if not user_id:
        raise SystemExit("--user-id is required when the file is a bare CaptureBundle")
    return IngestRequest(userId=user_id, bundle=CaptureBundle.model_validate(raw))


async def replay_into(db: Any, req: IngestRequest) -> IngestResult:
    """The same ingest path the HTTP route uses."""
    await ensure_indexes(db)
    return await build_services(build_stores(db)).ingest.ingest(req)


def _post(url: str, req: IngestRequest) -> dict[str, Any]:
    http_req = urllib.request.Request(
        url.rstrip("/") + "/ingest",
        data=req.model_dump_json().encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(http_req, timeout=120) as resp:  # noqa: S310
        return json.loads(resp.read())


async def _direct(req: IngestRequest) -> dict[str, Any]:
    from motor.motor_asyncio import AsyncIOMotorClient

    settings = load_settings()
    client = AsyncIOMotorClient(settings.mongo_uri)
    try:
        result = await replay_into(client[settings.db_name], req)
    finally:
        client.close()
    return result.model_dump()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ledger-replay", description=__doc__.splitlines()[0])
    parser.add_argument("file", type=Path)
    parser.add_argument("--user-id")
    parser.add_argument("--url", help="POST to a running ledger instead of writing to Mongo")
    args = parser.parse_args(argv)
    req = load_request(args.file, args.user_id)
    result = _post(args.url, req) if args.url else asyncio.run(_direct(req))
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
