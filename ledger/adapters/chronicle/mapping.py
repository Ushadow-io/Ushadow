"""Pure mapping: Chronicle plugin event + conversation facts -> life-datatypes CaptureBundle.

No Chronicle imports, no I/O, no clock. Same input gives the same output, so
the ledger can receive the same bundle twice (it is idempotent).

Two inputs:
  event / data   what Chronicle dispatched (see README, "What the events carry")
  facts          what the plugin read from Chronicle about the conversation
                 (see lookup.py for the shape). The events do NOT carry
                 absolute times, so facts supply `audio_ranges`.

Rule: never guess a time. If an absolute time cannot be proven, the segment is
dropped; if nothing is left, `build_bundle` returns (None, reason).
"""

from __future__ import annotations

import hashlib
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

SCHEMA_VERSION = "2.0.0"

EVENT_COMPLETE = "conversation.complete"
EVENT_STREAMING = "transcript.streaming"
EVENT_BATCH = "transcript.batch"

# Chronicle's own tolerance when reconciling transcript edges with a claim
# (backend/services/processing_artifacts.py:43).
BOUNDARY_TOLERANCE_SECONDS = 0.5

_END_REASON_TO_CUT = {
    "user_stopped": "user_action",
    "close_requested": "user_action",
    "inactivity_timeout": "silence",
    "websocket_disconnect": "disconnect",
    "max_duration": "size_limit",
}
_SESSION_ORIGIN_TO_RECORDING_ORIGIN = {
    "streaming": "live",
    "upload": "upload",
    "batch": "upload",
    "import": "import",
    "screenpipe": "import",
}


def parse_dt(value: Any) -> Optional[datetime]:
    """datetime or ISO string -> aware UTC datetime. None if unusable."""
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def conversation_ids(event: str, data: Dict[str, Any]) -> List[str]:
    """Conversation ids an event refers to.

    conversation.complete from the timeline path carries `related_conversation_ids`
    (services/timeline/dispatch.py:97); the other emitters carry `conversation_id`.
    """
    ids: List[str] = []
    if event == EVENT_COMPLETE:
        ids.extend(str(i) for i in (data.get("related_conversation_ids") or []) if i)
    cid = data.get("conversation_id")
    if cid and str(cid) not in ids:
        ids.append(str(cid))
    return ids


