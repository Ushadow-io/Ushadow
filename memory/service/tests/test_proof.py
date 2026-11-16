"""Proof side table: a fact without a quote that really occurs in the transcript is rejected."""

from __future__ import annotations

from datetime import timedelta

from memory_service.actions import ActionCandidate, FakeActionExtractor
from memory_service.engine import FakeEngine
from memory_service.models import EpisodeInput, SearchFilters, WorkUnit
from memory_service.schema import EvidenceRef, TimeRange
from memory_service.services.episode import EpisodeContext, build_lines, verify
from memory_service.services.port import MemoryPort
from memory_service.textutil import group_id
from tests.helpers import SEG, T0, USER_A, make_deps, seed, texts

LINES = [("S0", "Alice works at Acme."), ("S1", "Can you book the venue?")]


async def test_action_fact_with_made_up_quote_is_rejected_and_counted():
    made_up = ActionCandidate(key="promise_made", text="I will buy a boat", quote="I will buy a boat",
                              direction="owed_by_me")
    deps = make_deps(extractor=FakeActionExtractor(extra=[made_up]))
    port = MemoryPort(deps)
    unit = await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, LINES))

    assert (unit.actions_written, unit.actions_rejected) == (1, 1)
    keys = [a.value["text"] for a in await deps.actions.standing(f"user:{USER_A}")]
    assert keys == ["Can you book the venue"]
    assert (await port.rejections(USER_A))["action_no_valid_proof"] == 1
    assert "boat" not in str([a.value for a in deps.actions.log])


class LyingEngine(FakeEngine):
    """An engine whose proof hint quotes words nobody said (a model can do this)."""

    async def add_episode(self, group: str, episode: EpisodeInput):
        res = await super().add_episode(group, episode)
        for f in res.facts:
            f.hints = [h.model_copy(update={"quote": "Alice works at Globex"}) for h in f.hints]
        return res


async def test_knowledge_fact_with_quote_not_in_transcript_is_rejected():
    deps = make_deps(engine=LyingEngine())
    port = MemoryPort(deps)
    unit = await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, LINES))

    assert (unit.facts_written, unit.facts_rejected) == (0, 1)
    assert await deps.engine.facts(group_id(USER_A)) == []  # removed from the engine too
    assert await texts(port, USER_A, "Alice Acme") == []
    assert (await port.rejections(USER_A))["knowledge_no_valid_proof"] == 1


async def test_verify_checks_quote_against_the_range():
    deps = make_deps()
    conv = seed(deps, USER_A, "c1", T0, LINES)
    unit = WorkUnit(id="u", user_id=USER_A, conversation_id="c1", revision=1, parts=conv.parts,
                    reference_time=T0)
    ctx = EpisodeContext(unit=unit, transcripts={"rec-c1": await deps.ledger.transcripts(USER_A, "rec-c1")},
                         erased=[])
    ctx.lines = build_lines(ctx)
    first = TimeRange(start=T0, end=T0 + SEG - timedelta(seconds=1))
    second = TimeRange(start=T0 + SEG, end=T0 + 2 * SEG - timedelta(seconds=1))

    def ev(rng, quote, rec="rec-c1"):
        return EvidenceRef(recordingId=rec, range=rng, transcriptRevision="final-1", quote=quote)

    assert verify(ev(first, "alice WORKS at acme"), ctx)  # case and punctuation do not matter
    assert not verify(ev(second, "Alice works at Acme"), ctx)  # real words, wrong range
    assert not verify(ev(first, "Alice works at Globex"), ctx)
    assert not verify(ev(first, ""), ctx)
    assert not verify(ev(first, "Alice works at Acme", rec="rec-other"), ctx)
    ctx.erased = [("rec-c1", first.start, first.end)]
    assert not verify(ev(first, "Alice works at Acme"), ctx)  # erased words are no proof


async def test_every_shown_fact_has_a_real_quote(deps, port):
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, LINES))
    facts = await port.search(USER_A, "Alice venue book", SearchFilters())
    assert facts and all(f.evidence and f.evidence[0].quote for f in facts)
    t = (await deps.ledger.transcripts(USER_A, "rec-c1"))[0]
    said = " ".join(s.text for s in t.segments).lower()
    assert all(f.evidence[0].quote.lower().rstrip("?.") in said for f in facts)
