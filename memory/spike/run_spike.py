"""S1 Graphiti spike harness. Throw-away code; see README.md.

  uv run python run_spike.py episodes --bundle-dir fixtures/synthetic     # no LLM, no Neo4j
  uv run python run_spike.py run --bundle-dir DIR --user stu --fresh [--rebuild]
  uv run python run_spike.py probes                                       # synthetic only
  uv run python run_spike.py precision out/facts_sample.csv
  uv run python run_spike.py reset                                        # wipe spike Neo4j
Add --stub-llm to run/probes to test the plumbing with a local fake endpoint.
"""

from __future__ import annotations

import os

# Must be set before graphiti_core is imported (it reads these at import / call time).
os.environ["GRAPHITI_TELEMETRY_ENABLED"] = "false"  # no PostHog telemetry from the spike
os.environ.setdefault("SEMAPHORE_LIMIT", "2")  # low concurrency for local models

import argparse  # noqa: E402
import asyncio  # noqa: E402
import json  # noqa: E402
import logging  # noqa: E402
import sys  # noqa: E402
from datetime import UTC, datetime  # noqa: E402
from importlib.metadata import version  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any  # noqa: E402

HERE = Path(__file__).resolve().parent


class _Redact(logging.Filter):
    """Library log messages can quote prompts (= transcript text). Keep only the
    logger name and level unless SPIKE_LOG_VERBOSE=1."""

    def filter(self, record: logging.LogRecord) -> bool:
        if record.name.split(".")[0] in {"graphiti_core", "openai", "httpx", "neo4j", "httpcore"}:
            record.msg = f"<redacted {len(str(record.msg))} chars>"
            record.args = None
            record.exc_info = None
            record.exc_text = None
        return True


def _logging() -> None:
    h = logging.StreamHandler(sys.stderr)
    h.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
    if os.environ.get("SPIKE_LOG_VERBOSE") != "1":
        h.addFilter(_Redact())
    logging.basicConfig(level=logging.WARNING, handlers=[h], force=True)
    logging.getLogger("neo4j.notifications").setLevel(logging.ERROR)  # "property does not exist" noise


def _days(args) -> list[tuple[str, list, Any]]:
    from s1.episodes import build_episodes, discover_days, load_json

    found = discover_days(Path(args.bundle_dir), args.days)
    if not found:
        sys.exit(f"no *.bundle.json in {args.bundle_dir}")
    out = []
    for day, bpath, epath in found:
        eps, info = build_episodes(
            load_json(bpath), load_json(epath) if epath else None, day,
            window_minutes=args.window_minutes, max_chars=args.max_chars,
            drop_roles=frozenset(x for x in args.drop_roles.split(",") if x),
            force_windows=args.windows)
        out.append((day, eps, info))
    return out


def cmd_episodes(args) -> None:
    from dataclasses import asdict

    for day, eps, info in _days(args):
        print(f"{day}: {len(eps)} episodes; mapping {json.dumps(asdict(info))}")
        for ep in eps:
            print("   ", json.dumps(ep.stats()))


async def _open(args):
    from s1.graph import Settings, SettingsError, make_graphiti
    from s1.instrument import CallLedger

    try:
        s = Settings.from_env(stub=args.stub_llm)
    except SettingsError as exc:
        sys.exit(str(exc))
    ledger = CallLedger()
    g = make_graphiti(s, ledger)
    await g.build_indices_and_constraints()
    return s, ledger, g


async def _probes(g, ledger, prefix: str, main_group: str | None, id_map, sample) -> list:
    from s1 import graph, probes

    out = []
    for fn in (probes.supersede, probes.separation):
        out.append(await _guard(fn.__name__, fn(g, prefix)))
    out.append(await _guard("human_fix", probes.human_fix(g, prefix, ledger)))
    out.append(await _guard("erase", probes.erase(g, prefix, ledger)))
    if main_group:
        out.append(await probes.provenance(g, main_group, id_map, sample))
        out[-1].name = "provenance (50-fact sample, real data)"
        out.append(await probes.provenance(g, main_group, id_map, None))
        out[-1].name = "provenance (all facts, real data)"
    else:
        out.append(await probes.provenance(g, f"{prefix}-supersede", None, None))
        out[-1].name = "provenance (synthetic supersede group)"
    for p in out:
        p.show()
    if not os.environ.get("SPIKE_KEEP_PROBES"):
        for suffix in ("supersede", "human", "erase", "user-a", "user-b"):
            await graph.delete_group(g, f"{prefix}-{suffix}")
    return out


