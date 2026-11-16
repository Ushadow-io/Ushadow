#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "httpx>=0.27",
#   "jsonschema>=4.21",
#   "pymongo>=4.6",
#   "tzdata",
# ]
# ///
"""Export "golden days" of real capture data from Chronicle as CaptureBundle JSON.

For each requested local day this writes two files into --out:

  <date>.bundle.json    a CaptureBundle (life-datatypes schema v2): sources,
                        recordings, transcripts (absolute UTC times) and
                        capture gaps whose cause is known.
  <date>.expected.json  what Chronicle thinks today: its conversations and
                        timeline episodes for the day, with human edits flagged.

READ-ONLY. The REST mode only issues GET requests. The Mongo mode only issues
find() queries. Nothing is ever written to Chronicle, and nothing is sent to any
outside service. The output is PRIVATE (real speech): it goes to a git-ignored
folder, and transcript text is never printed. Only counts reach stdout.

Environment:
  CHRONICLE_TOKEN       bearer token for the REST API (never a CLI argument)
  CHRONICLE_URL         default for --chronicle-url   (default http://localhost:8090)
  CHRONICLE_MONGO_URI   default for --mongo-uri (keeps credentials off the CLI)
  LIFE_DATATYPES_SCHEMA path to life-datatypes schema/conversation.json (v2)
  LEDGER_TZ             default for --tz

Time model. Chronicle stores segment times as seconds relative to the start of
the conversation's audio. The conversation's `audio_ranges` carry absolute UTC
bounds (derived from `audio_chunks.captured_at`). This tool lays the ranges end
to end in their stored order and maps each relative offset to wall-clock time
inside the range that holds it. For a single range this is simply
`range.started_at + offset`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

UTC = timezone.utc
HERE = Path(__file__).resolve().parent
DEFAULT_SCHEMA = Path.home() / "repos" / "life-datatypes" / "schema" / "conversation.json"
UNKNOWN_SPEAKER = "unknown"

# Chronicle Conversation.EndReason -> life-datatypes CutReason
END_REASON_TO_CUT = {
    "user_stopped": "user_action",
    "close_requested": "user_action",
    "inactivity_timeout": "silence",
    "websocket_disconnect": "disconnect",
    "max_duration": "size_limit",
}
# Conversation.EndReason -> GapCause for the gap that follows (only known causes)
END_REASON_TO_GAP = {
    "websocket_disconnect": "disconnected",
    "user_stopped": "paused",
    "close_requested": "paused",
}


# --------------------------------------------------------------------------- time


def to_utc(value: Any) -> datetime | None:
    """Parse a datetime / ISO string / None into an aware UTC datetime.

    Naive datetimes are what Mongo hands back; they are UTC by Chronicle's contract.
    """
    if value is None or value == "":
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not isinstance(value, datetime):
        raise TypeError(f"not a datetime: {type(value).__name__}")
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def day_bounds(local_date: date, tz_name: str) -> tuple[datetime, datetime]:
    zone = ZoneInfo(tz_name)
    start = datetime.combine(local_date, datetime.min.time(), tzinfo=zone)
    end = datetime.combine(local_date + timedelta(days=1), datetime.min.time(), tzinfo=zone)
    return start.astimezone(UTC), end.astimezone(UTC)


# ----------------------------------------------------------------- normalization


@dataclass
class Conv:
    """A Chronicle conversation, reduced to what the mapping needs.

    Built from either a REST detail payload or a raw Mongo document.
    """

    id: str
    client_id: str | None
    user_id: str | None
    deleted: bool
    title: str | None
    created_at: datetime | None
    started_at: datetime | None
    ended_at: datetime | None
    end_reason: str | None
    # (capture_source_id, started_at, ended_at) in stored order
    ranges: list[tuple[str | None, datetime, datetime]]
    segments: list[dict[str, Any]]  # relative seconds, raw Chronicle shape
    revision: str | None
    revision_created_at: datetime | None
    model: str | None
    audio_total_duration: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def bounds(self) -> tuple[datetime, datetime] | None:
        starts = [r[1] for r in self.ranges]
        ends = [r[2] for r in self.ranges]
        start = min(starts) if starts else (self.started_at or self.created_at)
        if start is None:
            return None
        if ends:
            end = max(ends)
        elif self.ended_at:
            end = self.ended_at
        else:
            last = max((float(s.get("end") or 0) for s in self.segments), default=0.0)
            end = start + timedelta(seconds=last or self.audio_total_duration or 0.0)
        return start, max(end, start)


def _active_version(doc: dict[str, Any]) -> dict[str, Any] | None:
    active = doc.get("active_transcript_version")
    for version in doc.get("transcript_versions") or []:
        if version.get("version_id") == active:
            return version
    return None


def normalize_conversation(doc: dict[str, Any]) -> Conv:
    """Accept a REST detail payload (``conversation`` dict) or a Mongo document."""
    version = _active_version(doc)
    segments = doc.get("segments")
    if segments is None:
        segments = (version or {}).get("segments") or []
    ranges: list[tuple[str | None, datetime, datetime]] = []
    for item in doc.get("audio_ranges") or []:
        start, end = to_utc(item.get("started_at")), to_utc(item.get("ended_at"))
        if start is not None and end is not None:
            ranges.append((item.get("capture_source_id"), start, end))
    end_reason = doc.get("end_reason")
    if isinstance(end_reason, dict):  # defensive; enums arrive as plain strings
        end_reason = end_reason.get("value")
    metadata = (version or {}).get("metadata") or {}
    return Conv(
        id=str(doc["conversation_id"]),
        client_id=doc.get("client_id"),
        user_id=doc.get("user_id"),
        deleted=bool(doc.get("deleted")),
        title=doc.get("title"),
        created_at=to_utc(doc.get("created_at")),
        started_at=to_utc(doc.get("started_at")),
        ended_at=to_utc(doc.get("ended_at")),
        end_reason=end_reason,
        ranges=ranges,
        segments=list(segments),
        revision=doc.get("active_transcript_version"),
        revision_created_at=to_utc((version or {}).get("created_at")),
        model=(version or {}).get("model")
        or (version or {}).get("provider")
        or metadata.get("model")
        or doc.get("diarization_source"),
        audio_total_duration=doc.get("audio_total_duration"),
    )


def offset_to_absolute(conv: Conv, offset_s: float, base: datetime) -> datetime:
    """Map seconds-from-conversation-audio-start to an absolute UTC time."""
    if not conv.ranges:
        return base + timedelta(seconds=offset_s)
    cumulative = 0.0
    for _src, start, end in conv.ranges:
        length = (end - start).total_seconds()
        if offset_s < cumulative + length:
            return start + timedelta(seconds=max(offset_s - cumulative, 0.0))
        cumulative += length
    _src, start, end = conv.ranges[-1]  # past the end: extrapolate from the last range
    return end + timedelta(seconds=offset_s - cumulative)


# -------------------------------------------------------------------- source map


def source_id_for(conv: Conv) -> str:
    for src, _s, _e in conv.ranges:
        if src:
            return str(src)
    return f"client:{conv.client_id or 'unknown'}"


def make_source(source_id: str, client_id: str | None) -> dict[str, Any]:
    """Build a CaptureSource. Capture ids look like ``<source>:<input|output>:<track>``."""
    parts = source_id.split(":")
    direction = parts[1] if len(parts) >= 3 else "input"
    hint = f"{source_id} {client_id or ''}".lower()
    if any(k in hint for k in ("omi", "pendant", "friend", "bee", "limitless", "wearable")):
        kind = "wearable"
    elif any(k in hint for k in ("phone", "mobile", "ios", "android", "iphone")):
        kind = "phone"
    elif any(k in hint for k in ("desktop", "screenpipe", "macos", "windows", "linux")):
        kind = "desktop"
    elif "upload" in hint:
        kind = "upload"
    else:
        kind = "other"
    source: dict[str, Any] = {
        "id": source_id,
        "kind": kind,
        "modalities": ["audio_output" if direction == "output" else "audio_input"],
    }
    if client_id:
        source["device"] = str(client_id)
    return source


# ------------------------------------------------------------------- the mapping


def map_conversation(
    conv: Conv, owner_name: str | None = None
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]] | None:
    """Chronicle conversation -> (CaptureSource, Recording, Transcript). None if undatable."""
    bounds = conv.bounds
    if bounds is None:
        return None
    rec_start, rec_end = bounds
    source_id = source_id_for(conv)
    source = make_source(source_id, conv.client_id)

    ordered = sorted(
        enumerate(conv.segments),
        key=lambda p: (float(p[1].get("start") or 0), float(p[1].get("end") or 0), p[0]),
    )
    revision = conv.revision or "active"
    segments: list[dict[str, Any]] = []
    speakers: dict[str, dict[str, Any]] = {}
    for n, (_i, raw) in enumerate(ordered):
        rel_start = float(raw.get("start") or 0.0)
        rel_end = max(float(raw.get("end") or rel_start), rel_start)
        start = offset_to_absolute(conv, rel_start, rec_start)
        end = max(offset_to_absolute(conv, rel_end, rec_start), start)
        label = (raw.get("speaker") or "").strip() or UNKNOWN_SPEAKER
        name = (raw.get("identified_as") or "").strip() or None
        seg: dict[str, Any] = {
            "id": f"{conv.id}:{revision}:{n:05d}",
            "text": raw.get("text") or "",
            "speakerLabel": label,
            "start": iso(start),
            "end": iso(end),
            "metadata": {"relativeStart": rel_start, "relativeEnd": rel_end},
        }
        if raw.get("confidence") is not None:
            seg["confidence"] = float(raw["confidence"])
        seg_type = raw.get("segment_type")
        if seg_type and seg_type != "speech":
            seg["metadata"]["segmentType"] = seg_type
        segments.append(seg)
        speaker = speakers.setdefault(label, {"label": label, "role": "unknown"})
        if name and "displayName" not in speaker:
            speaker["displayName"] = name
            if owner_name and name.casefold() == owner_name.casefold():
                speaker["role"] = "owner"
        rec_end = max(rec_end, end)  # a recording must cover its own words

    recording: dict[str, Any] = {
        "id": conv.id,
        "sourceId": source_id,
        "modality": source["modalities"][0],
        "range": {"start": iso(rec_start), "end": iso(rec_end)},
        "origin": "live",
        "metadata": {"chronicleRanges": len(conv.ranges), "clientId": conv.client_id},
    }
    cut = END_REASON_TO_CUT.get(conv.end_reason or "", "unknown")
    recording["endReason"] = cut
    if conv.revision:
        recording["currentTranscriptRevision"] = conv.revision
    else:
        recording["currentTranscriptRevision"] = revision
    if len({r[0] for r in conv.ranges}) > 1:
        recording["metadata"]["note"] = "conversation spans several capture sources"

    transcript: dict[str, Any] = {
        "recordingId": conv.id,
        "revision": revision,
        "createdAt": iso(conv.revision_created_at or conv.created_at or rec_end),
        "speakers": [speakers[k] for k in sorted(speakers)],
        "segments": segments,
        "status": "final",  # an export reads Chronicle's stored (closed) version
    }
    if conv.model:
        transcript["model"] = str(conv.model)
    return source, recording, transcript


# -------------------------------------------------------------------------- gaps


def _gap(source_id: str, start: datetime, end: datetime, cause: str,
         recording_id: str | None = None) -> dict[str, Any]:
    key = f"{source_id}|{iso(start)}|{iso(end)}|{cause}"
    gap = {
        "id": "gap-" + hashlib.sha1(key.encode()).hexdigest()[:16],
        "sourceId": source_id,
        "range": {"start": iso(start), "end": iso(end)},
        "cause": cause,
    }
    if recording_id:
        gap["recordingId"] = recording_id  # the gap is inside this recording
    return gap


def _inside(items: list[tuple[str, datetime, datetime, str | None, str]], source_id: str | None,
            lo: datetime, hi: datetime) -> tuple[str, str] | None:
    """(source, recording id) of the one recording that holds [lo, hi]; None if not one."""
    hits = [(src, rec) for src, start, end, _r, rec in items
            if start <= lo and hi <= end and source_id in (None, src)]
    return hits[0] if len(hits) == 1 else None


def _privacy_gaps(items: list[tuple[str, datetime, datetime, str | None, str]],
                  day: tuple[datetime, datetime],
                  privacy: Iterable[tuple[str | None, datetime, datetime]],
                  sources: list[str]) -> list[dict[str, Any]]:
    """Excluded gaps; one inside a single recording gets that recording's id and source."""
    out = []
    for source_id, start, end in privacy:
        lo, hi = max(start, day[0]), min(end, day[1])
        if hi <= lo:
            continue
        holder = _inside(items, source_id, lo, hi)
        if holder:
            out.append(_gap(holder[0], lo, hi, "excluded", holder[1]))
        else:
            fallback = source_id or (sources[0] if sources else "unknown")
            out.append(_gap(fallback, lo, hi, "excluded"))
    return out


