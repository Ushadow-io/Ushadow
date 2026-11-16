"""Synthetic day for L2 (conversations). All text is made up.

07:00  rec-tv + rec-tv-copy   TV only (media) and its duplicate      -> no conversation
09:00  rec-m  pendant, Sam + Alex, 100 lines; line 70 starts "Different thing" (a topic split
       for a FakeModel with split_marker="Different thing"); line 72 is the open question
       "is the pineapple codeword ready?"
09:12  rec-n  pendant, Sam + Alex, 20 lines, 121 s after rec-m       -> same_people rule
09:30  rec-p  pendant, Sam + Plumber, 6 lines                        -> gap model: new
09:42  rec-p2 phone, Sam + Plumber, 6 lines, 11 min later            -> gap model: new;
       both short with the same topic                                -> day pass joins them
13:00  rec-x  phone, Sam + Kim, 10 lines                             -> long_gap rule
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ledger.models import IngestRequest
from ledger.schema import CaptureBundle, Recording, Segment, Speaker, TimeRange, Transcript

DAY = datetime(2026, 11, 14, tzinfo=UTC)
USER = "user-l2"
SPLIT_MARKER = "Different thing"
SECRET = "pineapple"

SAM = Speaker(label="Speaker 0", role="owner", personId="person-sam", displayName="Sam")


def at(hms: str) -> datetime:
    hour, minute, second = (int(p) for p in hms.split(":"))
    return DAY.replace(hour=hour, minute=minute, second=second)


def span_of(start: str, end: str) -> TimeRange:
    return TimeRange(start=at(start), end=at(end))


def _lines(prefix: str, start: datetime, texts: list[str]) -> list[Segment]:
    """5 s lines, 1 s apart, speakers alternate (Speaker 0 first)."""
    out = []
    for i, text in enumerate(texts):
        begin = start + timedelta(seconds=6 * i)
        out.append(
            Segment(
                id=f"{prefix}-{i}",
                text=text,
                speakerLabel=f"Speaker {i % 2}",
                start=begin,
                end=begin + timedelta(seconds=5),
            )
        )
    return out


def _rec_m_text(i: int) -> str:
    if i == 70:
        return f"{SPLIT_MARKER}: the venue booking is late"
    if i == 72:
        return f"is the {SECRET} codeword ready?"
    return f"line {i} about the launch budget" if i < 70 else f"line {i} about the venue booking"


def _recording(rec_id: str, source: str, segs: list[Segment], other: Speaker) -> tuple:
    rec = Recording(
        id=rec_id,
        sourceId=source,
        modality="audio_input",
        range=TimeRange(
            start=segs[0].start - timedelta(seconds=5), end=segs[-1].end + timedelta(seconds=5)
        ),
        origin="recovered",
        endReason="silence",
        contentHash=f"sha256:{rec_id}",
        currentTranscriptRevision="rev-1",
    )
    transcript = Transcript(
        recordingId=rec_id,
        revision="rev-1",
        createdAt=segs[-1].end + timedelta(minutes=5),
        model="asr-test",
        speakers=[SAM, other],
        segments=segs,
    )
    return rec, transcript


def _tv() -> tuple[list[Recording], list[Transcript]]:
    media = Speaker(label="Speaker 0", role="media")
    segs = _lines("tv", at("07:00:05"), ["Breaking news from the studio"] * 4)
    for i, seg in enumerate(segs):
        segs[i] = seg.model_copy(update={"speakerLabel": "Speaker 0"})
    rec, transcript = _recording("rec-tv", "pendant", segs, media)
    transcript = transcript.model_copy(update={"speakers": [media]})
    copy = rec.model_copy(update={"id": "rec-tv-copy", "contentHash": rec.contentHash})
    copy_t = transcript.model_copy(update={"recordingId": "rec-tv-copy"})
    return [rec, copy], [transcript, copy_t]


def l2_day() -> CaptureBundle:
    alex = Speaker(
        label="Speaker 1", role="participant", personId="person-alex", displayName="Alex"
    )
    plumber = Speaker(label="Speaker 1", role="participant", displayName="Plumber")
    kim = Speaker(label="Speaker 1", role="participant", personId="person-kim", displayName="Kim")
    parts = [
        (
            "rec-m",
            "pendant",
            _lines("m", at("09:00:05"), [_rec_m_text(i) for i in range(100)]),
            alex,
        ),
        (
            "rec-n",
            "pendant",
            _lines("n", at("09:12:05"), [f"line {i} more on the venue booking" for i in range(20)]),
            alex,
        ),
        (
            "rec-p",
            "pendant",
            _lines(
                "p",
                at("09:30:05"),
                ["Plumber here about the leak in the kitchen"]
                + [f"pipe detail {i}" for i in range(5)],
            ),
            plumber,
        ),
        (
            "rec-p2",
            "phone",
            _lines(
                "q",
                at("09:42:05"),
                ["Plumber here about the leak again"] + [f"pipe part {i}" for i in range(5)],
            ),
            plumber,
        ),
        (
            "rec-x",
            "phone",
            _lines("x", at("13:00:05"), [f"garden plan {i}" for i in range(10)]),
            kim,
        ),
    ]
    tv_recs, tv_transcripts = _tv()
    recs, transcripts = list(tv_recs), list(tv_transcripts)
    for rec_id, source, segs, other in parts:
        rec, transcript = _recording(rec_id, source, segs, other)
        recs.append(rec)
        transcripts.append(transcript)
    return CaptureBundle(
        schemaVersion="2.0.0",
        range=TimeRange(start=DAY, end=DAY + timedelta(days=1)),
        timezone="UTC",
        recordings=recs,
        transcripts=transcripts,
    )


def l2_request() -> IngestRequest:
    return IngestRequest(userId=USER, bundle=l2_day())


DAY_RANGE = TimeRange(start=DAY, end=DAY + timedelta(days=1))
