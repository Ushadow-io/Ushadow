"""Pure rules for the only allowed change to stored evidence: growth.

A live recording gets longer and learns its end reason; a live transcript learns new speakers.
Growth never changes a value that is already set. Any other difference returns None, and the
store refuses the write.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ledger.revisions import is_provisional

Doc = dict[str, Any]

# Recording.audio (AudioRef) is the audio pointer. Older senders put it in metadata under
# one of these keys; erase strips those too (fallback).
AUDIO_POINTER_KEYS = frozenset(
    {
        "audioUri",
        "audioUrl",
        "audioPath",
        "audioFile",
        "audio_uri",
        "audio_url",
        "audio_path",
        "audio_file",
        "audio",
    }
)

_RECORDING_FILL = ("modality", "origin", "startReason", "endReason", "contentHash", "audio")


def _fill(old: Any, new: Any) -> tuple[bool, Any]:
    """(ok, value): an unset value may be filled; a set value must not change."""
    if old is None:
        return True, new
    return new is None or new == old, old


def _grow_range(old: Doc, new: Doc) -> Doc | None:
    if old["start"] != new["start"]:
        return None
    old_end = datetime.fromisoformat(old["end"])
    new_end = datetime.fromisoformat(new["end"])
    return new if new_end > old_end else old


def _grow_metadata(old: Doc | None, new: Doc | None) -> tuple[bool, Doc | None]:
    """Metadata describes the capture; it is not speech. New values are taken, except that a
    set audio pointer must not change (erase strips it on both paths)."""
    if not old or not new:
        return True, old or new
    for key in AUDIO_POINTER_KEYS & old.keys() & new.keys():
        if old[key] != new[key]:
            return False, old
    return True, {**old, **new}


def grow_recording(old: Doc, new: Doc) -> Doc | None:
    if old["id"] != new["id"] or old["sourceId"] != new["sourceId"]:
        return None
    merged = dict(old)
    rng = _grow_range(old["range"], new["range"])
    if rng is None:
        return None
    merged["range"] = rng
    for field in _RECORDING_FILL:
        ok, value = _fill(old.get(field), new.get(field))
        if not ok:
            return None
        merged[field] = value
    ok, meta = _grow_metadata(old.get("metadata"), new.get("metadata"))
    if not ok:
        return None
    merged["metadata"] = meta
    # A pointer, not evidence. Ingest sets it with RecordingStore.set_current_revision.
    merged["currentTranscriptRevision"] = old.get("currentTranscriptRevision") or new.get(
        "currentTranscriptRevision"
    )
    return merged


def grow_live_header(old: Doc, new: Doc) -> Doc | None:
    """Provisional (live) header: speakers may be refined (role, name). Keeps first createdAt."""
    speakers = {s["label"]: s for s in old.get("speakers") or []}
    speakers.update({s["label"]: s for s in new.get("speakers") or []})
    merged = {**old, "speakers": sorted(speakers.values(), key=lambda s: s["label"]) or None}
    merged["model"] = old.get("model") or new.get("model")
    return merged


def _provisional(header: Doc) -> bool:
    return is_provisional(header.get("revision"), header.get("status"))


def grow_transcript_header(old: Doc, new: Doc) -> Doc | None:
    """Header = Transcript without segments. Keeps the first createdAt and metadata.
    A revision never switches between provisional and final (a final is a new revision)."""
    if _provisional(old) != _provisional(new):
        return None
    if _provisional(old):
        return grow_live_header(old, new)
    ok, model = _fill(old.get("model"), new.get("model"))
    if not ok:
        return None
    speakers = {s["label"]: s for s in old.get("speakers") or []}
    for speaker in new.get("speakers") or []:
        known = speakers.get(speaker["label"])
        if known is not None and known != speaker:
            return None
        speakers[speaker["label"]] = speaker
    merged = dict(old)
    merged["model"] = model
    merged["speakers"] = sorted(speakers.values(), key=lambda s: s["label"]) or None
    return merged