def build_gaps(
    items: Iterable[tuple[str, datetime, datetime, str | None, str]],
    day: tuple[datetime, datetime],
    min_gap_s: float,
    privacy: Iterable[tuple[str | None, datetime, datetime]] = (),
) -> tuple[list[dict[str, Any]], int]:
    """Gaps between consecutive recordings of one source, when the cause is known, and
    privacy gaps (excluded). A privacy gap inside one recording gets its `recordingId`.

    items: (source_id, start, end, chronicle end_reason, recording id).
    Returns (gaps, unknown_skipped).
    """
    items = list(items)
    day_start, day_end = day
    per_source: dict[str, list[tuple[datetime, datetime, str | None]]] = {}
    for source_id, start, end, reason, _rec in items:
        per_source.setdefault(source_id, []).append((start, end, reason))
    gaps: list[dict[str, Any]] = []
    skipped = 0
    for source_id in sorted(per_source):
        rows = sorted(per_source[source_id], key=lambda r: (r[0], r[1]))
        high_end, high_reason = rows[0][1], rows[0][2]
        for start, end, reason in rows[1:]:
            if (start - high_end).total_seconds() > min_gap_s:
                cause = END_REASON_TO_GAP.get(high_reason or "")
                lo, hi = max(high_end, day_start), min(start, day_end)
                if cause is None:
                    skipped += 1
                elif hi > lo:
                    gaps.append(_gap(source_id, lo, hi, cause))
            if end >= high_end:
                high_end, high_reason = end, reason
    gaps += _privacy_gaps(items, day, privacy, sorted(per_source))
    gaps.sort(key=lambda g: (g["range"]["start"], g["sourceId"], g["id"]))
    return gaps, skipped