async def _guard(name: str, coro):
    from s1.probes import ProbeResult

    try:
        return await coro
    except Exception as exc:  # synthetic text only, safe to show
        return ProbeResult(name, "UNCLEAR", f"probe crashed: {type(exc).__name__}: {exc}")


def _base_metrics(s, run_id: str) -> dict[str, Any]:
    return {"run_id": run_id, "graphiti_version": version("graphiti-core"),
            "started_at": datetime.now(UTC).isoformat(), "config": s.public()}


def _finish(out: Path, m: dict[str, Any], ledger, probes_res: list) -> None:
    from dataclasses import asdict

    from s1.report import write_report

    m["probes"] = [asdict(p) for p in probes_res]
    m["per_prompt_all_incl_probes_and_rebuild"] = ledger.per_prompt()
    from collections import Counter

    m["llm_failed_attempts_by_prompt_and_error"] = {
        f"{k[0]} / {k[1]}": v for k, v in sorted(Counter(
            (e["prompt"], e["error"]) for e in ledger.attempt_errors).items())}
    m["llm_failed_attempts"] = ledger.attempt_errors
    m["think_blocks_stripped"] = ledger.think_stripped
    m["finished_at"] = datetime.now(UTC).isoformat()
    (out / "metrics.json").write_text(json.dumps(m, indent=2, default=str), encoding="utf-8")
    (out / "calls.json").write_text(json.dumps(ledger.dump(), indent=1), encoding="utf-8")
    write_report(out / "report.md", m, probes_res)
    print(f"\nwrote {out / 'metrics.json'}, {out / 'report.md'}, {out / 'calls.json'}")


async def cmd_run(args) -> None:
    from s1 import graph, probes
    from s1.graph import GROUP_RE
    from s1.ingest import ingest
    from s1.report import totals, write_sample_csv

    if not GROUP_RE.match(args.user):
        sys.exit("--user must match [a-zA-Z0-9_-]+ (graphiti group_id rule)")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    days = _days(args)
    s, ledger, g = await _open(args)
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    try:
        if args.fresh:
            await graph.delete_group(g, args.user)
        existing = await graph.counts(g, args.user)
        if existing["episodes"] and not args.append:
            sys.exit(f"group {args.user!r} already has data {existing}; use --fresh or --append")
        m = _base_metrics(s, run_id) | {"group_id": args.user, "days": []}
        rows_all, id_map = [], {}
        errors = out / "errors.log"
        for day, eps, info in days:
            print(f"{day}: {len(eps)} episodes")
            rows, ids = await ingest(g, eps, args.user, ledger, errors)
            rows_all += rows
            id_map |= ids
            m["days"].append({"day": day, "mapping": vars(info), "episodes": rows})
        prices = (args.price_in, args.price_out) if args.price_in is not None else None
        m["totals"] = totals(rows_all, prices)
        m["per_prompt"] = ledger.per_prompt(exclude=("probe:", "rebuild:"))
        m["graph_counts"] = await graph.counts(g, args.user)
        run1 = await graph.edges(g, args.user)
        ents1 = [e["name"] for e in await graph.entities(g, args.user)]
        import re

        lab = re.compile(r"^\s*speaker[\s_-]*\d+\s*$", re.IGNORECASE)
        m["entities_that_are_speaker_labels"] = sum(1 for x in ents1 if lab.match(x or ""))
        m["entities_total"] = len(ents1)
        (out / "run1_entities.json").write_text(json.dumps(ents1, indent=1), encoding="utf-8")
        (out / "run1_facts.json").write_text(json.dumps(run1, indent=1), encoding="utf-8")
        (out / "episode_map.json").write_text(json.dumps(id_map, indent=1), encoding="utf-8")
        sample = probes.sample_edges(run1, args.sample, args.seed)
        write_sample_csv(out / "facts_sample.csv", sample, {v: k for k, v in id_map.items()})
        probe_res = [] if args.no_probes else await _probes(
            g, ledger, f"s1probe-{run_id}", args.user, id_map, sample)
        if args.no_probes:
            probe_res.append(await probes.provenance(g, args.user, id_map, sample))
            probe_res[-1].show()
        if args.rebuild:
            print("\nrebuild: clearing group and re-running the same episodes")
            await graph.delete_group(g, args.user)
            rows2 = []
            for _day, eps, _info in days:
                r2, _ = await ingest(g, eps, args.user, ledger, errors, label_prefix="rebuild:")
                rows2 += r2
            run2 = await graph.edges(g, args.user)
            ents2 = [e["name"] for e in await graph.entities(g, args.user)]
            (out / "run2_facts.json").write_text(json.dumps(run2, indent=1), encoding="utf-8")
            m["rebuild_totals"] = totals(rows2, prices)
            res = probes.rebuild_status(probes.compare_runs(run1, run2, ents1, ents2))
            res.show()
            probe_res.append(res)
        _finish(out, m, ledger, probe_res)
    finally:
        await g.close()


