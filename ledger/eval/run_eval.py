"""Run the L2 pipeline on a day with REAL models and measure it.

    cd ledger && uv run python eval/run_eval.py --day day1 --small Qwen3-1.7B-GGUF \
        --composer Qwen3.6-35B-A3B-MTP-GGUF --fresh 3 --same 3 --out eval/results/x.json
    uv run python eval/run_eval.py --golden tools/golden/2026-11-14.bundle.json ... \
        --out eval/out/x.json

Storage: mongomock (in memory) only. A "fresh" run is a new empty ledger; a "same" run runs
the pipeline again on the ledger of the first fresh run (it must ask no model and give the
same result).

Model server: LEDGER_LLM_BASE_URL (default http://127.0.0.1:18080/v1). Calls are sequential
(the walk is sequential), so the concurrency against the server is 1.

--golden (PRIVATE real days): the output file holds ids, times and counts only. No transcript
text, title, summary or model answer is written or printed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE / "days")]

from mongomock_motor import AsyncMongoMockClient  # noqa: E402

import ledger.llm.client as llm_client  # noqa: E402
from ledger.llm import HttpModelConfig, ModelRequest, Models, OpenAICompatModel  # noqa: E402
from ledger.services import build_services  # noqa: E402
from ledger.stores import build_stores  # noqa: E402

BASE = os.environ.get("LEDGER_LLM_BASE_URL", "http://127.0.0.1:18080/v1")
TOLERANCE_S = 30.0
USER = "eval-user"


@dataclass
class CallLog:
    layer: str
    model: str
    seconds: float
    in_chars: int
    out_chars: int
    raw: str | None  # synthetic days only
    server_ms: float | None = None  # prompt_ms + predicted_ms reported by the server
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    finish: str | None = None
    reasoning_chars: int = 0


@dataclass
class Recorder:
    keep_text: bool
    calls: list[CallLog] = field(default_factory=list)
    problems: list[tuple[str, str]] = field(default_factory=list)  # (layer, problem)


_LAST: dict[str, Any] = {}
_orig_content = llm_client._content


def _capture(data: dict[str, Any]) -> str:
    """Keep the server's usage and timings of the last answer (sizes only, no text)."""
    _LAST.clear()
    usage, timings = data.get("usage") or {}, data.get("timings") or {}
    choice = (data.get("choices") or [{}])[0]
    _LAST.update(
        server_ms=(timings.get("prompt_ms") or 0) + (timings.get("predicted_ms") or 0)
        if timings else None,
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
        finish=choice.get("finish_reason"),
        reasoning_chars=len((choice.get("message") or {}).get("reasoning_content") or ""),
    )
    return _orig_content(data)


llm_client._content = _capture


class Timed:
    """Wraps a model client: wall time and sizes per call."""

    def __init__(self, inner: OpenAICompatModel, rec: Recorder) -> None:
        self._inner = inner
        self._rec = rec
        self.name = inner.name

    async def complete(self, req: ModelRequest) -> str:
        t0 = time.monotonic()
        try:
            out = await self._inner.complete(req)
        except Exception:
            self._rec.calls.append(
                CallLog(req.layer, self.name, time.monotonic() - t0,
                        len(req.system) + len(req.user), -1, None)
            )
            raise
        self._rec.calls.append(
            CallLog(req.layer, self.name, time.monotonic() - t0, len(req.system) + len(req.user),
                    len(out), out if self._rec.keep_text else None, **_LAST)
        )
        c = self._rec.calls[-1]
        print(f"  call {req.layer} {self.name} wall={c.seconds:.1f}s server={c.server_ms}ms "
              f"tok={c.prompt_tokens}/{c.completion_tokens} finish={c.finish}",
              file=sys.stderr, flush=True)
        return out


class ProblemLog(logging.Handler):
    PAT = re.compile(r"layer=(\w+) attempt=\d+ problem=(\S+)")

    def __init__(self, rec: Recorder) -> None:
        super().__init__(logging.INFO)
        self._rec = rec

    def emit(self, record: logging.LogRecord) -> None:
        m = self.PAT.search(record.getMessage())
        if m:
            self._rec.problems.append((m.group(1), m.group(2)))


