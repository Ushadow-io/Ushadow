from __future__ import annotations

import copy
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

from s1.episodes import (  # noqa: E402
    build_episodes,
    conversations_from_expected,
    discover_days,
    load_json,
    parse_time,
    split_lines,
)
from s1.probes import compare_runs  # noqa: E402

FIX = HERE / "fixtures" / "synthetic"


@pytest.fixture()
def day():
    return load_json(FIX / "2026-01-05.bundle.json"), load_json(FIX / "2026-01-05.expected.json")


def test_discover_days_pairs_bundle_and_expected():
    days = discover_days(FIX)
    assert [d[0] for d in days] == ["2026-01-05"]
    assert days[0][2] is not None


def test_one_episode_per_conversation_in_time_order(day):
    eps, info = build_episodes(*day, "2026-01-05")
    assert [e.episode_id for e in eps] == ["conv-1@r1", "conv-2@r2"]
    assert info.mode == "conversation"
    assert info.conversations_total == 3
    assert info.conversations_empty == 1  # conv-3 has no segments


def test_reference_time_is_real_absolute_start(day):
    eps, _ = build_episodes(*day, "2026-01-05")
    assert eps[0].reference_time == datetime(2026, 1, 5, 9, 1, 0, tzinfo=UTC)
    assert eps[1].reference_time == datetime(2026, 1, 5, 9, 21, 0, tzinfo=UTC)
    assert eps[1].end_time == datetime(2026, 1, 5, 14, 1, 12, tzinfo=UTC)


def test_multi_part_conversation_spans_recordings(day):
    eps, _ = build_episodes(*day, "2026-01-05")
    assert eps[1].recording_ids == ["rec-a", "rec-b"]
    assert len(eps[1].lines) == 4


def test_current_revision_used_and_media_dropped(day):
    eps, info = build_episodes(*day, "2026-01-05")
    body = eps[0].body()
    assert "OLD REVISION" not in body
    assert "weather" not in body
    assert info.lines_dropped_by_role == 1
    assert body.splitlines()[0].startswith("Owner: ")
    assert body.splitlines()[1].startswith("Priya: ")


def test_media_kept_when_not_dropped(day):
    eps, _ = build_episodes(*day, "2026-01-05", drop_roles=frozenset())
    assert "weather" in eps[0].body()


def test_unassigned_lines_counted(day):
    _, info = build_episodes(*day, "2026-01-05")
    assert info.lines_unassigned == 1  # "printer ink" is outside every conversation


def test_fallback_to_windows_without_conversations(day):
    bundle, _ = day
    eps, info = build_episodes(bundle, None, "2026-01-05", window_minutes=10)
    assert info.mode == "window"
    assert [e.episode_id for e in eps] == [
        "2026-01-05-w054", "2026-01-05-w056", "2026-01-05-w084", "2026-01-05-w085"]
    assert sum(len(e.lines) for e in eps) == 8  # all non-media lines


def test_bundle_conversations_used_when_no_expected(day):
    bundle, expected = day
    b = copy.deepcopy(bundle)
    b["conversations"] = expected["conversations"]
    eps, info = build_episodes(b, None, "2026-01-05")
    assert info.mode == "conversation" and len(eps) == 2


def test_long_episode_is_split_and_ids_are_stable(day):
    eps, info = build_episodes(*day, "2026-01-05", max_chars=80)
    assert info.episodes_split >= 1
    assert all("#p" in e.episode_id for e in eps if e.conversation_id == "conv-2")
    assert all(e.reference_time == e.lines[0].start for e in eps)


def test_split_lines_never_loses_lines(day):
    eps, _ = build_episodes(*day, "2026-01-05")
    lines = list(eps[1].lines)
    assert sum(len(c) for c in split_lines(lines, 1)) == len(lines)
    assert split_lines(lines, 0) == [lines]


def test_stats_have_no_text(day):
    eps, _ = build_episodes(*day, "2026-01-05")
    s = str(eps[0].stats())
    assert "Priya" not in s and "venue" not in s


def test_expected_shapes():
    assert conversations_from_expected([{"id": "x"}]) == [{"id": "x"}]
    assert conversations_from_expected({"conversations": []}) == []
    with pytest.raises(ValueError):
        conversations_from_expected({"nope": 1})


def test_naive_time_rejected():
    with pytest.raises(ValueError):
        parse_time("2026-01-05T09:00:00")


def test_compare_runs_overlap():
    r1 = [{"fact": "Tom works at the bakery"}, {"fact": "Priya booked Alfama hall"}]
    r2 = [{"fact": "tom works at the bakery."}, {"fact": "Agenda goes out tomorrow"}]
    c = compare_runs(r1, r2, ["Tom", "Priya"], ["Tom"])
    assert c["fact_exact_jaccard"] == round(1 / 3, 3)
    assert c["fact_fuzzy_match_run1_in_run2_at_0.6"] == 0.5
    assert c["entity_name_jaccard"] == 0.5
