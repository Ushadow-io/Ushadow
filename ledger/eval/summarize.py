"""Markdown tables from eval result files (numbers only; safe for golden results).

    uv run python eval/summarize.py eval/results/*.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def _layer(run: dict, name: str, key: str, default=0):
    return run["calls"].get(name, {}).get(key, default)


def _stats(run: dict, name: str, key: str) -> int:
    return run["stats"]["layers"].get(name, {}).get(key, 0)


def rows(path: Path) -> list[str]:
    r = json.loads(path.read_text())
    out = []
    for i, run in enumerate(r["fresh"]):
        sc = run.get("score") or {}
        calls = "/".join(str(_stats(run, n, "calls")) for n in ("gap", "state", "composer"))
        invalid = "/".join(str(_stats(run, n, "invalid")) for n in ("gap", "state", "composer"))
        fallb = "/".join(str(_stats(run, n, "fallbacks")) for n in ("gap", "state", "composer"))
        med = "/".join(str(_layer(run, n, "secondsMedian", "-")) for n in ("gap", "state",
                                                                            "composer"))
        srv = "/".join(str(_layer(run, n, "serverSecondsMedian", "-")) for n in ("gap", "state",
                                                                                 "composer"))
        inmax = max((v.get("inCharsMax", 0) for v in run["calls"].values()), default=0)
        ptok = max((v.get("promptTokensMax", 0) for v in run["calls"].values()), default=0)
        drops = sum(int(p[1].split(":")[1]) for p in run["problems"]
                    if p[0] == "composer" and p[1].startswith("unknown_citations"))
        q = (f"{sc.get('precision')}/{sc.get('recall')} | {len(sc.get('missedSplits', []))} | "
             f"{len(sc.get('wrongJoins', []))} | {sc.get('wrongSplits')} | "
             f"{sc.get('wrongBordersAtRecordingStart')} | "
             f"{sc.get('exactConversations')}/{sc.get('trueConversations')}") if sc else "- | - | - | - | - | -"
        out.append(
            f"| {r['day']} | {r['small']} | {r['composer']} | {i + 1} | "
            f"{len(run['conversations'])} | {calls} | {invalid} | {fallb} | "
            f"{run['stateFallbacks']} | {drops} | {med} | {srv} | {inmax} | {ptok} | "
            f"{run['wallSeconds']} | {q} |"
        )
    return out


HEAD = (
    "| day | small | composer | run | conv | calls g/s/c | invalid g/s/c | fallbacks g/s/c | "
    "state rule | cit. dropped | median s/call g/s/c | server s/call g/s/c | max in chars | "
    "max prompt tok | wall s | P/R | missed splits | wrong joins | wrong splits | "
    "wrong new@rec | exact conv |\n|" + "---|" * 21
)


def same_rows(path: Path) -> list[str]:
    r = json.loads(path.read_text())
    st = r.get("stability", {})
    same = r.get("same", [])
    return [
        f"| {r['day']} | {r['small']} | {r['composer']} | "
        f"{st.get('conversationsPerFreshRun')} | "
        f"{[(d['onlyInFirst'], d['onlyInOther'], d['nearestOffsetsS']) for d in st.get('bordersVsRun1', [])]} | "
        f"{[s['modelCalls'] for s in same]} | {[s['identical'] for s in same]} |"
    ]


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]]
    print(HEAD)
    for p in paths:
        print("\n".join(rows(p)))
    print("\n| day | small | composer | conv per fresh run | borders vs run 1 (only1, onlyN, "
          "offsets s) | same-ledger model calls | same-ledger identical |\n|---|---|---|---|---|---|---|")
    for p in paths:
        print("\n".join(same_rows(p)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
