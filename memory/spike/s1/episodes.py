"""CaptureBundle (life-datatypes schema v2) -> Graphiti episodes. Pure functions, no I/O
except the two loaders.

Rules:
- One episode per Chronicle conversation from `<date>.expected.json` (or from the
  bundle's own `conversations` when there is no expected file).
- Fallback when there are no conversations: fixed windows of absolute time.
- A segment belongs to a conversation part when its midpoint is inside the part's
  range on the same recording (midpoint, so a segment is never counted twice).
- Transcript choice per recording: `Recording.currentTranscriptRevision`, else the
  newest `createdAt`.
- reference_time = start of the first line of the episode (absolute UTC).
- Long episodes are split at line boundaries into parts of at most `max_chars`.
- TranscriptCorrections are NOT applied (counted only). Good enough for the spike.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Line:
    recording_id: str
    start: datetime
    end: datetime
    speaker: str
    role: str
    text: str

    @property
    def mid(self) -> datetime:
        return self.start + (self.end - self.start) / 2


@dataclass(frozen=True)
class Episode:
    episode_id: str
    day: str
    origin: str  # "conversation" | "window"
    reference_time: datetime
    end_time: datetime
    lines: tuple[Line, ...]
    conversation_id: str | None = None

    def body(self) -> str:
        # Graphiti EpisodeType.message expects "actor: content" lines.
        return "\n".join(f"{ln.speaker}: {ln.text}" for ln in self.lines)

    @property
    def recording_ids(self) -> list[str]:
        return sorted({ln.recording_id for ln in self.lines})

    def stats(self) -> dict[str, Any]:
        """Counts only. Never includes transcript text."""
        return {
            "episode_id": self.episode_id,
            "origin": self.origin,
            "reference_time": self.reference_time.isoformat(),
            "end_time": self.end_time.isoformat(),
            "lines": len(self.lines),
            "chars": len(self.body()),
            "recordings": len(self.recording_ids),
        }


@dataclass
class MappingInfo:
    mode: str = "conversation"
    conversations_total: int = 0
    conversations_empty: int = 0
    conversations_deleted_skipped: int = 0
    lines_total: int = 0
    lines_dropped_by_role: int = 0
    lines_unassigned: int = 0
    episodes_split: int = 0
    corrections_ignored: int = 0
    notes: list[str] = field(default_factory=list)


def parse_time(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError(f"time without timezone is not allowed: {value!r}")
    return dt.astimezone(UTC)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def conversations_from_expected(expected: Any) -> list[dict[str, Any]]:
    """Accept a bare list, {"conversations": [...]}, or a CaptureBundle-like dict."""
    if expected is None:
        return []
    if isinstance(expected, list):
        return expected
    if isinstance(expected, dict) and isinstance(expected.get("conversations"), list):
        return expected["conversations"]
    raise ValueError("expected.json: need a list of conversations or {'conversations': [...]}")


def pick_transcripts(bundle: dict[str, Any]) -> dict[str, dict[str, Any]]:
    by_rec: dict[str, list[dict[str, Any]]] = {}
    for tr in bundle.get("transcripts", []):
        by_rec.setdefault(tr["recordingId"], []).append(tr)
    current = {
        r["id"]: r.get("currentTranscriptRevision") for r in bundle.get("recordings", [])
    }
    chosen: dict[str, dict[str, Any]] = {}
    for rec_id, trs in by_rec.items():
        want = current.get(rec_id)
        match = [t for t in trs if want and t["revision"] == want]
        chosen[rec_id] = match[0] if match else max(trs, key=lambda t: parse_time(t["createdAt"]))
    return chosen


def _speaker_name(label: str, speaker: dict[str, Any] | None) -> tuple[str, str]:
    role = (speaker or {}).get("role", "unknown")
    name = (speaker or {}).get("displayName")
    if name:
        return name, role
    who = "Owner" if role == "owner" else label
    return who, role


def lines_from_bundle(
    bundle: dict[str, Any], drop_roles: frozenset[str], info: MappingInfo
) -> list[Line]:
    out: list[Line] = []
    for rec_id, tr in pick_transcripts(bundle).items():
        speakers = {s["label"]: s for s in tr.get("speakers", [])}
        for seg in tr.get("segments", []):
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            info.lines_total += 1
            name, role = _speaker_name(seg["speakerLabel"], speakers.get(seg["speakerLabel"]))
            if role in drop_roles:
                info.lines_dropped_by_role += 1
                continue
            out.append(
                Line(rec_id, parse_time(seg["start"]), parse_time(seg["end"]), name, role, text)
            )
    out.sort(key=lambda ln: (ln.start, ln.recording_id))
    info.corrections_ignored = len(bundle.get("corrections", []))
    return out


def normalize_conversation(c: dict[str, Any]) -> dict[str, Any]:
    """Accept both shapes: harness fixture ({id, range, parts}) and the golden export
    ({conversationId, start, end, deleted, segmentCount}, no parts). Without parts, the
    conversation's time range applies to every recording (recordingId None)."""
    cid = c.get("id") or c.get("conversationId")
    rng = c.get("range") or {"start": c["start"], "end": c["end"]}
    parts = c.get("parts") or [{"recordingId": None, "range": rng}]
    return {**c, "id": cid, "range": rng, "parts": parts}