def parse_privacy_intervals(coverage: dict[str, Any]) -> list[tuple[str | None, datetime, datetime]]:
    """Extract excluded intervals from /timeline/day ``coverage.privacy_intervals``.

    Field names are read defensively (the shape is not a documented contract).
    """
    out = []
    for row in (coverage or {}).get("privacy_intervals") or []:
        state = row.get("state") or row.get("status") or row.get("kind")
        if state is not None and state != "excluded":
            continue
        start = to_utc(row.get("started_at") or row.get("start"))
        end = to_utc(row.get("ended_at") or row.get("end"))
        if start and end:
            out.append((row.get("source_id") or row.get("source"), start, end))
    return out


# ------------------------------------------------------------------------ bundle


@dataclass
class DayStats:
    recordings: int = 0
    segments: int = 0
    minutes: float = 0.0
    gaps: int = 0
    unknown_gaps_skipped: int = 0
    conversations: int = 0
    episodes: int = 0


def build_bundle(
    convs: Iterable[Conv],
    local_date: date,
    tz_name: str,
    *,
    schema_version: str = "2.0.0",
    owner_name: str | None = None,
    min_gap_s: float = 60.0,
    privacy: Iterable[tuple[str | None, datetime, datetime]] = (),
) -> tuple[dict[str, Any], DayStats]:
    day = day_bounds(local_date, tz_name)
    sources: dict[str, dict[str, Any]] = {}
    recordings: list[dict[str, Any]] = []
    transcripts: list[dict[str, Any]] = []
    gap_items: list[tuple[str, datetime, datetime, str | None, str]] = []
    stats = DayStats()
    for conv in convs:
        if conv.deleted:
            continue
        mapped = map_conversation(conv, owner_name)
        if mapped is None:
            continue
        source, recording, transcript = mapped
        start, end = to_utc(recording["range"]["start"]), to_utc(recording["range"]["end"])
        if not (start < day[1] and end > day[0]):
            continue
        sources.setdefault(source["id"], source)
        recordings.append(recording)
        transcripts.append(transcript)
        gap_items.append((source["id"], start, end, conv.end_reason, recording["id"]))
        stats.recordings += 1
        stats.segments += len(transcript["segments"])
        stats.minutes += (min(end, day[1]) - max(start, day[0])).total_seconds() / 60.0
    recordings.sort(key=lambda r: (r["range"]["start"], r["id"]))
    order = {r["id"]: i for i, r in enumerate(recordings)}
    transcripts.sort(key=lambda t: order[t["recordingId"]])
    gaps, skipped = build_gaps(gap_items, day, min_gap_s, privacy)
    stats.gaps, stats.unknown_gaps_skipped = len(gaps), skipped
    bundle: dict[str, Any] = {
        "schemaVersion": schema_version,
        "range": {"start": iso(day[0]), "end": iso(day[1])},
        "timezone": tz_name,
        "sources": [sources[k] for k in sorted(sources)],
        "recordings": recordings,
        "transcripts": transcripts,
        "gaps": gaps,
    }
    return bundle, stats


