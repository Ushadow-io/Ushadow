"""Measure the staged engine on one day of a capture bundle. COUNTS ONLY on the console and in
metrics.json / report.md; the extracted facts go to facts.jsonl under --out (which must be
git-ignored, e.g. memory/service/eval/out/). Never prints transcript text, names or facts.

Episodes: one per conversation of `<day>.expected.json`, built by IMPORTING the spike's mapping
(memory/spike/s1/episodes.py, `build_episodes`, with no splitting: chunking is stage 1's job).

    cd memory/service
    uv run python eval/run_staged.py --bundle-dir DIR --day 2026-01-05 --group staged-eval-1 \\
        --reconcile collection --out eval/out/2026-01-05-collection [--fresh] [--maintain-budget 20] \\
        [--owner-name Stu] [--min-owner-words 20]
    # --owner-name: lines of that speaker get the role owner (as the Chronicle adapter does with
    # LEDGER_OWNER_NAMES), facts call the user by that name, and a conversation where the owner
    # said fewer than --min-owner-words words is skipped (the service's owner gate).
    # --stub: in-memory store and a scripted fake model (no network), for trying the script.

Real mode reads MEMORY_LLM_* / MEMORY_EMBED_* / MEMORY_NEO4J_* and the MEMORY_STAGED_* settings.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
import time
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any

from memory_service.engine.staged import FakeLLM, MemoryGraphStore, StagedEngine, StagedSettings
from memory_service.engine.staged import confidence as conf
from memory_service.engine.staged.factory import make_staged_engine
from memory_service.engine.staged.llm import LLMRequest
from memory_service.models import EpisodeInput, EpisodeLine
from memory_service.textutil import norm

SPIKE = Path(__file__).resolve().parents[2] / "spike"


def build_episodes(bundle_dir: Path, day: str, owners: frozenset[str] = frozenset()) -> list[EpisodeInput]:
    """`owners`: normalised speaker names that are the user; their lines get the role owner."""
    sys.path.insert(0, str(SPIKE))
    from s1.episodes import build_episodes as spike_build  # type: ignore[import-not-found]
    from s1.episodes import load_json, pick_transcripts  # type: ignore[import-not-found]

    bundle = load_json(bundle_dir / f"{day}.bundle.json")
    exp_path = bundle_dir / f"{day}.expected.json"
    expected = load_json(exp_path) if exp_path.exists() else None
    revision = {rec: t["revision"] for rec, t in pick_transcripts(bundle).items()}
    eps, _ = spike_build(bundle, expected, day, max_chars=0)
    return [EpisodeInput(name=ep.episode_id, reference_time=ep.reference_time, lines=[
        EpisodeLine(recording_id=ln.recording_id, transcript_revision=revision[ln.recording_id],
                    start=ln.start, end=ln.end, speaker=ln.speaker, text=ln.text,
                    role="owner" if norm(ln.speaker) in owners else ln.role)
        for ln in ep.lines]) for ep in eps]


# ---- stub mode: a scripted model that needs no network -------------------------------------------

_WORD = re.compile(r"\b([A-Z][a-z]{2,})\b")


def _stub_extract(req: LLMRequest) -> dict[str, Any]:
    facts, names = [], set()
    for line in req.payload:
        words = [w for w in _WORD.findall(line["text"]) if w not in {"The", "And", "But", "Yes", "Okay"}]
        if len(words) >= 2:
            names.update(words[:2])
            facts.append({"subject": words[0], "relation": "mentioned with", "object": words[1],
                          "fact": f"{words[0]} mentioned with {words[1]}", "lines": [line["ref"]],
                          "valid_from": None, "valid_until": None, "quote": None})
    return {"entities": [{"name": n, "type": "Entity", "aliases": []} for n in sorted(names)], "facts": facts}


def stub_llm() -> FakeLLM:
    def each(answer: dict[str, Any]):
        return lambda r: {"decisions": [{"id": it["id"], **answer} for it in r.payload]}

    return FakeLLM({"extract": _stub_extract,
                    "match": each({"answer": "inconclusive", "candidate": None, "certainty": "low"}),
                    "reconcile": each({"answer": "new", "known_ids": [], "certainty": "medium"}),
                    "review": lambda r: {"answer": "distinct", "candidate": None, "certainty": "high"},
                    "dup_facts": each({"same": False})}, model="stub")


def owner_gate(eps: list[EpisodeInput], min_words: int) -> list[EpisodeInput]:
    """The service's owner gate: keep a conversation only if the owner said enough words."""
    return [ep for ep in eps
            if sum(len(ln.text.split()) for ln in ep.lines if ln.role == "owner") >= max(min_words, 1)]


