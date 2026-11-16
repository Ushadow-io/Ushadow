"""Compare helper: ledger conversations beside Chronicle's for one golden day.

Input: the ledger's `GET /conversations` JSON and Chronicle's `<date>.expected.json` (from
ledger/tools/export_golden_days.py). Output: times and ids only. No title, summary or
transcript text is printed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class Row:
    rid: str
    start: datetime
    end: datetime
    note: str


def _t(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def ledger_rows(views: list[dict[str, Any]]) -> list[Row]:
    rows = []
    for view in views:
        conv = view["conversation"]
        note = f"rev {conv['revision']}, {len(conv['parts'])} part(s)"
        note += ", open" if not conv.get("closedAt") else ""
        rows.append(Row(conv["id"], _t(conv["range"]["start"]), _t(conv["range"]["end"]), note))
    return sorted(rows, key=lambda r: (r.start, r.rid))


def episode_rows(expected: dict[str, Any]) -> list[Row]:
    rows = []
    for ep in expected.get("episodes", []):
        note = "human" if ep.get("human") else ""
        rows.append(Row(str(ep.get("episodeId")), _t(ep["start"]), _t(ep["end"]), note))
    return sorted(rows, key=lambda r: (r.start, r.rid))


def chronicle_rows(expected: dict[str, Any]) -> list[Row]:
    rows = []
    for conv in expected.get("conversations", []):
        note = "deleted" if conv.get("deleted") else ""
        rows.append(Row(conv["conversationId"], _t(conv["start"]), _t(conv["end"]), note))
    return sorted(rows, key=lambda r: (r.start, r.rid))


def _overlaps(row: Row, others: list[Row]) -> list[Row]:
    return [o for o in others if o.start < row.end and row.start < o.end]


def _fmt(row: Row) -> str:
    note = f" ({row.note})" if row.note else ""
    return f"{row.start:%H:%M:%S}-{row.end:%H:%M:%S} {row.rid}{note}"


def compare_table(views: list[dict[str, Any]], expected: dict[str, Any]) -> str:
    ledger = ledger_rows(views)
    episodes = episode_rows(expected)
    convs = chronicle_rows(expected)
    out = [
        f"day {expected.get('date')} ({expected.get('timezone')}), times in UTC",
        f"ledger conversations={len(ledger)}  chronicle episodes={len(episodes)}  "
        f"chronicle conversations={len(convs)}",
        "",
        "LEDGER CONVERSATION  ->  overlapping Chronicle episodes",
    ]
    for row in ledger:
        hits = ", ".join(_fmt(o) for o in _overlaps(row, episodes)) or "-"
        out.append(f"  {_fmt(row)}  ->  {hits}")
    out += ["", "CHRONICLE EPISODE  ->  overlapping ledger conversations"]
    for row in episodes:
        hits = ", ".join(o.rid for o in _overlaps(row, ledger)) or "-"
        out.append(f"  {_fmt(row)}  ->  {hits}")
    out += ["", "CHRONICLE CONVERSATION (recording)  ->  ledger conversations"]
    for row in convs:
        hits = ", ".join(o.rid for o in _overlaps(row, ledger)) or "-"
        out.append(f"  {_fmt(row)}  ->  {hits}")
    return "\n".join(out)
