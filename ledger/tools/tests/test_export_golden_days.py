"""Unit tests for the Chronicle -> CaptureBundle mapping. Synthetic data, no network."""

import importlib.util
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "export_golden_days.py"
spec = importlib.util.spec_from_file_location("export_golden_days", SCRIPT)
egd = importlib.util.module_from_spec(spec)
sys.modules["export_golden_days"] = egd
spec.loader.exec_module(egd)

DAY = date(2026, 11, 14)
SRC = "omi-pendant:input:mic0"


def dt(s):
    return egd.to_utc(s)


def conv_doc(cid, start, end, segments, *, source=SRC, end_reason=None, ranges=None, **kw):
    doc = {
        "conversation_id": cid,
        "user_id": "u1",
        "client_id": "omi-pendant",
        "deleted": False,
        "title": "t",
        "created_at": start,
        "audio_ranges": ranges
        if ranges is not None
        else [{"capture_source_id": source, "started_at": start, "ended_at": end, "chunk_ids": ["c"]}],
        "segments": segments,
        "active_transcript_version": "v1",
        "end_reason": end_reason,
    }
    doc.update(kw)
    return doc


def seg(start, end, text, speaker="Speaker 0", **kw):
    return {"start": start, "end": end, "text": text, "speaker": speaker, **kw}


def bundle_for(docs, **kw):
    convs = [egd.normalize_conversation(d) for d in docs]
    return egd.build_bundle(convs, DAY, kw.pop("tz", "UTC"), **kw)


def test_relative_offsets_become_absolute():
    doc = conv_doc("a", "2026-11-14T10:00:00Z", "2026-11-14T10:05:00Z",
                   [seg(0.0, 2.5, "hello"), seg(10.0, 12.25, "world", "Speaker 1")])
    bundle, stats = bundle_for([doc])
    segs = bundle["transcripts"][0]["segments"]
    assert segs[0]["start"] == "2026-11-14T10:00:00.000Z"
    assert segs[0]["end"] == "2026-11-14T10:00:02.500Z"
    assert segs[1]["start"] == "2026-11-14T10:00:10.000Z"
    assert segs[1]["end"] == "2026-11-14T10:00:12.250Z"
    assert segs[1]["speakerLabel"] == "Speaker 1"
    assert stats.recordings == 1 and stats.segments == 2


def test_offsets_walk_across_several_audio_ranges():
    ranges = [
        {"capture_source_id": SRC, "started_at": "2026-11-14T10:00:00Z", "ended_at": "2026-11-14T10:01:00Z"},
        {"capture_source_id": SRC, "started_at": "2026-11-14T10:30:00Z", "ended_at": "2026-11-14T10:31:00Z"},
    ]
    doc = conv_doc("a", None, None, [seg(30, 31, "in first"), seg(70, 75, "in second")], ranges=ranges)
    bundle, _ = bundle_for([doc])
    segs = bundle["transcripts"][0]["segments"]
    assert segs[0]["start"] == "2026-11-14T10:00:30.000Z"
    assert segs[1]["start"] == "2026-11-14T10:30:10.000Z"  # 70 s = 60 s of range 1 + 10 s
    assert bundle["recordings"][0]["range"] == {"start": "2026-11-14T10:00:00.000Z",
                                                "end": "2026-11-14T10:31:00.000Z"}


def test_recording_crossing_midnight_is_in_both_days():
    doc = conv_doc("night", "2026-11-14T23:50:00Z", "2026-11-15T00:10:00Z",
                   [seg(0, 5, "before"), seg(900, 905, "after midnight")], end_reason="user_stopped")
    convs = [egd.normalize_conversation(doc)]
    day14, s14 = egd.build_bundle(convs, date(2026, 11, 14), "UTC")
    day15, s15 = egd.build_bundle(convs, date(2026, 11, 15), "UTC")
    assert s14.recordings == 1 and s15.recordings == 1
    assert s14.minutes == pytest.approx(10.0) and s15.minutes == pytest.approx(10.0)
    # the whole recording, with absolute times, appears on both days
    assert day14["transcripts"][0]["segments"][1]["start"] == "2026-11-15T00:05:00.000Z"
    assert day15["recordings"][0]["id"] == "night"
    assert day15["recordings"][0]["endReason"] == "user_action"


def test_day_is_cut_in_the_user_timezone():
    # 23:30 UTC on the 14th is 00:30 on the 15th in Europe/Berlin (UTC+1 in November)
    doc = conv_doc("late", "2026-11-14T23:30:00Z", "2026-11-14T23:40:00Z", [seg(0, 1, "x")])
    convs = [egd.normalize_conversation(doc)]
    _, in_utc = egd.build_bundle(convs, date(2026, 11, 14), "UTC")
    _, in_berlin = egd.build_bundle(convs, date(2026, 11, 14), "Europe/Berlin")
    assert in_utc.recordings == 1 and in_berlin.recordings == 0