# ---- running and counting -------------------------------------------------------------------------


def check_out_dir(out: Path) -> None:
    """--out inside a git work tree must be git-ignored (facts.jsonl holds private words)."""
    out.mkdir(parents=True, exist_ok=True)
    inside = subprocess.run(["git", "-C", str(out), "rev-parse", "--is-inside-work-tree"],
                            capture_output=True, text=True).stdout.strip() == "true"
    probe = out / "facts.jsonl"
    if inside and subprocess.run(["git", "-C", str(out), "check-ignore", "-q", str(probe)]).returncode != 0:
        raise SystemExit("--out is inside the repo but not git-ignored; use memory/service/eval/out/")


async def run_episodes(eng: StagedEngine, group: str, eps: list[EpisodeInput]) -> dict[str, Any]:
    failures: dict[str, int] = {}
    for n, ep in enumerate(eps, start=1):
        t0, before = time.perf_counter(), eng.llm.meter.total()
        error = None
        try:
            await eng.add_episode(group, ep)
        except Exception as exc:  # noqa: BLE001 - counted by type; the message can quote text
            error = type(exc).__name__
            failures[error] = failures.get(error, 0) + 1
        after = eng.llm.meter.total()
        print(f"  [{n}/{len(eps)}] lines={len(ep.lines)} calls={after.calls - before.calls} "
              f"tokens={after.input_tokens - before.input_tokens}+"
              f"{after.output_tokens - before.output_tokens} "
              f"{time.perf_counter() - t0:.1f}s" + (f" ERROR {error}" if error else ""), flush=True)
    return failures


async def maintain(eng: StagedEngine, group: str, budget: int) -> dict[str, int]:
    out = {"batches": 0, "llm_calls": 0, "entities_merged": 0, "facts_merged": 0}
    while budget > out["llm_calls"]:
        rep = await eng.maintain(group, min(eng.cfg.maintain_budget, budget - out["llm_calls"]))
        out["batches"] += 1
        for k in ("llm_calls", "entities_merged", "facts_merged"):
            out[k] += getattr(rep, k)
        if not rep.more or rep.llm_calls == 0:
            break
    return out


async def counts(eng: StagedEngine, group: str) -> dict[str, Any]:
    facts = await eng.facts(group)
    decisions = await eng.store.decisions(group)
    matches = [d for d in decisions if d.kind == "entity_match"]
    current = await eng.store.current_decisions(group, sorted({d.root for d in matches}))
    by = {f"{k}_by_{w}": sum(1 for d in decisions if d.kind == k and d.decided_by == w)
          for k in ("entity_match", "fact_reconcile") for w in ("rule", "model", "human")}
    return {
        "entities": len({i for f in facts for i in (f.source_entity_id, f.target_entity_id) if i}),
        "facts": len(facts), "facts_closed": sum(1 for f in facts if f.closed),
        "entities_uncertain": sum(1 for d in current.values() if d.confidence < eng.cfg.review_below),
        "decisions": by, "tally": dict(sorted(eng.tally.items())),
        "confidence_bands": {"entity_matches": conf.bands(d.confidence for d in current.values()),
                             "facts": conf.bands(f.confidence or 0.0 for f in facts)},
    }