def _ranges(facts: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """Validated audio ranges as [{start, end, duration}], or ([], reason)."""
    out = []
    for r in facts.get("audio_ranges") or []:
        start, end = parse_dt(r.get("started_at")), parse_dt(r.get("ended_at"))
        if start is None or end is None or end <= start:
            return [], "audio range has unusable bounds"
        if (r.get("time_basis") or "unknown") == "unknown":
            return [], "audio range time_basis is unknown (time not provable)"
        out.append({"start": start, "end": end, "duration": (end - start).total_seconds(),
                    "time_basis": r.get("time_basis")})
    if not out:
        return [], "conversation has no audio_ranges yet (no absolute time available)"
    return out, None


def absolute_time(ranges: List[Dict[str, Any]], offset: float,
                  prefer_previous_boundary: bool = False) -> Optional[datetime]:
    """Conversation-clock seconds -> absolute UTC time.

    Same algorithm as Chronicle's absolute_time_for_offset
    (backend/services/processing_artifacts.py:57): ranges are concatenated in order,
    the offset is placed inside the range that holds it. Returns None when the offset
    is outside the claimed audio (beyond a small tolerance).
    """
    if not isinstance(offset, (int, float)) or not math.isfinite(offset):
        return None
    total = sum(r["duration"] for r in ranges)
    if offset < -BOUNDARY_TOLERANCE_SECONDS or offset > total + BOUNDARY_TOLERANCE_SECONDS:
        return None
    offset = min(max(float(offset), 0.0), total)
    cursor = 0.0
    for i, r in enumerate(ranges):
        nxt = cursor + r["duration"]
        on_end = abs(offset - nxt) <= 0.001
        if offset < nxt or i == len(ranges) - 1 or (on_end and prefer_previous_boundary):
            local = min(max(offset - cursor, 0.0), r["duration"])
            return r["start"] + timedelta(seconds=local)
        cursor = nxt
    return None


_GENERIC_LABEL = re.compile(r"^(speaker[ _-]?\d+|unknown.*|\d+)$", re.IGNORECASE)


# Chronicle's Data Audit triage labels (backend constants NOISE_LABEL, BACKGROUND_SPEECH_LABEL):
# a human marked this voice as not a real participant.
HAND_MEDIA_LABELS = {"noise": "background", "background speech": "media"}


def speaker_name(seg: Dict[str, Any], label: str) -> Optional[str]:
    """The identified name. Chronicle writes it to `identified_as`, or over `speaker` itself."""
    if label.strip().lower() in HAND_MEDIA_LABELS:
        return None
    name = str(seg.get("identified_as") or "").strip()
    if name and name.lower() != "unknown":
        return name
    return None if _GENERIC_LABEL.match(label.strip()) else (label.strip() or None)


def speaker_role(label: str, name: Optional[str], owners: set, direction: str) -> str:
    """Who a voice is, in the order Chronicle trusts: a human's triage label, then a recognised
    name, then the capture route (system audio output = media). A microphone voice with no name
    stays `unknown`: a TV in the room is not provable from the route."""
    hand = HAND_MEDIA_LABELS.get(label.strip().lower())
    if hand:
        return hand
    if name:
        return "owner" if name.strip().lower() in owners else "unknown"
    return "media" if direction == "output" else "unknown"


def capture_direction(external_source_id: Any) -> str:
    """`input`, `output` or `unknown`, from Chronicle's `<source>:<device>:<direction>` id."""
    parts = str(external_source_id or "").split(":")
    return parts[2] if len(parts) >= 3 and parts[2] in ("input", "output") else "unknown"


def _speaker_label(seg: Dict[str, Any]) -> str:
    raw = seg.get("speaker")
    if raw is None or raw == "":
        return ""
    return f"Speaker {raw}" if isinstance(raw, int) else str(raw)


def _map_segments(raw: List[Dict[str, Any]], ranges, owner_names: List[str], seg_prefix: str,
                  direction: str = "unknown"):
    """Returns (segments, speakers, dropped_count)."""
    owners = {n.strip().lower() for n in owner_names if n and n.strip()}
    segments, speakers, dropped = [], {}, 0
    for i, seg in enumerate(raw):
        if not isinstance(seg, dict):
            dropped += 1
            continue
        text = str(seg.get("text") or "").strip()
        label = _speaker_label(seg)
        flagged = label.strip().lower() in HAND_MEDIA_LABELS  # triaged media: kept, with its role
        if not text or not label or ((seg.get("segment_type") or "speech") != "speech" and not flagged):
            continue  # non-speech event/note, empty text, or no speaker: not transcript
        start = absolute_time(ranges, seg.get("start"))
        end = absolute_time(ranges, seg.get("end"), prefer_previous_boundary=True)
        if start is None or end is None:
            dropped += 1
            continue
        if end < start:
            end = start
        name = speaker_name(seg, label)
        sp = speakers.setdefault(label, {"label": label, "role": "unknown"})
        if name:
            sp.setdefault("displayName", str(name))
        entry = {"id": f"{seg_prefix}:{int(round(float(seg['start']) * 1000))}-{label}", "text": text, "speakerLabel": label,
                 "start": iso(start), "end": iso(end)}
        if isinstance(seg.get("confidence"), (int, float)):
            entry["confidence"] = float(seg["confidence"])
        segments.append(entry)
    for label, sp in speakers.items():  # one role per label, from every line it spoke
        sp["role"] = speaker_role(label, sp.get("displayName"), owners, direction)
    return segments, list(speakers.values()), dropped


def _content_revision(prefix: str, raw: List[Dict[str, Any]]) -> str:
    h = hashlib.sha256()
    for s in raw:
        h.update(f"{s.get('start')}|{s.get('end')}|{s.get('speaker')}|{s.get('text')}\n".encode())
    return f"{prefix}-{h.hexdigest()[:10]}"


def build_bundle(event: str, data: Dict[str, Any], facts: Dict[str, Any],
                 owner_names: Optional[List[str]] = None
                 ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """One conversation -> (CaptureBundle dict, None) or (None, reason it was skipped).

    event == conversation.complete : segments + revision from facts (active transcript)
    event == transcript.batch      : segments from the payload; revision = content hash
    event == transcript.streaming  : segments from the payload; revision "live",
                                     status provisional (every other event: final);
                                     only if the payload says they are on the
                                     "conversation" clock (otherwise no origin is known)
    """
    cid = facts.get("conversation_id")
    if not cid:
        return None, "no conversation_id"
    ranges, reason = _ranges(facts)
    if reason:
        return None, reason

    if event == EVENT_COMPLETE:
        raw = facts.get("segments") or []
        revision = facts.get("version_id") or _content_revision("complete", raw)
    elif event in (EVENT_BATCH, EVENT_STREAMING):
        if data.get("conversation_id") != cid:
            return None, "payload conversation_id differs from facts"
        raw = data.get("segments") or []
        clock = data.get("timestamp_clock")
        if event == EVENT_STREAMING:
            if clock != "conversation":
                return None, f"streaming segments are on clock {clock!r}, not 'conversation'"
            revision = "live"
        else:
            if clock not in (None, "conversation"):
                return None, f"batch segments are on clock {clock!r}, not 'conversation'"
            revision = _content_revision("batch", raw)
    else:
        return None, f"unsupported event {event!r}"

    rec_id = f"chronicle:{cid}"
    direction = capture_direction(facts.get("external_source_id"))
    modality = "audio_output" if direction == "output" else "audio_input"
    segments, speakers, dropped = _map_segments(raw, ranges, owner_names or [],
                                                f"{rec_id}:{revision}", direction)
    if not segments:
        return None, f"no segment with a provable absolute time ({dropped} dropped, {len(raw)} in)"

    client_id = facts.get("client_id") or "unknown"
    source_id = f"chronicle:{client_id}"
    start, end = ranges[0]["start"], max(r["end"] for r in ranges)
    recording: Dict[str, Any] = {
        "id": rec_id, "sourceId": source_id, "modality": modality,
        "range": {"start": iso(start), "end": iso(end)},
        "currentTranscriptRevision": revision,
        "metadata": {"chronicle": {
            "conversation_id": cid, "client_id": client_id,
            "time_basis": ranges[0]["time_basis"], "range_count": len(ranges),
            "event": event,
        }},
    }
    origin = _SESSION_ORIGIN_TO_RECORDING_ORIGIN.get(facts.get("capture_origin") or "")
    if origin:
        recording["origin"] = origin
    end_reason = facts.get("end_reason")
    if event == EVENT_COMPLETE and end_reason in _END_REASON_TO_CUT:
        recording["endReason"] = _END_REASON_TO_CUT[end_reason]

    created = parse_dt(facts.get("version_created_at")) or end
    transcript: Dict[str, Any] = {
        "recordingId": rec_id, "revision": revision, "createdAt": iso(created),
        "speakers": speakers, "segments": segments,
        "status": "provisional" if event == EVENT_STREAMING else "final",
        "metadata": {"chronicle": {"event": event, "dropped_segments": dropped,
                                   "ranges_source": facts.get("ranges_source", "conversation")}},
    }
    model = facts.get("model") or facts.get("provider")
    if model and event == EVENT_COMPLETE:
        transcript["model"] = str(model)

    bundle = {
        "schemaVersion": SCHEMA_VERSION,
        "range": {"start": iso(start), "end": iso(end)},
        "sources": [{"id": source_id, "kind": "other", "modalities": [modality],
                     "label": f"Chronicle client {client_id}"}],
        "recordings": [recording],
        "transcripts": [transcript],
    }
    return bundle, None


def ingest_request(user_id: Optional[str], bundle: Dict[str, Any]
                   ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """The ledger's POST /ingest body: {userId, bundle}. userId is the Chronicle account that
    owns the conversation (Conversation.user_id), not a person id. None if it is unknown."""
    if not user_id:
        return None, "conversation has no user_id (owner unknown)"
    return {"userId": str(user_id), "bundle": bundle}, None


def segment_key(seg: Dict[str, Any]) -> str:
    return str(int(round(float(seg.get("start") or 0.0) * 1000)))


def new_or_changed(raw: List[Dict[str, Any]], sent: Dict[str, str]) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """Live segments not yet sent (or whose text/end/speaker changed since).

    `sent` maps segment_key (start ms) -> content hash. Returns (delta, updated sent).
    A fresh `sent` (e.g. after a restart) just resends everything; the ledger is idempotent.
    """
    out, state = [], dict(sent)
    for seg in raw:
        if not isinstance(seg, dict) or not isinstance(seg.get("start"), (int, float)):
            continue
        h = hashlib.sha1(f"{seg.get('end')}|{seg.get('speaker')}|{seg.get('text')}".encode()).hexdigest()
        k = segment_key(seg)
        if state.get(k) != h:
            out.append(seg)
            state[k] = h
    return out, state