def _in_part(line: Line, part: dict[str, Any]) -> bool:
    if part["recordingId"] is not None and line.recording_id != part["recordingId"]:
        return False
    return parse_time(part["range"]["start"]) <= line.mid <= parse_time(part["range"]["end"])


def _make(
    ep_id: str, day: str, origin: str, lines: list[Line], conv_id: str | None
) -> Episode:
    return Episode(
        episode_id=ep_id,
        day=day,
        origin=origin,
        reference_time=lines[0].start,
        end_time=max(ln.end for ln in lines),
        lines=tuple(lines),
        conversation_id=conv_id,
    )


def split_lines(lines: list[Line], max_chars: int) -> list[list[Line]]:
    if max_chars <= 0:
        return [lines]
    chunks: list[list[Line]] = [[]]
    size = 0
    for ln in lines:
        add = len(ln.speaker) + len(ln.text) + 3
        if chunks[-1] and size + add > max_chars:
            chunks.append([])
            size = 0
        chunks[-1].append(ln)
        size += add
    return chunks


def _emit(
    out: list[Episode], base_id: str, day: str, origin: str, lines: list[Line],
    conv_id: str | None, max_chars: int, info: MappingInfo,
) -> None:
    chunks = split_lines(lines, max_chars)
    if len(chunks) > 1:
        info.episodes_split += 1
    for i, chunk in enumerate(chunks, start=1):
        ep_id = base_id if len(chunks) == 1 else f"{base_id}#p{i}"
        out.append(_make(ep_id, day, origin, chunk, conv_id))


def episodes_from_conversations(
    lines: list[Line], conversations: list[dict[str, Any]], day: str,
    max_chars: int, info: MappingInfo,
) -> list[Episode]:
    info.conversations_total = len(conversations)
    live = [normalize_conversation(c) for c in conversations if not c.get("deleted")]
    info.conversations_deleted_skipped = len(conversations) - len(live)
    convs = sorted(live, key=lambda c: parse_time(c["range"]["start"]))
    assigned: set[int] = set()
    out: list[Episode] = []
    for conv in convs:
        parts = conv.get("parts", [])
        idx = [i for i, ln in enumerate(lines) if i not in assigned and any(
            _in_part(ln, p) for p in parts)]
        if not idx:
            info.conversations_empty += 1
            continue
        assigned.update(idx)
        base = f"{conv['id']}@r{conv.get('revision', 1)}"
        _emit(out, base, day, "conversation", [lines[i] for i in idx], conv["id"],
              max_chars, info)
    info.lines_unassigned = len(lines) - len(assigned)
    return out


def episodes_from_windows(
    lines: list[Line], day: str, day_start: datetime, window_minutes: int,
    max_chars: int, info: MappingInfo,
) -> list[Episode]:
    info.mode = "window"
    width = timedelta(minutes=window_minutes)
    buckets: dict[int, list[Line]] = {}
    for ln in lines:
        buckets.setdefault(int((ln.start - day_start) // width), []).append(ln)
    out: list[Episode] = []
    for k in sorted(buckets):
        _emit(out, f"{day}-w{k:03d}", day, "window", buckets[k], None, max_chars, info)
    return out


def build_episodes(
    bundle: dict[str, Any],
    expected: Any,
    day: str,
    *,
    window_minutes: int = 10,
    max_chars: int = 16000,
    drop_roles: frozenset[str] = frozenset({"media"}),
    force_windows: bool = False,
) -> tuple[list[Episode], MappingInfo]:
    info = MappingInfo()
    lines = lines_from_bundle(bundle, drop_roles, info)
    convs = conversations_from_expected(expected) if expected is not None else []
    if not convs:
        convs = bundle.get("conversations", [])
        if convs:
            info.notes.append("no expected.json conversations; used bundle.conversations")
    if convs and not force_windows:
        return episodes_from_conversations(lines, convs, day, max_chars, info), info
    info.notes.append(f"fixed windows of {window_minutes} min")
    day_start = parse_time(bundle["range"]["start"])
    return episodes_from_windows(lines, day, day_start, window_minutes, max_chars, info), info


def discover_days(bundle_dir: Path, only: list[str] | None = None) -> list[tuple[str, Path, Path | None]]:
    days = []
    for p in sorted(bundle_dir.glob("*.bundle.json")):
        day = p.name.removesuffix(".bundle.json")
        if only and day not in only:
            continue
        exp = p.with_name(f"{day}.expected.json")
        days.append((day, p, exp if exp.exists() else None))
    return days