def write_report(out: Path, m: dict[str, Any]) -> None:
    rows = [f"| {k} | {v['calls']} | {v['input_tokens']} | {v['output_tokens']} | {v['seconds']:.1f} |"
            for k, v in m["stages"].items()]
    g = m["graph"]
    lines = [f"# Staged engine run: {m['day']} ({m['reconcile']})", "",
             f"Episodes {m['episodes']} (skipped by the owner gate {m['episodes_skipped_owner_gate']}), "
             f"lines {m['lines']} (by the owner {m['lines_by_owner']}), "
             f"failures {sum(m['failures'].values())} {m['failures'] or ''}", "",
             "| stage | calls | input tokens | output tokens | seconds |", "|---|---|---|---|---|", *rows, "",
             f"Entities {g['entities']}, facts {g['facts']}, closed {g['facts_closed']}, "
             f"entities uncertain {g['entities_uncertain']}", "",
             "Decisions: " + ", ".join(f"{k} {v}" for k, v in g["decisions"].items()), "",
             "Confidence bands: entity matches " + json.dumps(g["confidence_bands"]["entity_matches"])
             + ", facts " + json.dumps(g["confidence_bands"]["facts"]), "",
             "Maintenance: " + json.dumps(m["maintenance"]), ""]
    (out / "report.md").write_text("\n".join(lines), encoding="utf-8")


async def main(argv: list[str] | None = None) -> dict[str, Any]:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--bundle-dir", type=Path, required=True)
    p.add_argument("--day", required=True)
    p.add_argument("--group", required=True)
    p.add_argument("--reconcile", choices=("collection", "per_fact"), default="collection")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--stub", action="store_true", help="in-memory store + scripted model, no network")
    p.add_argument("--fresh", action="store_true", help="clear the group first")
    p.add_argument("--maintain-budget", type=int, default=0, help="model calls for maintenance after")
    p.add_argument("--owner-name", default="", help="the user's speaker name (else MEMORY_OWNER_NAME)")
    p.add_argument("--min-owner-words", type=int, default=20, help="owner gate, used with an owner name")
    a = p.parse_args(argv)
    check_out_dir(a.out)
    settings = replace(StagedSettings.from_env(), fact_reconcile=a.reconcile, maintain_inline=False)
    if a.owner_name:
        settings = replace(settings, owner_name=a.owner_name)
    owners = frozenset(norm(n) for n in (settings.owner_name, *settings.owner_aliases) if norm(n))
    if a.stub:
        eng = StagedEngine(MemoryGraphStore(), stub_llm(), replace(settings, store="memory"))
    else:
        eng = make_staged_engine(settings)
    if a.fresh:
        await eng.clear(a.group)
    found = build_episodes(a.bundle_dir, a.day, owners)
    eps = owner_gate(found, a.min_owner_words) if owners else found
    print(f"day {a.day}: {len(eps)} episodes ({len(found) - len(eps)} skipped by the owner gate), "
          f"reconcile={a.reconcile}", flush=True)
    t0 = time.perf_counter()
    failures = await run_episodes(eng, a.group, eps)
    lines = [ln for ep in eps for ln in ep.lines]
    m: dict[str, Any] = {"day": a.day, "reconcile": a.reconcile, "episodes": len(eps), "failures": failures,
                         "episodes_skipped_owner_gate": len(found) - len(eps), "lines": len(lines),
                         "lines_by_owner": sum(1 for ln in lines if ln.role == "owner"),
                         "wall_seconds": round(time.perf_counter() - t0, 2),
                         "settings": asdict(settings), "model": eng.llm.model}
    m["maintenance"] = await maintain(eng, a.group, a.maintain_budget)
    m["stages"] = eng.llm.meter.as_dict()
    m["graph"] = await counts(eng, a.group)
    (a.out / "metrics.json").write_text(json.dumps(m, indent=2, default=str), encoding="utf-8")
    with (a.out / "facts.jsonl").open("w", encoding="utf-8") as fh:  # private: only under --out
        for f in await eng.facts(a.group):
            fh.write(json.dumps({"id": f.engine_id, "text": f.text, "subject": f.source,
                                 "relation": f.relation, "object": f.target, "closed": f.closed,
                                 "confidence": f.confidence, "heard": f.heard,
                                 "episodes": len(f.episodes)}) + "\n")
    write_report(a.out, m)
    t = m["stages"]["total"]
    print(f"total calls={t['calls']} tokens={t['input_tokens']}+{t['output_tokens']} "
          f"facts={m['graph']['facts']} failures={sum(failures.values())}", flush=True)
    return m


if __name__ == "__main__":
    asyncio.run(main())