def test_missing_speaker_gets_unknown_label_and_speaker_entry():
    doc = conv_doc("m", "2026-11-14T09:00:00Z", "2026-11-14T09:01:00Z",
                   [seg(0, 1, "a", speaker=None), seg(2, 3, "b", speaker="  "), seg(4, 5, "c", "Speaker 0")])
    bundle, _ = bundle_for([doc])
    tr = bundle["transcripts"][0]
    assert [s["speakerLabel"] for s in tr["segments"]] == ["unknown", "unknown", "Speaker 0"]
    assert {s["label"] for s in tr["speakers"]} == {"unknown", "Speaker 0"}
    assert all(s["role"] == "unknown" for s in tr["speakers"])


def test_identified_speaker_and_owner_role():
    doc = conv_doc("i", "2026-11-14T09:00:00Z", "2026-11-14T09:01:00Z",
                   [seg(0, 1, "a", "Speaker 0", identified_as="Stu"), seg(2, 3, "b", "Speaker 1", identified_as="Ann")])
    bundle, _ = bundle_for([doc], owner_name="stu")
    roles = {s["label"]: (s["role"], s.get("displayName")) for s in bundle["transcripts"][0]["speakers"]}
    assert roles == {"Speaker 0": ("owner", "Stu"), "Speaker 1": ("unknown", "Ann")}


def test_segment_overrunning_range_extends_recording():
    doc = conv_doc("o", "2026-11-14T09:00:00Z", "2026-11-14T09:00:10Z", [seg(5, 20, "long")])
    bundle, _ = bundle_for([doc])
    assert bundle["recordings"][0]["range"]["end"] == "2026-11-14T09:00:20.000Z"


def test_gap_only_when_cause_known():
    a = conv_doc("a", "2026-11-14T09:00:00Z", "2026-11-14T09:10:00Z", [seg(0, 1, "x")], end_reason="websocket_disconnect")
    b = conv_doc("b", "2026-11-14T09:20:00Z", "2026-11-14T09:30:00Z", [seg(0, 1, "x")], end_reason="inactivity_timeout")
    c = conv_doc("c", "2026-11-14T10:00:00Z", "2026-11-14T10:05:00Z", [seg(0, 1, "x")])
    bundle, stats = bundle_for([c, b, a])
    assert [g["cause"] for g in bundle["gaps"]] == ["disconnected"]
    assert bundle["gaps"][0]["range"] == {"start": "2026-11-14T09:10:00.000Z", "end": "2026-11-14T09:20:00.000Z"}
    assert stats.unknown_gaps_skipped == 1  # b -> c, ended by silence, cause unknown


def test_short_gap_ignored_and_privacy_gap_is_excluded():
    a = conv_doc("a", "2026-11-14T09:00:00Z", "2026-11-14T09:10:00Z", [seg(0, 1, "x")], end_reason="user_stopped")
    b = conv_doc("b", "2026-11-14T09:10:30Z", "2026-11-14T09:20:00Z", [seg(0, 1, "x")])
    privacy = egd.parse_privacy_intervals({"privacy_intervals": [
        {"source_id": SRC, "state": "excluded", "started_at": "2026-11-14T12:00:00Z", "ended_at": "2026-11-14T12:30:00Z"},
        {"source_id": SRC, "state": "pending", "started_at": "2026-11-14T13:00:00Z", "ended_at": "2026-11-14T13:30:00Z"},
    ]})
    bundle, _ = bundle_for([a, b], privacy=privacy)
    assert [g["cause"] for g in bundle["gaps"]] == ["excluded"]


def test_privacy_gap_inside_one_recording_gets_its_recording_id():
    a = conv_doc("a", "2026-11-14T09:00:00Z", "2026-11-14T10:00:00Z", [seg(0, 1, "x")])
    privacy = egd.parse_privacy_intervals({"privacy_intervals": [
        {"source_id": SRC, "state": "excluded", "started_at": "2026-11-14T09:10:00Z", "ended_at": "2026-11-14T09:20:00Z"},
        {"source_id": SRC, "state": "excluded", "started_at": "2026-11-14T12:00:00Z", "ended_at": "2026-11-14T12:30:00Z"},
    ]})
    bundle, _ = bundle_for([a], privacy=privacy)
    inside, between = bundle["gaps"]
    assert inside["recordingId"] == "a" and inside["cause"] == "excluded"
    assert "recordingId" not in between


def test_exported_transcripts_are_final_and_carry_no_owner_or_audio():
    bundle, _ = bundle_for([conv_doc("a", "2026-11-14T09:00:00Z", "2026-11-14T09:10:00Z", [seg(0, 1, "x")])])
    assert [t["status"] for t in bundle["transcripts"]] == ["final"]
    assert "ownerPersonId" not in bundle and "audio" not in bundle["recordings"][0]


def test_deleted_conversations_are_skipped():
    doc = conv_doc("d", "2026-11-14T09:00:00Z", "2026-11-14T09:01:00Z", [seg(0, 1, "x")], deleted=True)
    _, stats = bundle_for([doc])
    assert stats.recordings == 0