# ---------------------------------------------------------------------- expected


def normalize_episode(doc: dict[str, Any]) -> dict[str, Any]:
    """Episode (REST payload or Mongo doc) -> the comparison record."""
    fields = list(doc.get("confirmed_fields") or [])
    confirmed_at = to_utc(doc.get("confirmed_at"))
    human = bool(confirmed_at or fields or doc.get("pinned"))
    out: dict[str, Any] = {
        "episodeId": doc.get("episode_id"),
        "episodeKey": doc.get("episode_key"),
        "revision": doc.get("revision"),
        "start": iso(to_utc(doc["started_at"])),
        "end": iso(to_utc(doc["ended_at"])),
        "kind": doc.get("kind"),
        "title": doc.get("title"),
        "status": doc.get("status"),
        "human": human,
        "humanFields": sorted(fields),
        "pinned": bool(doc.get("pinned", False)),
        "relatedConversationIds": sorted(doc.get("related_conversation_ids") or []),
    }
    if confirmed_at:
        out["confirmedAt"] = iso(confirmed_at)
    if doc.get("parent_episode_id"):
        out["parentEpisodeId"] = doc["parent_episode_id"]
    return out


def build_expected(
    convs: Iterable[Conv],
    episodes: Iterable[dict[str, Any]],
    local_date: date,
    tz_name: str,
) -> dict[str, Any]:
    day = day_bounds(local_date, tz_name)
    conv_rows = []
    for conv in convs:
        bounds = conv.bounds
        if bounds is None or not (bounds[0] < day[1] and bounds[1] > day[0]):
            continue
        conv_rows.append(
            {
                "conversationId": conv.id,
                "start": iso(bounds[0]),
                "end": iso(bounds[1]),
                "title": conv.title,
                "deleted": conv.deleted,
                "segmentCount": len(conv.segments),
            }
        )
    conv_rows.sort(key=lambda r: (r["start"], r["conversationId"]))
    ep_rows = [normalize_episode(e) for e in episodes]
    ep_rows.sort(key=lambda r: (r["start"], r["end"], str(r["episodeId"])))
    return {
        "date": local_date.isoformat(),
        "timezone": tz_name,
        "range": {"start": iso(day[0]), "end": iso(day[1])},
        "conversations": conv_rows,
        "episodes": ep_rows,
    }


