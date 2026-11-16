"""Write out/metrics.json, out/report.md and out/facts_sample.csv.

report.md and metrics.json hold counts, ids and SYNTHETIC probe text only.
facts_sample.csv holds real extracted facts: private, git-ignored.
"""

from __future__ import annotations

import csv
import json
import statistics
from pathlib import Path
from typing import Any

from .probes import ProbeResult


def _stats(vals: list[float]) -> dict[str, float | None]:
    if not vals:
        return {"n": 0, "mean": None, "median": None, "p90": None, "max": None, "sum": 0}
    s = sorted(vals)
    return {"n": len(s), "mean": round(statistics.fmean(s), 2),
            "median": round(statistics.median(s), 2),
            "p90": round(s[min(len(s) - 1, int(0.9 * len(s)))], 2), "max": s[-1],
            "sum": round(sum(s), 2)}


def totals(rows: list[dict[str, Any]], prices: tuple[float, float] | None) -> dict[str, Any]:
    ok = [r for r in rows if not r["error"]]
    keys = ["llm_http_calls", "llm_logical_calls", "input_tokens", "output_tokens", "wall_s",
            "embed_http_calls", "edges_new", "nodes_new", "edges_closed_existing", "chars"]
    out: dict[str, Any] = {"episodes": len(rows), "episodes_failed": len(rows) - len(ok),
                           "llm_usage_missing_calls": sum(r["llm_usage_missing"] for r in rows)}
    for k in keys:
        out[k] = _stats([float(r.get(k) or 0) for r in ok])
    if prices:
        cost = sum(r["input_tokens"] for r in rows) * prices[0] / 1e6 + \
            sum(r["output_tokens"] for r in rows) * prices[1] / 1e6
        out["cost_estimate_from_measured_tokens"] = round(cost, 4)
    return out


def write_sample_csv(path: Path, sample: list[dict[str, Any]], uuid_to_ours: dict[str, str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["edge_uuid", "fact", "relation", "source_entity", "target_entity",
                    "valid_at", "invalid_at", "expired_at", "created_at",
                    "source_episode_ids", "source_episode_uuids", "correct?", "notes"])
        for e in sample:
            w.writerow([e["uuid"], e["fact"], e["name"], e["source"], e["target"],
                        e["valid_at"] or "", e["invalid_at"] or "", e["expired_at"] or "",
                        e["created_at"] or "",
                        ";".join(uuid_to_ours.get(u, f"?{u}") for u in e["episodes"]),
                        ";".join(e["episodes"]), "", ""])


def _row(cells: list[Any]) -> str:
    return "| " + " | ".join(str(c) for c in cells) + " |"


def write_report(path: Path, m: dict[str, Any], probes: list[ProbeResult]) -> None:
    t = m.get("totals") or {}
    L = [f"# S1 Graphiti spike result ({m['run_id']})", "",
         f"graphiti-core {m['graphiti_version']}; config: `{json.dumps(m['config'])}`", ""]
    if m["config"].get("stub_llm"):
        L += ["> **STUB LLM RUN.** Plumbing test only: the stub returns empty extractions, so",
              "> counts and probe results say nothing about Graphiti quality.", ""]
    if t:
        L += ["## Per episode (successful episodes)", "",
              _row(["metric", "mean", "median", "p90", "max", "sum"]), _row(["---"] * 6)]
        for k in ["llm_http_calls", "llm_logical_calls", "input_tokens", "output_tokens",
                  "wall_s", "embed_http_calls", "edges_new", "nodes_new",
                  "edges_closed_existing", "chars"]:
            s = t[k]
            L.append(_row([k, s["mean"], s["median"], s["p90"], s["max"], s["sum"]]))
        L += ["", f"episodes: {t['episodes']}, failed: {t['episodes_failed']}, "
              f"LLM calls without usage data: {t['llm_usage_missing_calls']}"]
        if "cost_estimate_from_measured_tokens" in t:
            L.append(f"cost (measured tokens x configured price): "
                     f"{t['cost_estimate_from_measured_tokens']}")
        L += ["", "## Days", ""]
        for d in m["days"]:
            L.append(f"- {d['day']}: mode={d['mapping']['mode']}, episodes={len(d['episodes'])}, "
                     f"mapping={json.dumps({k: v for k, v in d['mapping'].items() if k != 'notes'})}"
                     f" notes={d['mapping']['notes']}")
        L += ["", "## LLM calls by prompt (main ingest only; probes and rebuild excluded)", "",
              _row(["prompt", "calls", "in tok", "out tok", "seconds"]), _row(["---"] * 5)]
        for name, s in m["per_prompt"].items():
            L.append(_row([name, s["llm_http_calls"], s["input_tokens"], s["output_tokens"],
                           s["llm_seconds"]]))
    L += ["", "## Probes", ""]
    for p in probes:
        L += [f"### [{p.status}] {p.name}", "", p.summary, ""]
        L += [f"- {x}" for x in p.evidence] + [""]
    L += ["## Hand check", "",
          "Fill `correct?` (y / n / partial) in `out/facts_sample.csv`, then:",
          "`uv run python run_spike.py precision out/facts_sample.csv`", ""]
    path.write_text("\n".join(L), encoding="utf-8")


def precision(csv_path: Path) -> dict[str, Any]:
    with csv_path.open(encoding="utf-8") as fh:
        marks = [(r.get("correct?") or "").strip().lower() for r in csv.DictReader(fh)]
    judged = [x for x in marks if x]
    yes = sum(1 for x in judged if x in {"y", "yes", "1", "true"})
    part = sum(1 for x in judged if x in {"p", "partial"})
    return {"rows": len(marks), "judged": len(judged), "correct": yes, "partial": part,
            "precision_strict": round(yes / len(judged), 3) if judged else None,
            "precision_lenient": round((yes + part) / len(judged), 3) if judged else None}