def models_for(small: str, composer: str, rec: Recorder, timeout: float) -> Models:
    def client(name: str) -> Timed:
        cfg = HttpModelConfig(base_url=BASE, model=name, timeout=timeout, transport_retries=1)
        return Timed(OpenAICompatModel(cfg), rec)

    return Models(small=client(small), composer=client(composer))


def clock_after(day_start: datetime):
    fixed = day_start + timedelta(days=2)
    return lambda: fixed


async def links_summary(stores) -> dict[str, int]:
    out: dict[str, int] = {}
    for doc in await stores.links.find({}):
        body = doc.get("body", doc)
        reason = body.get("reason") or ""
        head = reason if reason.startswith("split_rejected") else reason.split(":")[0]
        key = f"{body.get('decidedBy')}:{head}:{body.get('kind')}"
        if body.get("reason", "") and ":model_invalid" in body.get("reason", ""):
            key += ":model_invalid"
        out[key] = out.get(key, 0) + 1
    return dict(sorted(out.items()))


async def state_fallbacks(stores) -> int:
    return sum(1 for d in await stores.states.find({}) if d["body"].get("decidedBy") == "rule")


def conv_rows(views, keep_text: bool) -> list[dict[str, Any]]:
    rows = []
    for v in views:
        c = v.conversation
        row = {
            "id": c.id,
            "start": c.range.start.isoformat(),
            "end": c.range.end.isoformat(),
            "parts": [[p.recordingId, p.range.start.isoformat(), p.range.end.isoformat()]
                      for p in c.parts],
            "citations": len(c.citations or []),
            "composed": bool(c.title),
        }
        if keep_text:
            row["title"] = c.title
            row["summary"] = c.summary
            row["citationQuotes"] = [x.quote for x in c.citations or []]
        rows.append(row)
    return sorted(rows, key=lambda r: r["start"])


