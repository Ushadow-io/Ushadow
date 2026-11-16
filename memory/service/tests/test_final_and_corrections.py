"""Proof uses final words only, with the ledger's corrections applied before the quote check."""

from __future__ import annotations

from datetime import timedelta

from memory_service.models import UnitStatus, WorkUnit
from memory_service.schema import EvidenceRef, TimeRange, Transcript, TranscriptCorrection
from memory_service.services.episode import EpisodeContext, verify
from tests.helpers import T0, USER_A, add_recording, conversation, everything, seg_range, texts


def transcript(rec: str, revision: str, created_min: int, text: str, owner: bool = True) -> Transcript:
    start = T0
    return Transcript.model_validate({
        "recordingId": rec, "revision": revision,
        "createdAt": (T0 + timedelta(minutes=created_min)).isoformat(),
        "speakers": [{"label": "S0", "role": "owner" if owner else "unknown"}],
        "segments": [{"id": f"{revision}-0", "text": text, "speakerLabel": "S0",
                      "start": start.isoformat(), "end": (start + timedelta(seconds=9)).isoformat()}]})


async def test_provisional_transcript_is_never_proof(deps, port):
    deps.ledger.add_transcript(USER_A, transcript("rec-c1", "f1", 1, "Alice works at Acme."))
    # a newer provisional revision says something else: it must not be used or accepted
    deps.ledger.add_transcript(USER_A, transcript("rec-c1", "p2", 5, "Alice works at Globex."),
                               status="provisional")
    conv = conversation("c1", "rec-c1", T0, 1)
    deps.ledger.add_conversation(USER_A, conv)
    unit = await port.ingest(USER_A, conv)
    assert unit.status == UnitStatus.done
    assert await texts(port, USER_A, "Alice") == ["Alice works at Acme"]
    assert "globex" not in await everything(deps)

    # an engine hint that points at the provisional revision is rejected by verify()
    ctx = EpisodeContext(unit=unit, transcripts={"rec-c1": await deps.ledger.transcripts(USER_A, "rec-c1")},
                         erased=[])
    rng = TimeRange(start=T0, end=T0 + timedelta(seconds=9))
    assert verify(EvidenceRef(recordingId="rec-c1", range=rng, transcriptRevision="f1",
                              quote="works at Acme"), ctx)
    assert not verify(EvidenceRef(recordingId="rec-c1", range=rng, transcriptRevision="p2",
                                  quote="works at Globex"), ctx)


async def test_only_provisional_waits_then_runs_when_final_arrives(deps, port):
    deps.ledger.add_transcript(USER_A, transcript("rec-c1", "p1", 1, "Alice works at Acme."),
                               status="provisional")
    conv = conversation("c1", "rec-c1", T0, 1)
    unit = await port.ingest(USER_A, conv)
    assert unit.status == UnitStatus.failed and unit.last_error == "NoFinalTranscript"
    assert await texts(port, USER_A, "Alice") == []
    deps.ledger.add_transcript(USER_A, transcript("rec-c1", "f2", 2, "Alice works at Acme."))
    [retried] = await port.run_pending(USER_A)
    assert retried.status == UnitStatus.done
    assert await texts(port, USER_A, "Alice") == ["Alice works at Acme"]


async def test_newest_final_revision_is_used(deps, port):
    deps.ledger.add_transcript(USER_A, transcript("rec-c1", "f1", 1, "Alice works at Acme."))
    deps.ledger.add_transcript(USER_A, transcript("rec-c1", "f2", 3, "Alice works at Initech."))
    await port.ingest(USER_A, conversation("c1", "rec-c1", T0, 1))
    assert await texts(port, USER_A, "Alice") == ["Alice works at Initech"]


async def test_corrections_replace_the_text_before_the_quote_check(deps, port):
    add_recording(deps.ledger, USER_A, "rec-c1", T0, [("S0", "Alice works at Acme."),
                                                      ("S1", "Dana likes Jazz.")])
    deps.ledger.add_correction(USER_A, TranscriptCorrection.model_validate({
        "id": "k1", "recordingId": "rec-c1", "range": seg_range(T0, 0).model_dump(mode="json"),
        "text": "Alice works at Initech.", "author": "owner",
        "recordedAt": (T0 + timedelta(hours=1)).isoformat()}))
    conv = conversation("c1", "rec-c1", T0, 2)
    unit = await port.ingest(USER_A, conv)

    assert await texts(port, USER_A, "Alice Acme Initech") == ["Alice works at Initech"]
    assert await texts(port, USER_A, "Dana") == ["Dana likes Jazz"]  # outside the range: unchanged
    assert "acme" not in await everything(deps)
    # the old (uncorrected) words are no longer valid proof; the corrected ones are
    ctx = EpisodeContext(unit=WorkUnit.model_validate(unit.model_dump()),
                         transcripts={"rec-c1": await deps.ledger.transcripts(USER_A, "rec-c1")},
                         corrections={"rec-c1": await deps.ledger.corrections(USER_A, "rec-c1")},
                         erased=[])
    r = seg_range(T0, 0)
    assert verify(EvidenceRef(recordingId="rec-c1", range=r, quote="works at Initech"), ctx)
    assert not verify(EvidenceRef(recordingId="rec-c1", range=r, quote="works at Acme"), ctx)


async def test_later_correction_wins_and_range_may_span_segments(deps, port):
    add_recording(deps.ledger, USER_A, "rec-c1", T0, [("S0", "Alice works at Acme."),
                                                      ("S0", "Erin lives in Oslo.")])
    both = TimeRange(start=T0, end=T0 + timedelta(seconds=19)).model_dump(mode="json")
    for cid, text, minute in (("k1", "Alice works at Initech.", 1), ("k2", "Alice works at Globex.", 2)):
        deps.ledger.add_correction(USER_A, TranscriptCorrection.model_validate({
            "id": cid, "recordingId": "rec-c1", "range": both, "text": text,
            "recordedAt": (T0 + timedelta(minutes=minute)).isoformat()}))
    await port.ingest(USER_A, conversation("c1", "rec-c1", T0, 2))
    assert await texts(port, USER_A, "Alice Erin") == ["Alice works at Globex"]