def test_mongo_shape_uses_active_transcript_version_and_naive_datetimes():
    doc = {
        "conversation_id": "mongo", "user_id": "u1", "client_id": "phone-1", "deleted": False,
        "created_at": datetime(2026, 11, 14, 8, 0),
        "audio_ranges": [{"capture_source_id": "phone-1:input:mic", "started_at": datetime(2026, 11, 14, 8, 0),
                          "ended_at": datetime(2026, 11, 14, 8, 1)}],
        "active_transcript_version": "v2",
        "transcript_versions": [
            {"version_id": "v1", "segments": [seg(0, 1, "old")]},
            {"version_id": "v2", "model": "nova-3", "created_at": datetime(2026, 11, 14, 9, 0),
             "segments": [seg(3, 4, "new")]},
        ],
    }
    bundle, _ = bundle_for([doc])
    tr = bundle["transcripts"][0]
    assert tr["revision"] == "v2" and tr["model"] == "nova-3"
    assert tr["createdAt"] == "2026-11-14T09:00:00.000Z"
    assert tr["segments"][0]["start"] == "2026-11-14T08:00:03.000Z"
    assert bundle["sources"][0]["kind"] == "phone"


def test_expected_flags_human_edits_and_sorts():
    eps = [
        {"episode_id": "e2", "episode_key": "k2", "revision": 1, "started_at": "2026-11-14T11:00:00Z",
         "ended_at": "2026-11-14T12:00:00Z", "kind": "meeting", "title": "Human", "status": "settled",
         "confirmed_at": "2026-11-15T08:00:00Z", "confirmed_fields": ["title", "started_at"]},
        {"episode_id": "e1", "episode_key": "k1", "revision": 0, "started_at": datetime(2026, 11, 14, 9, 0),
         "ended_at": datetime(2026, 11, 14, 10, 0), "kind": "walk", "title": "Auto", "status": "provisional"},
    ]
    doc = conv_doc("a", "2026-11-14T09:00:00Z", "2026-11-14T09:10:00Z", [seg(0, 1, "x")])
    exp = egd.build_expected([egd.normalize_conversation(doc)], eps, DAY, "UTC")
    assert [e["episodeId"] for e in exp["episodes"]] == ["e1", "e2"]
    assert exp["episodes"][0]["human"] is False
    assert exp["episodes"][1]["human"] is True
    assert exp["episodes"][1]["humanFields"] == ["started_at", "title"]
    assert exp["conversations"][0]["conversationId"] == "a"


def test_output_is_deterministic_regardless_of_input_order():
    docs = [conv_doc(f"c{i}", f"2026-11-14T{9 + i:02d}:00:00Z", f"2026-11-14T{9 + i:02d}:30:00Z",
                     [seg(0, 1, "x"), seg(5, 6, "y", "Speaker 1")]) for i in range(3)]
    one, _ = bundle_for(docs)
    two, _ = bundle_for(list(reversed(docs)))
    assert egd.dump_json(one) == egd.dump_json(two)


# ---- schema validation (needs jsonschema and the life-datatypes schema file)

SCHEMA = egd.DEFAULT_SCHEMA


@pytest.mark.skipif(not SCHEMA.is_file(), reason="life-datatypes schema not available")
def test_bundle_validates_against_schema():
    pytest.importorskip("jsonschema")
    docs = [
        conv_doc("a", "2026-11-14T23:50:00Z", "2026-11-15T00:10:00Z",
                 [seg(0, 5, "x", None), seg(600, 610, "y", "Speaker 1", confidence=0.9)], end_reason="websocket_disconnect"),
        conv_doc("b", "2026-11-14T09:00:00Z", "2026-11-14T09:10:00Z", [seg(0, 1, "z")]),
    ]
    privacy = [(SRC, dt("2026-11-14T09:02:00Z"), dt("2026-11-14T09:03:00Z"))]
    bundle, _ = bundle_for(docs, privacy=privacy)
    assert bundle["gaps"][0]["recordingId"] == "b"
    schema = egd.load_schema(SCHEMA)
    egd.validate_bundle(bundle, schema)


@pytest.mark.skipif(not SCHEMA.is_file(), reason="life-datatypes schema not available")
def test_invalid_bundle_fails_loudly_without_leaking_values():
    pytest.importorskip("jsonschema")
    bundle, _ = bundle_for([conv_doc("a", "2026-11-14T09:00:00Z", "2026-11-14T09:10:00Z", [seg(0, 1, "SECRET WORDS")])])
    bundle["recordings"][0]["origin"] = "bogus"
    with pytest.raises(egd.BundleInvalid) as err:
        egd.validate_bundle(bundle, egd.load_schema(SCHEMA))
    assert "bogus" not in str(err.value) and "SECRET" not in str(err.value)
    assert "origin" in str(err.value)


def test_generic_label_is_not_a_name():
    import export_golden_days as ex

    for label in ("Speaker 0", "speaker_12", "unknown", "3"):
        assert ex.GENERIC_LABEL.match(label)
    assert not ex.GENERIC_LABEL.match("Ann")
