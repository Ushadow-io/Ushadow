import copy
import json
import pathlib

import pytest

from ledger_adapter import mapping as m
import fixtures as fx

SCHEMA = pathlib.Path("/Users/stu/repos/life-datatypes/schema/conversation.json")


def build(event, data, facts=None, **kw):
    return m.build_bundle(event, data, facts or fx.facts(), **kw)


def test_complete_absolute_times_and_speakers():
    b, why = build(m.EVENT_COMPLETE, fx.complete_payload_upload(), owner_names=["stu"])
    assert why is None
    t = b["transcripts"][0]
    assert t["revision"] == "ver-1" and t["model"] == "nova-3"
    s0, s1 = t["segments"]
    assert s0["start"] == "2026-11-14T07:30:00.400Z" and s0["end"] == "2026-11-14T07:30:03.200Z"
    assert s1["speakerLabel"] == "Speaker 1"
    roles = {s["label"]: s["role"] for s in t["speakers"]}
    assert roles == {"Speaker 0": "owner", "Speaker 1": "unknown"}
    assert len(t["segments"]) == 2  # the [laughter] event segment is not transcript
    rec = b["recordings"][0]
    assert rec["range"] == {"start": "2026-11-14T07:30:00.000Z", "end": "2026-11-14T07:31:40.000Z"}
    assert rec["endReason"] == "silence" and rec["origin"] == "live"
    assert rec["id"] == f"chronicle:{fx.CID}"


def test_no_owner_names_means_unknown_role():
    b, _ = build(m.EVENT_COMPLETE, fx.complete_payload_upload())
    assert {s["role"] for s in b["transcripts"][0]["speakers"]} == {"unknown"}


def test_streaming_uses_payload_segments_and_live_revision():
    b, why = build(m.EVENT_STREAMING, fx.streaming_payload())
    assert why is None and b["transcripts"][0]["revision"] == "live"
    assert b["transcripts"][0]["segments"][0]["start"] == "2026-11-14T07:30:00.400Z"
    assert "endReason" not in b["recordings"][0]


def test_status_provisional_for_live_and_final_otherwise_without_owner_or_audio():
    live, _ = build(m.EVENT_STREAMING, fx.streaming_payload())
    final, _ = build(m.EVENT_COMPLETE, fx.complete_payload_upload())
    assert live["transcripts"][0]["status"] == "provisional"
    assert final["transcripts"][0]["status"] == "final"
    for b in (live, final):
        assert "provisional" not in b["transcripts"][0]["metadata"]["chronicle"]
        # Chronicle has no person id and no stable audio file pointer: both left out
        assert "ownerPersonId" not in b and "audio" not in b["recordings"][0]


def test_ingest_request_wraps_the_bundle_with_the_account_owner():
    b, _ = build(m.EVENT_COMPLETE, fx.complete_payload_upload())
    req, why = m.ingest_request("u1", b)
    assert why is None and req == {"userId": "u1", "bundle": b}
    req, why = m.ingest_request(None, b)
    assert req is None and "user_id" in why


def test_streaming_on_capture_session_clock_is_refused():
    p = fx.streaming_payload()
    p["timestamp_clock"] = "capture_session"
    b, why = build(m.EVENT_STREAMING, p)
    assert b is None and "capture_session" in why


def test_streaming_without_conversation_id_is_refused():  # streaming_consumer.py:1002 path
    p = {"transcript": "x", "session_id": "s", "client_id": "c", "segments": [], "is_final": True}
    assert m.conversation_ids(m.EVENT_STREAMING, p) == []


def test_batch_revision_is_content_hash_and_deterministic():
    a, _ = build(m.EVENT_BATCH, fx.batch_payload())
    b, _ = build(m.EVENT_BATCH, fx.batch_payload())
    assert a == b
    changed = fx.batch_payload()
    changed["segments"][0]["text"] = "Different."
    c, _ = build(m.EVENT_BATCH, changed)
    assert c["transcripts"][0]["revision"] != a["transcripts"][0]["revision"]


def test_no_audio_ranges_sends_nothing():
    b, why = build(m.EVENT_STREAMING, fx.streaming_payload(), fx.facts(audio_ranges=[]))
    assert b is None and "no audio_ranges" in why


def test_unknown_time_basis_sends_nothing():
    f = fx.facts()
    f["audio_ranges"][0]["time_basis"] = "unknown"
    b, why = build(m.EVENT_COMPLETE, fx.complete_payload_upload(), f)
    assert b is None and "time_basis" in why


def test_segments_outside_claimed_audio_are_dropped_not_guessed():
    f = fx.facts()
    f["segments"].append({"start": 500.0, "end": 502.0, "text": "way past the end", "speaker": "Speaker 0"})
    b, _ = build(m.EVENT_COMPLETE, fx.complete_payload_upload(), f)
    assert len(b["transcripts"][0]["segments"]) == 2
    assert b["transcripts"][0]["metadata"]["chronicle"]["dropped_segments"] == 1


def test_multi_range_offsets_follow_chronicle_mapper():
    # two ranges with a real wall-clock gap between them: 0-60 s, then 60-120 s of the clock
    f = fx.facts(audio_ranges=[
        {"started_at": "2026-11-14T07:30:00Z", "ended_at": "2026-11-14T07:31:00Z", "time_basis": "captured"},
        {"started_at": "2026-11-14T08:00:00Z", "ended_at": "2026-11-14T08:01:00Z", "time_basis": "captured"},
    ])
    f["segments"] = [{"start": 61.0, "end": 63.0, "text": "after the gap", "speaker": "Speaker 0"}]
    b, _ = build(m.EVENT_COMPLETE, fx.complete_payload_upload(), f)
    assert b["transcripts"][0]["segments"][0]["start"] == "2026-11-14T08:00:01.000Z"


def test_conversation_ids_for_episode_event_come_from_related_ids():
    ids = m.conversation_ids(m.EVENT_COMPLETE, fx.complete_payload_episode())
    assert ids == ["c-second", fx.CID]
    assert m.conversation_ids(m.EVENT_COMPLETE, fx.complete_payload_upload()) == [fx.CID]


def test_naive_and_iso_datetimes_are_accepted():
    f = fx.facts()
    f["audio_ranges"][0]["started_at"] = "2026-11-14T07:30:00"  # naive = UTC (Mongo returns naive UTC)
    f["audio_ranges"][0]["ended_at"] = "2026-11-14T07:31:40Z"
    b, _ = build(m.EVENT_COMPLETE, fx.complete_payload_upload(), f)
    assert b["transcripts"][0]["segments"][0]["start"] == "2026-11-14T07:30:00.400Z"


def test_input_not_mutated_and_output_json_serialisable():
    data, facts = fx.streaming_payload(), fx.facts()
    before = copy.deepcopy((data, facts))
    b, _ = build(m.EVENT_STREAMING, data, facts)
    assert (data, facts) == before
    json.dumps(b)


@pytest.mark.skipif(not SCHEMA.exists(), reason="life-datatypes checkout not present")
def test_bundle_validates_against_life_datatypes_schema():
    jsonschema = pytest.importorskip("jsonschema")
    schema = json.loads(SCHEMA.read_text())
    root = {"$ref": "#/definitions/CaptureBundle", "definitions": schema["definitions"]}
    for ev, payload in [(m.EVENT_COMPLETE, fx.complete_payload_upload()),
                        (m.EVENT_STREAMING, fx.streaming_payload()),
                        (m.EVENT_BATCH, fx.batch_payload())]:
        b, _ = build(ev, payload, owner_names=["stu"])
        jsonschema.validate(b, root)
