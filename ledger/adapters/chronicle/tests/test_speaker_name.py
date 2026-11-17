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