# ----------------------------------------------------------------- validate/write


class BundleInvalid(Exception):
    pass


def load_schema(path: Path) -> dict[str, Any]:
    schema = json.loads(path.read_text())
    return schema


def validate_bundle(bundle: dict[str, Any], schema: dict[str, Any]) -> None:
    """Validate against #/definitions/CaptureBundle. Error text omits instance values."""
    from jsonschema import Draft7Validator

    root = {"$schema": schema.get("$schema"), "definitions": schema["definitions"],
            "$ref": "#/definitions/CaptureBundle"}
    errors = sorted(Draft7Validator(root).iter_errors(bundle), key=lambda e: list(e.absolute_path))
    if errors:
        lines = [f"  at {e.json_path}: violates '{e.validator}'" for e in errors[:20]]
        raise BundleInvalid(f"{len(errors)} schema error(s)\n" + "\n".join(lines))


def dump_json(obj: Any) -> bytes:
    return (json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def write_private(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    os.chmod(path, 0o600)


# ------------------------------------------------------------------------ sources


class RestSource:
    """Chronicle REST API. GET only."""

    def __init__(self, base_url: str, token: str):
        import httpx

        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {token}"},
            timeout=60.0,
        )

    def _get(self, path: str, **params: Any) -> Any:
        import httpx

        try:
            resp = self._client.get(path, params=params or None)
        except httpx.TransportError as exc:
            raise SystemExit(f"cannot reach Chronicle at {self._client.base_url}: {type(exc).__name__}")
        if resp.status_code >= 400:
            raise SystemExit(f"Chronicle GET {path} failed: HTTP {resp.status_code}")
        return resp.json()

    def resolve_user(self, wanted: str) -> str:
        me = self._get("/users/me")
        if wanted.casefold() in {str(me.get("email", "")).casefold(), str(me.get("id", "")).casefold()}:
            return str(me["id"])
        return wanted  # superuser asking for another user id

    def conversations(self, user_id: str, created_after: datetime | None) -> list[Conv]:
        out: list[Conv] = []
        offset, limit = 0, 200
        while True:
            page = self._get("/api/conversations", limit=limit, offset=offset,
                             sort_by="created_at", sort_order="desc")
            rows = page.get("conversations", [])
            for row in rows:
                created = to_utc(row.get("created_at"))
                if created_after and created and created < created_after:
                    return out
                if row.get("user_id") not in (None, user_id):
                    continue
                detail = self._get(f"/api/conversations/{row['conversation_id']}")["conversation"]
                detail.setdefault("user_id", row.get("user_id"))
                detail.setdefault("client_id", row.get("client_id"))
                out.append(normalize_conversation(detail))
            offset += limit
            if len(rows) < limit or offset >= page.get("total", 0):
                return out

    def day(self, local_date: date, tz_name: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        payload = self._get("/api/timeline/day", date=local_date.isoformat(), timezone=tz_name)
        return payload.get("episodes", []), payload.get("coverage", {})


class MongoSource:
    """Chronicle MongoDB. find() only."""

    def __init__(self, uri: str, db_name: str):
        from pymongo import MongoClient

        self._db = MongoClient(uri, appname="ledger-export-golden-days")[db_name]

    def resolve_user(self, wanted: str) -> str:
        if "@" in wanted:
            user = self._db["users"].find_one({"email": wanted}, {"_id": 1})
            if user is None:
                raise SystemExit("no user with that email in Mongo")
            return str(user["_id"])
        return wanted

    def conversations(self, user_id: str, day: tuple[datetime, datetime]) -> list[Conv]:
        start, end = day
        overlap = {"started_at": {"$lt": end}, "ended_at": {"$gt": start}}
        query = {
            "user_id": user_id,
            "$or": [{"audio_ranges": {"$elemMatch": overlap}}, overlap],
        }
        projection = {
            "transcript_versions.words": 0,
            "transcript_versions.segments.words": 0,
            "transcript_versions.transcript": 0,
            "memory_context_frames": 0,
        }
        return [normalize_conversation(d) for d in self._db["conversations"].find(query, projection)]

    def episodes(self, user_id: str, day: tuple[datetime, datetime]) -> list[dict[str, Any]]:
        query = {"user_id": user_id, "started_at": {"$lt": day[1]}, "ended_at": {"$gt": day[0]},
                 "status": {"$ne": "superseded"}}
        projection = {"representative_image": 0, "frame_shortlist": 0, "evidence_refs": 0}
        return list(self._db["timeline_episodes"].find(query, projection))


# --------------------------------------------------------------------------- CLI


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--date", action="append", required=True, metavar="YYYY-MM-DD",
                   help="local day to export; repeat for several days")
    p.add_argument("--user", required=True, help="Chronicle user id or email")
    p.add_argument("--out", type=Path, default=HERE / "golden", help="output folder (git-ignored)")
    p.add_argument("--tz", default=os.environ.get("LEDGER_TZ", "UTC"),
                   help="IANA timezone that defines the day (default $LEDGER_TZ or UTC)")
    p.add_argument("--chronicle-url", default=os.environ.get("CHRONICLE_URL", "http://localhost:8090"))
    p.add_argument("--mongo-uri", default=os.environ.get("CHRONICLE_MONGO_URI"),
                   help="read-only Mongo mode instead of REST (prefer the env var)")
    p.add_argument("--mongo-db", default=os.environ.get("CHRONICLE_MONGO_DB", "chronicle"))
    p.add_argument("--schema", type=Path,
                   default=Path(os.environ.get("LIFE_DATATYPES_SCHEMA", DEFAULT_SCHEMA)))
    p.add_argument("--min-gap-seconds", type=float, default=60.0)
    p.add_argument("--owner-name", help="speaker name that marks the device owner (role=owner)")
    p.add_argument("--created-slack-hours", type=float, default=48.0,
                   help="REST mode: skip conversations created more than this long before the "
                        "day starts; a negative value fetches everything (slow)")
    args = p.parse_args(argv)
    try:
        args.dates = [date.fromisoformat(d) for d in args.date]
        ZoneInfo(args.tz)
    except (ValueError, KeyError) as exc:
        p.error(f"bad --date or --tz: {exc}")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.schema.is_file():
        print(f"schema not found: {args.schema} (set --schema or LIFE_DATATYPES_SCHEMA)", file=sys.stderr)
        return 2
    schema = load_schema(args.schema)
    schema_version = str(schema.get("version", "2.0.0"))
    if args.tz == "UTC":
        print("note: --tz not set, days are cut at UTC midnight", file=sys.stderr)

    rest = mongo = None
    if args.mongo_uri:
        mongo = MongoSource(args.mongo_uri, args.mongo_db)
        user_id = mongo.resolve_user(args.user)
    else:
        token = os.environ.get("CHRONICLE_TOKEN")
        if not token:
            print("CHRONICLE_TOKEN is not set (REST mode needs a bearer token in the env)", file=sys.stderr)
            return 2
        rest = RestSource(args.chronicle_url, token)
        user_id = rest.resolve_user(args.user)

    for local_date in sorted(set(args.dates)):
        day = day_bounds(local_date, args.tz)
        privacy: list[tuple[str | None, datetime, datetime]] = []
        if mongo:
            convs = mongo.conversations(user_id, day)
            episodes = mongo.episodes(user_id, day)
        else:
            after = None if args.created_slack_hours < 0 else day[0] - timedelta(hours=args.created_slack_hours)
            convs = rest.conversations(user_id, after)
            episodes, coverage = rest.day(local_date, args.tz)
            privacy = parse_privacy_intervals(coverage)
        bundle, stats = build_bundle(
            convs, local_date, args.tz, schema_version=schema_version,
            owner_name=args.owner_name, min_gap_s=args.min_gap_seconds, privacy=privacy,
        )
        try:
            validate_bundle(bundle, schema)
        except BundleInvalid as exc:
            print(f"{local_date}: bundle FAILED schema validation, nothing written\n{exc}", file=sys.stderr)
            return 1
        expected = build_expected(convs, episodes, local_date, args.tz)
        stats.conversations, stats.episodes = len(expected["conversations"]), len(expected["episodes"])
        write_private(args.out / f"{local_date}.bundle.json", dump_json(bundle))
        write_private(args.out / f"{local_date}.expected.json", dump_json(expected))
        print(
            f"{local_date}: recordings={stats.recordings} segments={stats.segments} "
            f"minutes={stats.minutes:.1f} gaps={stats.gaps} "
            f"(unknown-cause gaps skipped={stats.unknown_gaps_skipped}) "
            f"chronicle_conversations={stats.conversations} chronicle_episodes={stats.episodes}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
