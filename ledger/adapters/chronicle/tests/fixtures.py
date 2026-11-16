"""Payloads shaped exactly like what Chronicle dispatches. Sources:

streaming : workers/conversation_jobs.py:1286-1297 (plus live_clock_metadata from :1590)
batch     : workers/transcription_jobs.py:889-897
complete  : workers/conversation_jobs.py:2597-2610 (upload/reprocess path, no segments, no times)
            services/timeline/dispatch.py:80-110 (episode path, adds started_at/ended_at/related ids)
facts     : lookup.normalize_conversation() of a Conversation document
"""

from datetime import datetime, timezone

CID = "c0ffee00-1111-2222-3333-444455556666"
T0 = datetime(2026, 11, 14, 7, 30, 0, tzinfo=timezone.utc)
T0_PLUS_100 = datetime(2026, 11, 14, 7, 31, 40, tzinfo=timezone.utc)

SEGMENTS = [  # conversation clock: seconds from the first claimed sample
    {"start": 0.4, "end": 3.2, "text": "Morning, did you book the table?", "speaker": "Speaker 0",
     "words": [], "identified_as": "Stu"},
    {"start": 3.5, "end": 6.0, "text": "Yes, for eight.", "speaker": "Speaker 1", "words": []},
    {"start": 6.0, "end": 6.1, "text": "[laughter]", "speaker": "", "segment_type": "event", "words": []},
]


def facts(**over):
    f = {
        "conversation_id": CID, "client_id": "omi-pendant-1",
        "started_at": T0, "ended_at": T0_PLUS_100, "end_reason": "inactivity_timeout",
        "capture_origin": "streaming",
        "audio_ranges": [{"started_at": T0, "ended_at": T0_PLUS_100,
                          "time_basis": "captured", "capture_session_ids": ["sess-1"]}],
        "version_id": "ver-1", "version_created_at": T0_PLUS_100,
        "provider": "deepgram", "model": "nova-3",
        "segments": [dict(s) for s in SEGMENTS],
    }
    f.update(over)
    return f


def streaming_payload():
    return {"transcript": "Morning, did you book the table? Yes, for eight.",
            "segment_id": "sess-1_3", "conversation_id": CID,
            "segments": [dict(s) for s in SEGMENTS], "word_count": 9,
            "source_timestamp_clock": "capture_session", "timestamp_clock": "conversation",
            "timestamp_rebase_seconds": 41.2, "capture_session_id": "sess-1"}


def batch_payload():
    return {"transcript": "Morning, did you book the table? Yes, for eight.",
            "segment_id": f"{CID}_batch", "conversation_id": CID,
            "segments": [dict(s) for s in SEGMENTS], "word_count": 9}


def complete_payload_upload():
    return {"conversation": {"client_id": "omi-pendant-1", "user_id": "u1"},
            "transcript": "Morning, did you book the table? Yes, for eight.",
            "duration": 0, "conversation_id": CID}


def complete_payload_episode(other="c-second"):
    return {"conversation": {"client_id": "", "user_id": "u1"}, "transcript": "...",
            "duration": 100.0, "conversation_id": other,
            "episode_key": "ep-key", "episode_id": "ep-1",
            "started_at": T0, "ended_at": T0_PLUS_100, "title": "Dinner", "summary": "s",
            "related_conversation_ids": [other, CID]}
