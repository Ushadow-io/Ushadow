"""`memory-rebuild --user <id> [--start ISO] [--end ISO]`: empty the engine for one user and
ingest again from the ledger. Human decisions are applied again. Prints counts only."""

from __future__ import annotations

import argparse
import asyncio
import json

from memory_service.config import load_settings
from memory_service.services.port import MemoryPort
from memory_service.textutil import parse_iso
from memory_service.wiring import build_deps


async def _run(args: argparse.Namespace) -> int:
    port = MemoryPort(await build_deps(load_settings()))
    rep = await port.rebuild(args.user, parse_iso(args.start) if args.start else None,
                             parse_iso(args.end) if args.end else None)
    print(json.dumps(rep.model_dump(by_alias=True)))
    return 0 if rep.units_failed == 0 else 1


def main() -> None:
    ap = argparse.ArgumentParser(prog="memory-rebuild", description=__doc__)
    ap.add_argument("--user", required=True)
    ap.add_argument("--start")
    ap.add_argument("--end")
    raise SystemExit(asyncio.run(_run(ap.parse_args())))
