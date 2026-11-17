"""Code checks on model answers: splits must cite a real segment and leave both sides big
enough; composer citations must be segments of the conversation; bad answers fall back to
rules that are recorded as such."""

from __future__ import annotations

from datetime import timedelta

from ledger.llm import FakeBehaviour
from ledger.services.l2.lines import Line
from ledger.services.l2.rules import Side, check_split, human_index, split_index
from tests.conftest import make_services
from tests.fixtures.l2_day import SPLIT_MARKER, USER, at
from tests.l2_helpers import ingest_and_run, l2_services, recordings, shape


async def _reasons(services, prefix: str) -> list[str]:
    docs = await services.stores.links.find({})
    return [d["body"]["reason"] for d in docs if d["key"].startswith(prefix)]


async def test_split_citing_a_missing_segment_is_rejected():
    services = l2_services(FakeBehaviour(split_marker=SPLIT_MARKER, bogus_split=True))
    await ingest_and_run(services)
    rows = await shape(services)
    assert recordings(rows[0]) == ["rec-m", "rec-n"]  # no split
    assert "split_rejected:unknown_segment" in await _reasons(services, "split:")


async def test_split_leaving_a_too_small_side_is_rejected():
    # "line 99 " is the last line of rec-m: the side after it would hold one line
    services = l2_services(FakeBehaviour(split_marker="line 99 "))
    await ingest_and_run(services)
    assert recordings((await shape(services))[0]) == ["rec-m", "rec-n"]
    assert await _reasons(services, "split:") == ["split_rejected:min_size"]


def _line(i: int, seconds: float = 6.0) -> Line:
    start = at("10:00:00") + timedelta(seconds=seconds * i)
    return Line(
        f"s-{i}", "r", "rev", start, start + timedelta(seconds=5), "S0", "owner", None, None, "x"
    )


def test_split_rules_are_pure_checks():
    lines = [_line(i) for i in range(6)]
    assert split_index(lines, "s-3") == 3 and split_index(lines, "nope") is None
    assert check_split(None, lines, 3) is None
    assert check_split(None, lines, 1) == "min_size"  # one line before
    assert check_split(None, lines, 5) == "min_size"  # one line after
    prior = Side(count=4, start=at("09:59:00"), end=at("09:59:30"))
    assert check_split(prior, lines, 0) is None  # the conversation so far is the first side
    assert human_index(lines, at("10:00:07")) == 2


async def test_composer_stores_only_verified_citations():
    services = l2_services(FakeBehaviour(split_marker=SPLIT_MARKER, cite_bogus=True))
    result = await ingest_and_run(services)
    composer = result.model.layers["composer"]
    assert composer.retries == 2 * 4 and composer.fallbacks == 4  # bounded retries, then drop
    for view in await services.conversations.list(USER, None):
        conv = view.conversation
        seg_ranges = {(f.recordingId, f.range.start, f.range.end) for f in view.fragments}
        assert conv.citations and len(conv.citations) == 2
        for ref in conv.citations:
            assert any(
                rec == ref.recordingId and start <= ref.range.start and ref.range.end <= end
                for rec, start, end in seg_ranges
            )
    again = await ingest_and_run(services)
    assert again.model.calls == 0  # composed once per (id, revision), even after a fallback


async def test_one_broken_answer_is_retried():
    services = l2_services(FakeBehaviour(split_marker=SPLIT_MARKER, broken_answers=1))
    result = await ingest_and_run(services)
    assert result.model.layers["state"].retries == 1
    assert result.model.layers["state"].fallbacks == 0
    clean = l2_services()
    await ingest_and_run(clean)
    assert await shape(services) == await shape(clean)


async def test_always_invalid_model_falls_back_to_recorded_rules():
    services = l2_services(FakeBehaviour(broken_answers=10_000))
    result = await ingest_and_run(services)
    assert result.model.layers["gap"].fallbacks >= 1
    reasons = await _reasons(services, "join:")
    assert any(r.endswith(":model_invalid") for r in reasons)
    rows = await shape(services)
    assert rows and all(r[7] is None for r in rows)  # no title: never guessed
    again = await ingest_and_run(services)
    assert again.model.calls == 0 and await shape(services) == rows


async def test_no_model_configured_saves_no_model_decision():
    services = make_services()  # NullModel: every call is unavailable
    await ingest_and_run(services)
    first = await shape(services)
    again = await ingest_and_run(services)
    assert again.model.layers["gap"].unavailable >= 1  # asked again: nothing was saved
    assert await shape(services) == first
    assert first and all(r[7] is None for r in first)


def test_model_sees_short_line_refs_and_code_maps_them_back():
    from ledger.l2_models import ConvState
    from ledger.services.l2.prompts import composer_payload, ref_index, state_payload

    lines = [
        Line(f"chronicle:aaaa:bbbb:{i:05d}", "rec", "rev", at("09:00:00") + timedelta(seconds=i),
             at("09:00:00") + timedelta(seconds=i + 1), "Speaker 0", "unknown", None, None,
             f"text {i}")
        for i in range(3)
    ]
    rows = state_payload(ConvState(), lines, True)["lines"]
    assert [r.split("|")[0] for r in rows] == ["L1", "L2", "L3"]
    assert "chronicle:" not in "".join(rows)
    payload, seg_ids = composer_payload(ConvState(), lines)
    assert seg_ids == [ln.seg_id for ln in lines] and payload["lines"][0].startswith("L1|")
    assert [ref_index(v, 3) for v in ("L1", "l3", 2, " L2 ", "L4", "L0", "x", None)] == [
        0, 2, 1, 1, None, None, None, None,
    ]
