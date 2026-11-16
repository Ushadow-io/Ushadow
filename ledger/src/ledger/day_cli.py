"""Run a day end to end, or compare it with Chronicle. Prints ids, times and counts only.

    ledger-day run <date>.bundle.json --user-id U [--url URL] [--fake]
    ledger-day compare <date>.expected.json --user-id U [--url URL]

Without --url it writes to Mongo (LEDGER_MONGO_URI / LEDGER_DB) and uses the model from
LEDGER_LLM_*. With --url it calls a running ledger and sends `Bearer $LEDGER_TOKEN`.
--fake uses the deterministic FakeModel (a dry run of the pipeline, not real quality).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from ledger import http_client
from ledger.compare import compare_table, ledger_rows
from ledger.config import load_settings
from ledger.llm import FakeModel, Models, load_models
from ledger.replay import load_request
from ledger.schema import TimeRange
from ledger.services import build_services
from ledger.stores import build_stores, ensure_indexes


def _range_json(rng: TimeRange) -> dict[str, str]:
    return json.loads(rng.model_dump_json())


async def _with_services(fn: Any, fake: bool) -> Any:
    from motor.motor_asyncio import AsyncIOMotorClient

    settings = load_settings()
    client = AsyncIOMotorClient(settings.mongo_uri)
    try:
        db = client[settings.db_name]
        await ensure_indexes(db)
        models = Models(FakeModel(), FakeModel(name="fake-composer")) if fake else load_models()
        return await fn(build_services(build_stores(db), models=models))
    finally:
        client.close()


def _run(args: argparse.Namespace) -> dict[str, Any]:
    req = load_request(args.file, args.user_id)
    rng = req.bundle.range
    if args.url:
        http_client.call(args.url, "POST", "/ingest", json.loads(req.model_dump_json()))
        body = {"userId": req.userId, "range": _range_json(rng)}
        result = http_client.call(args.url, "POST", "/pipeline/run", body)
        views = http_client.call(
            args.url, "GET", "/conversations", params={"userId": req.userId, **_range_json(rng)}
        )
        return {"run": result, "conversations": [r.__dict__ for r in ledger_rows(views)]}

    async def go(services: Any) -> dict[str, Any]:
        await services.ingest.ingest(req)
        result = await services.conversations.run(req.userId, rng)
        views = [
            json.loads(v.model_dump_json())
            for v in await services.conversations.list(req.userId, rng)
        ]
        return {
            "run": result.model_dump(mode="json"),
            "conversations": [r.__dict__ for r in ledger_rows(views)],
        }

    return asyncio.run(_with_services(go, args.fake))


def _views(args: argparse.Namespace, rng: TimeRange) -> list[dict[str, Any]]:
    if args.url:
        params = {"userId": args.user_id, **_range_json(rng)}
        return http_client.call(args.url, "GET", "/conversations", params=params)

    async def go(services: Any) -> list[dict[str, Any]]:
        views = await services.conversations.list(args.user_id, rng)
        return [json.loads(v.model_dump_json()) for v in views]

    return asyncio.run(_with_services(go, False))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ledger-day", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run", help="ingest a bundle and build its conversations")
    run.add_argument("file", type=Path)
    run.add_argument("--fake", action="store_true", help="use the deterministic fake model")
    cmp = sub.add_parser("compare", help="ledger conversations beside Chronicle's")
    cmp.add_argument("file", type=Path)
    for p in (run, cmp):
        p.add_argument("--user-id")
        p.add_argument("--url", help="a running ledger (sends Bearer $LEDGER_TOKEN)")
    args = parser.parse_args(argv)
    if args.cmd == "run":
        json.dump(_run(args), sys.stdout, indent=2, default=str)
        sys.stdout.write("\n")
        return 0
    if not args.user_id:
        raise SystemExit("--user-id is required")
    expected = json.loads(args.file.read_text())
    rng = TimeRange.model_validate(expected["range"])
    sys.stdout.write(compare_table(_views(args, rng), expected) + "\n")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
