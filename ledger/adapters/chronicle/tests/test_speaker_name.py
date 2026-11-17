"""A name can be in `identified_as` or written over `speaker` itself."""
from ledger_adapter import mapping


def test_name_from_identified_as():
    assert mapping.speaker_name({"identified_as": "Ann"}, "Speaker 1") == "Ann"


def test_name_written_over_speaker_field():
    assert mapping.speaker_name({"identified_as": None}, "Ann") == "Ann"


def test_generic_labels_are_not_names():
    for label in ("Speaker 0", "speaker_12", "unknown", "Unknown Speaker", "3"):
        assert mapping.speaker_name({}, label) is None
    assert mapping.speaker_name({"identified_as": "Unknown"}, "Speaker 2") is None


def test_hand_triage_label_is_media_not_a_name():
    assert mapping.speaker_name({}, "Background Speech") is None
    assert mapping.speaker_role("Background Speech", None, {"stu"}, "input") == "media"
    assert mapping.speaker_role("Noise", None, set(), "input") == "background"


def test_system_audio_without_a_name_is_media():
    assert mapping.speaker_role("Speaker 1", None, {"stu"}, "output") == "media"
    assert mapping.speaker_role("Speaker 1", None, {"stu"}, "input") == "unknown"
    assert mapping.speaker_role("Speaker 1", None, {"stu"}, "unknown") == "unknown"


def test_a_name_wins_over_the_capture_route():
    assert mapping.speaker_role("Stu", "Stu", {"stu"}, "output") == "owner"
    assert mapping.speaker_role("Ann", "Ann", {"stu"}, "output") == "unknown"


def test_capture_direction():
    assert mapping.capture_direction("screenpipe:dev:output") == "output"
    assert mapping.capture_direction("a:b:input:x") == "input"
    assert mapping.capture_direction(None) == "unknown"


def test_triaged_segment_is_kept_with_its_role():
    ranges = [{"start": mapping.parse_dt("2026-01-01T00:00:00Z"),
               "end": mapping.parse_dt("2026-01-01T00:01:00Z"), "time_basis": "x", "duration": 60.0}]
    raw = [{"start": 1, "end": 2, "text": "tv words", "speaker": "Background Speech",
            "segment_type": "event"},
           {"start": 3, "end": 4, "text": "[laughter]", "speaker": "Speaker 0",
            "segment_type": "event"},
           {"start": 5, "end": 6, "text": "hello", "speaker": "Stu", "segment_type": "speech"}]
    segs, speakers, _ = mapping._map_segments(raw, ranges, ["stu"], "p")
    roles = {s["label"]: s["role"] for s in speakers}
    assert roles == {"Background Speech": "media", "Stu": "owner"}
    assert len(segs) == 2
