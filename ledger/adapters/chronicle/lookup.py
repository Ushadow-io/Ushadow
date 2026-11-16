"""Read what the events do not carry (absolute time anchors) from Chronicle.

Runs inside the Chronicle process, so it uses Chronicle's own Beanie models
(the same way the bundled hourly_recap plugin does). Chronicle imports are lazy,
so `normalize_conversation` can be tested without Chronicle.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _val(x: Any) -> Any:
    return getattr(x, "value", x)  # Enum -> str


def normalize_conversation(conv: Any, capture_origin: Optional[str] = None) -> Dict[str, Any]:
    """Conversation document -> the plain `facts` dict that mapping.build_bundle reads."""
    active = conv.active_transcript
    return {
        "conversation_id": conv.conversation_id,
        "client_id": conv.client_id,
        "started_at": conv.started_at,
        "ended_at": conv.ended_at,
        "end_reason": _val(conv.end_reason) if conv.end_reason else None,
        "capture_origin": capture_origin,
        "audio_ranges": [
            {"started_at": r.started_at, "ended_at": r.ended_at,
             "time_basis": r.time_basis, "capture_session_ids": list(r.capture_session_ids)}
            for r in (conv.audio_ranges or [])
        ],
        "version_id": active.version_id if active else None,
        "version_created_at": active.created_at if active else None,
        "provider": active.provider if active else None,
        "model": active.model if active else None,
        "segments": [
            {"start": s.start, "end": s.end, "text": s.text, "speaker": s.speaker,
             "identified_as": s.identified_as, "confidence": s.confidence,
             "segment_type": _val(s.segment_type)}
            for s in (active.segments if active else [])
        ],
    }


def normalize_ranges(ranges: Any) -> list:
    return [{"started_at": r.started_at, "ended_at": r.ended_at, "time_basis": r.time_basis,
             "capture_session_ids": list(r.capture_session_ids)} for r in ranges]


async def live_claim_ranges(capture_session_id: str, started_at: Any) -> list:
    """Chronicle's own live clock origin, rebuilt the way it builds it.

    conversation_jobs._resolve_live_capture_clock_offset (workers/conversation_jobs.py:1624-1632)
    does exactly this when audio_ranges is still empty:
    claim_capture_window(session_id, conversation.started_at, now). Raises on failure.
    """
    from datetime import datetime, timezone

    from backend.services.audio_claims import claim_capture_window  # lazy: Chronicle only

    return normalize_ranges(
        await claim_capture_window(capture_session_id, started_at, datetime.now(timezone.utc)))


async def fetch_facts(conversation_id: str, live_capture_session_id: Optional[str] = None
                      ) -> Optional[Dict[str, Any]]:
    """Load one conversation (and its capture session origin). None if not found.

    If audio_ranges is empty and `live_capture_session_id` is given (live streaming event on the
    'conversation' clock), build Chronicle's temporary claim. If that fails, ranges stay empty
    and the mapping sends nothing. Never falls back to started_at alone.
    """
    from backend.models.conversation import Conversation  # lazy: Chronicle only

    conv = await Conversation.find_one(Conversation.conversation_id == conversation_id)
    if conv is None or getattr(conv, "deleted", False):
        return None
    capture_origin = None
    claimed = None
    if not conv.audio_ranges and live_capture_session_id:
        try:
            claimed = await live_claim_ranges(live_capture_session_id, conv.started_at)
        except Exception as e:
            logger.info("ledger_adapter: live claim failed for %s: %s", conversation_id[:12], e)
    try:
        from backend.models.audio_capture import AudioCaptureSession

        ids = next((r.capture_session_ids for r in conv.audio_ranges if r.capture_session_ids), [])
        if ids:
            session = await AudioCaptureSession.find_one(
                AudioCaptureSession.capture_session_id == ids[0])
            capture_origin = session.origin if session else None
    except Exception as e:  # origin is optional metadata
        logger.debug("ledger_adapter: capture origin lookup failed: %s", e)
    facts = normalize_conversation(conv, capture_origin)
    if claimed:
        facts["audio_ranges"] = claimed
        facts["ranges_source"] = "live_claim"
    return facts
