"""Golden days: ledger conversations of each fresh run beside Chronicle's, by time overlap.
COUNTS ONLY (no ids of Chronicle items, no text).

    uv run python eval/golden_compare.py eval/out/g14-full.json tools/golden/2026-11-14.expected.json
"""

from __future__ import annotations

import json
import sys
from datetime import datetime


def _t(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _spans(items, start="start", end="end"):
    return [(_t(i[start]), _t(i[end])) for i in items]


def _overlap(a, b) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def compare(ledger, other) -> dict:
    l_hits = [sum(_overlap(x, y) for y in other) for x in ledger]
    o_hits = [sum(_overlap(y, x) for x in ledger) for y in other]
    one_to_one = sum(
        1 for i, x in enumerate(ledger) if l_hits[i] == 1
        and o_hits[next(j for j, y in enumerate(other) if _overlap(x, y))] == 1
    )
    return {
        "count": len(other),
        "oneToOne": one_to_one,
        "ledgerOverlappingMany": sum(1 for h in l_hits if h > 1),
        "ledgerOverlappingNone": sum(1 for h in l_hits if h == 0),
        "otherOverlappingManyLedger": sum(1 for h in o_hits if h > 1),
        "otherOverlappingNoLedger": sum(1 for h in o_hits if h == 0),
    }


def main() -> int:
    report = json.loads(open(sys.argv[1]).read())
    expected = json.loads(open(sys.argv[2]).read())
    eps = _spans(expected.get("episodes", []))
    convs = _spans([c for c in expected.get("conversations", []) if not c.get("deleted")])
    out = []
    for i, run in enumerate(report["fresh"]):
        led = _spans(run["conversations"])
        out.append({"run": i + 1, "ledger": len(led), "vsEpisodes": compare(led, eps),
                    "vsChronicleConversations": compare(led, convs)})
    print(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