async def cmd_probes(args) -> None:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    s, ledger, g = await _open(args)
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    try:
        res = await _probes(g, ledger, f"s1probe-{run_id}", None, None, None)
        m = _base_metrics(s, run_id) | {"per_prompt": ledger.per_prompt(),
                                         "probe_calls": {p: ledger.for_episode(p) for p in sorted(
                                             {c.episode for c in ledger.calls})}}
        _finish(out, m, ledger, res)
    finally:
        await g.close()


async def cmd_reset(args) -> None:
    from graphiti_core.utils.maintenance.graph_data_operations import clear_data

    _, _, g = await _open(args)
    try:
        await clear_data(g.driver)
        print("spike Neo4j cleared")
    finally:
        await g.close()


def cmd_precision(args) -> None:
    from s1.report import precision

    print(json.dumps(precision(Path(args.csv)), indent=2))


def main() -> None:
    _logging()
    sys.path.insert(0, str(HERE))
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def mapping_args(sp):
        sp.add_argument("--bundle-dir", required=True)
        sp.add_argument("--days", nargs="*", help="only these dates (YYYY-MM-DD)")
        sp.add_argument("--window-minutes", type=int, default=10)
        sp.add_argument("--max-chars", type=int, default=16000, help="split longer episodes")
        sp.add_argument("--drop-roles", default="media", help="comma list of speaker roles")
        sp.add_argument("--windows", action="store_true", help="force fixed windows")

    def common(sp):
        sp.add_argument("--stub-llm", action="store_true", help="fake local endpoint (plumbing)")
        sp.add_argument("--out", default=str(HERE / "out"))

    sp = sub.add_parser("episodes", help="print episode mapping stats (no LLM, no Neo4j)")
    mapping_args(sp)
    sp = sub.add_parser("run", help="ingest days, measure, sample, probes")
    mapping_args(sp)
    common(sp)
    sp.add_argument("--user", default="user-a", help="group_id for this user's graph")
    sp.add_argument("--fresh", action="store_true", help="delete this group first")
    sp.add_argument("--append", action="store_true", help="allow a non-empty group")
    sp.add_argument("--rebuild", action="store_true", help="clear + re-run, compare (2x cost)")
    sp.add_argument("--no-probes", action="store_true")
    sp.add_argument("--sample", type=int, default=50)
    sp.add_argument("--seed", type=int, default=1337)
    sp.add_argument("--price-in", type=float, help="price per 1M input tokens")
    sp.add_argument("--price-out", type=float, help="price per 1M output tokens")
    sp = sub.add_parser("probes", help="synthetic probes only")
    common(sp)
    sp = sub.add_parser("reset", help="DELETE EVERYTHING in the spike Neo4j")
    common(sp)
    sp = sub.add_parser("precision", help="score the hand-checked facts_sample.csv")
    sp.add_argument("csv")

    args = p.parse_args()
    if args.cmd == "episodes":
        cmd_episodes(args)
    elif args.cmd == "precision":
        cmd_precision(args)
    else:
        asyncio.run({"run": cmd_run, "probes": cmd_probes, "reset": cmd_reset}[args.cmd](args))


if __name__ == "__main__":
    main()
