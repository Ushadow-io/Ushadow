"""Erase cascade: facts proven only by the erased range go; others stay; no erased words remain."""

from __future__ import annotations

from datetime import timedelta

from memory_service.models import SearchFilters
from memory_service.schema import TimeRange
from memory_service.textutil import group_id
from tests.helpers import T0, USER_A, everything, seed, seg_range, texts

DAY = timedelta(days=1)
C1 = [
    ("S0", "Dana likes Jazz."),                                          # 0: kept (only proof outside)
    ("S1", "Zorblax works at Quuxcorp. I will send the flibbet report."),  # 1: erased
    ("S1", "Alice works at Acme."),                                       # 2: erased, but proven in c2 too
    ("S0", "Can you book the venue?"),                                    # 3: kept
]


async def test_erase_removes_only_facts_without_other_proof(deps, port):
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, C1))
    await port.ingest(USER_A, seed(deps, USER_A, "c2", T0 + DAY, [("S1", "Alice works at Acme.")]))
    assert "zorblax" in await everything(deps)

    erased = TimeRange(start=seg_range(T0, 1).start, end=seg_range(T0, 2).end)
    rep = await port.erase(USER_A, "rec-c1", erased)

    assert rep.facts_deleted == 1 and rep.facts_kept == 1  # Zorblax gone; Alice kept by c2
    assert rep.action_facts_erased == 1 and rep.episodes_removed == 1 and rep.episodes_reingested == 1
    assert await texts(port, USER_A, "Zorblax Quuxcorp flibbet") == []
    assert await texts(port, USER_A, "Dana Jazz") == ["Dana likes Jazz"]
    [alice] = await port.search(USER_A, "Alice Acme", SearchFilters(kinds=["knowledge"]))
    assert [e.recordingId for e in alice.evidence] == ["rec-c2"]  # only the proof outside the range
    assert await texts(port, USER_A, "venue", kinds=["action"]) == ["Can you book the venue"]

    dump = await everything(deps)
    for word in ("zorblax", "quuxcorp", "flibbet"):
        assert word not in dump, word
    # The erased action fact keeps its row (taskfacts shape), blanked, plus an `erased` marker.
    erased_rows = [f for f in deps.actions.log if f.key == "erased"]
    assert len(erased_rows) == 1 and erased_rows[0].value == {}

    # The fake ledger still holds the words; a rebuild must not bring them back.
    await port.rebuild(USER_A)
    dump = await everything(deps)
    assert "zorblax" not in dump and "quuxcorp" not in dump
    assert await texts(port, USER_A, "Dana Jazz") == ["Dana likes Jazz"]


async def test_erase_reopens_facts_the_erased_episode_had_closed(deps, port):
    await port.ingest(USER_A, seed(deps, USER_A, "c0", T0, [("S1", "Erin works at Initech.")]))
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0 + DAY, [("S1", "Erin works at Globex.")]))
    assert await texts(port, USER_A, "Erin") == ["Erin works at Globex"]  # Initech closed

    rep = await port.erase(USER_A, "rec-c1", seg_range(T0 + DAY, 0))
    assert rep.closures_reopened == 1
    assert await texts(port, USER_A, "Erin") == ["Erin works at Initech"]  # open again
    [f] = await deps.engine.facts(group_id(USER_A))
    assert not f.closed and "globex" not in await everything(deps)


async def test_erase_with_no_matching_range_changes_nothing(deps, port):
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, C1))
    before = await everything(deps)
    rep = await port.erase(USER_A, "rec-c1", seg_range(T0, 10))
    assert rep.facts_deleted == rep.proofs_removed == rep.episodes_removed == 0
    assert "zorblax" in before and "zorblax" in await everything(deps)