def call_stats(calls: list[CallLog]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for layer in sorted({c.layer for c in calls}):
        cs = [c for c in calls if c.layer == layer]
        secs = sorted(c.seconds for c in cs)
        out[layer] = {
            "calls": len(cs),
            "secondsTotal": round(sum(secs), 1),
            "secondsMedian": round(secs[len(secs) // 2], 2),
            "secondsMax": round(secs[-1], 2),
            "inCharsMax": max(c.in_chars for c in cs),
            "inCharsMean": round(sum(c.in_chars for c in cs) / len(cs)),
            "outCharsMean": round(sum(max(c.out_chars, 0) for c in cs) / len(cs)),
            "transportFailures": sum(1 for c in cs if c.out_chars < 0),
            "serverSecondsTotal": round(sum(c.server_ms or 0 for c in cs) / 1000, 1),
            "serverSecondsMedian": round(
                sorted(c.server_ms or 0 for c in cs)[len(cs) // 2] / 1000, 2),
            "promptTokensMax": max((c.prompt_tokens or 0) for c in cs),
            "completionTokensMean": round(
                sum(c.completion_tokens or 0 for c in cs) / len(cs), 1),
            "finishLength": sum(1 for c in cs if c.finish == "length"),
            "withReasoning": sum(1 for c in cs if c.reasoning_chars),
        }
    return out


async def run_once(
    req, rng, db, models: Models, rec: Recorder, keep_text: bool, ingest: bool = True
) -> dict[str, Any]:
    stores = build_stores(db)
    services = build_services(stores, clock=clock_after(rng.start), models=models)
    rec.calls.clear()
    rec.problems.clear()
    if ingest:
        await services.ingest.ingest(req)
    t0 = time.monotonic()
    result = await services.conversations.run(req.userId, rng)
    wall = time.monotonic() - t0
    views = await services.conversations.list(req.userId, rng)
    out = {
        "wallSeconds": round(wall, 1),
        "moments": result.moments,
        "counts": result.conversations.model_dump(),
        "linksCreated": result.linksCreated,
        "stats": result.model.model_dump(),
        "calls": call_stats(rec.calls),
        "problems": [list(p) for p in rec.problems],
        "links": await links_summary(stores),
        "stateFallbacks": await state_fallbacks(stores),
        "conversations": conv_rows(views, keep_text),
    }
    if keep_text:
        out["raw"] = [[c.layer, round(c.seconds, 2), c.raw] for c in rec.calls]
    return out


# ---- scoring against the ground truth (synthetic days only) ----


def _t(s: str) -> datetime:
    return datetime.fromisoformat(s)


def score(run: dict[str, Any], built) -> dict[str, Any]:
    """Borders = conversation starts (the first is the day start, left out).
    A predicted border matches a true one within TOLERANCE_S (one to one, nearest first)."""
    truth = built.truth
    true_b = [(t.start, t.cid, t.first_seg) for t in truth[1:]]
    pred = [_t(c["start"]) for c in run["conversations"]]
    pred_b = pred[1:]
    rec_starts = {seg for seg, rec, *_ in built.segments if seg.endswith("-000")}
    used: set[int] = set()
    matched = []
    for tb, cid, seg in true_b:
        best = None
        for i, pb in enumerate(pred_b):
            d = abs((pb - tb).total_seconds())
            if i not in used and d <= TOLERANCE_S and (best is None or d < best[1]):
                best = (i, d)
        if best is not None:
            used.add(best[0])
            matched.append((cid, round(best[1], 1)))
    missed = [(cid, seg) for tb, cid, seg in true_b if cid not in {m[0] for m in matched}]
    wrong = [pred_b[i].isoformat() for i in range(len(pred_b)) if i not in used]
    missed_split = [c for c, seg in missed if seg not in rec_starts]
    wrong_join = [c for c, seg in missed if seg in rec_starts]
    # a predicted border inside a true conversation: classify by whether it is a recording start
    wrong_at_join = [w for w in wrong if _is_rec_start(w, built)]
    exact = sum(
        1
        for t in truth
        for c in run["conversations"]
        if abs((_t(c["start"]) - t.start).total_seconds()) <= TOLERANCE_S
        and abs((_t(c["end"]) - t.end).total_seconds()) <= TOLERANCE_S
    )
    n_true, n_pred = len(true_b), len(pred_b)
    return {
        "trueConversations": len(truth),
        "predConversations": len(pred),
        "trueBorders": n_true,
        "predBorders": n_pred,
        "matched": len(matched),
        "precision": round(len(matched) / n_pred, 2) if n_pred else None,
        "recall": round(len(matched) / n_true, 2) if n_true else None,
        "matchedOffsetsS": matched,
        "missedSplits": missed_split,
        "wrongJoins": wrong_join,
        "wrongBorders": wrong,
        "wrongBordersAtRecordingStart": len(wrong_at_join),
        "wrongSplits": len(wrong) - len(wrong_at_join),
        "exactConversations": exact,
    }


def _is_rec_start(iso: str, built) -> bool:
    t = _t(iso)
    return any(seg.endswith("-000") and abs((s - t).total_seconds()) < 0.01
               for seg, _r, s, *_ in built.segments)


def borders(run: dict[str, Any]) -> list[str]:
    return [c["start"] for c in run["conversations"]]


def border_diff(a: list[str], b: list[str]) -> dict[str, Any]:
    """How many borders of b have no border of a within 1 s, and the offsets of near ones."""
    ta, tb = [_t(x) for x in a], [_t(x) for x in b]
    only_b = [x for x in tb if not any(abs((x - y).total_seconds()) < 1 for y in ta)]
    only_a = [x for x in ta if not any(abs((x - y).total_seconds()) < 1 for y in tb)]
    near = []
    for x in only_b:
        d = min((abs((x - y).total_seconds()) for y in only_a), default=None)
        if d is not None:
            near.append(round(d, 1))
    return {"onlyInFirst": len(only_a), "onlyInOther": len(only_b), "nearestOffsetsS": near}


def first_minutes(req, minutes: float):
    """The same day with only its first recordings, up to `minutes` of recorded audio."""
    recs = sorted(req.bundle.recordings or [], key=lambda r: r.range.start)
    keep, total = [], 0.0
    for r in recs:
        if total >= minutes * 60:
            break
        keep.append(r)
        total += (r.range.end - r.range.start).total_seconds()
    ids = {r.id for r in keep}
    bundle = req.bundle.model_copy(update={
        "recordings": keep,
        "transcripts": [t for t in req.bundle.transcripts or [] if t.recordingId in ids],
    })
    print(f"first-minutes: {len(keep)} of {len(recs)} recordings, {total / 60:.1f} min",
          file=sys.stderr)
    return req.model_copy(update={"bundle": bundle})


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="synthetic day module (day1|day2)")
    ap.add_argument("--golden", type=Path, help="a PRIVATE golden bundle (counts only)")
    ap.add_argument("--small", required=True)
    ap.add_argument("--composer", required=True)
    ap.add_argument("--fresh", type=int, default=3)
    ap.add_argument("--same", type=int, default=3)
    ap.add_argument("--timeout", type=float, default=900)
    ap.add_argument("--first-minutes", type=float, help="golden: keep the first recordings "
                    "until this many minutes of recorded audio")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--same-reingest", action="store_true",
                    help="same-ledger runs ingest the bundle again first (L1 idempotence)")
    args = ap.parse_args()
    keep_text = args.golden is None
    rec = Recorder(keep_text=keep_text)
    logging.getLogger("ledger.llm").addHandler(ProblemLog(rec))
    logging.getLogger("ledger.llm").setLevel(logging.INFO)
    built = None
    if args.day:
        mod = __import__({"day1": "day1_saturday", "day2": "day2_workday"}[args.day])
        from synth import build, day_range

        built = build(mod.DAY, USER)
        req, rng = built.request, day_range(mod.DAY)
    else:
        from ledger.replay import load_request

        req = load_request(args.golden, USER)
        rng = req.bundle.range
        if args.first_minutes:
            req = first_minutes(req, args.first_minutes)
    models = models_for(args.small, args.composer, rec, args.timeout)
    report: dict[str, Any] = {
        "day": args.day or args.golden.name.split(".")[0],
        "firstMinutes": args.first_minutes,
        "sameReingest": args.same_reingest,
        "small": args.small,
        "composer": args.composer,
        "toleranceS": TOLERANCE_S,
        "startedAt": datetime.now(UTC).isoformat(),
        "fresh": [],
        "same": [],
    }
    if built is not None:
        report["truth"] = [[t.cid, t.start.isoformat(), t.end.isoformat(), t.note]
                           for t in built.truth]
        report["speechMinutes"] = round(built.speech_seconds / 60, 1)
    first_db = None
    for i in range(args.fresh):
        db = AsyncMongoMockClient()[f"ledger_eval_fresh_{i}"]
        first_db = first_db or db
        run = await run_once(req, rng, db, models, rec, keep_text)
        if built is not None:
            run["score"] = score(run, built)
        report["fresh"].append(run)
        _progress("fresh", i, run)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=1, default=str))
    for i in range(args.same):
        run = await run_once(req, rng, first_db, models, rec, keep_text, args.same_reingest)
        report["same"].append(
            {
                "wallSeconds": run["wallSeconds"],
                "modelCalls": sum(c["calls"] for c in run["calls"].values()),
                "identical": run["conversations"] == report["fresh"][0]["conversations"],
                "counts": run["counts"],
            }
        )
        _progress("same", i, run)
    fr = report["fresh"]
    report["stability"] = {
        "conversationsPerFreshRun": [len(r["conversations"]) for r in fr],
        "bordersVsRun1": [border_diff(borders(fr[0]), borders(r)) for r in fr[1:]],
    }
    report["finishedAt"] = datetime.now(UTC).isoformat()
    args.out.write_text(json.dumps(report, indent=1, default=str))
    print(json.dumps({k: report[k] for k in ("day", "small", "composer", "stability")}))
    return 0


def _progress(kind: str, i: int, run: dict[str, Any]) -> None:
    calls = {k: v["calls"] for k, v in run["calls"].items()}
    sc = run.get("score")
    extra = f" P={sc['precision']} R={sc['recall']}" if sc else ""
    print(f"{kind}#{i}: {len(run['conversations'])} conv, wall {run['wallSeconds']}s, "
          f"calls {calls}{extra}", flush=True)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
