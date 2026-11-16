"""Synthetic golden day, built from life-datatypes examples/python/example_conversation.py.

Kept: the TV recording and its copy (same contentHash), rec-a with two transcript revisions
and the "venue" fix, rec-b, the not_recording gap and the example Links. Added: rec-a carries
an audio pointer in metadata, and a long phone recording (rec-long, ~11 min of talk with a
60 s pause) so the cutter has work at the 3 minute scale.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ledger.schema import (
    CaptureBundle,
    CaptureGap,
    Link,
    Recording,
    Segment,
    Speaker,
    TimeRange,
    Transcript,
    TranscriptCorrection,
)

DAY = datetime(2026, 11, 14, tzinfo=UTC)
USER = "user-sam"


def at(hms: str) -> datetime:
    hour, minute, second = (int(p) for p in hms.split(":"))
    return DAY.replace(hour=hour, minute=minute, second=second)


def span(start: str, end: str) -> TimeRange:
    return TimeRange(start=at(start), end=at(end))


def seg(seg_id: str, text: str, label: str, start: str, end: str) -> Segment:
    return Segment(id=seg_id, text=text, speakerLabel=label, start=at(start), end=at(end))


def _tv() -> tuple[list[Recording], Transcript]:
    tv = Recording(
        id="rec-tv",
        sourceId="omi-pendant",
        modality="audio_input",
        range=span("07:14:46", "07:25:26"),
        origin="recovered",
        contentHash="sha256:7f1c",
        currentTranscriptRevision="rev-1",
    )
    transcript = Transcript(
        recordingId="rec-tv",
        revision="rev-1",
        createdAt=at("07:30:00"),
        model="deepgram-nova-3",
        speakers=[Speaker(label="Speaker 0", role="media", confidence=0.9)],
        segments=[
            seg("tv-1", "Detective Carter from NYPD homicide.", "Speaker 0", "07:15:02", "07:15:05")
        ],
    )
    return [tv, tv.model_copy(update={"id": "rec-tv-copy"})], transcript


def _rec_a_segments(prefix: str) -> list[Segment]:
    return [
        seg(
            f"{prefix}-1",
            "Shall we look at the launch budget?",
            "Speaker 0",
            "10:54:25",
            "10:54:28",
        ),
        seg(
            f"{prefix}-2",
            "Yes, marketing is over by about ten percent.",
            "Speaker 1",
            "10:54:29",
            "10:54:33",
        ),
        seg(
            f"{prefix}-3",
            "Different thing: did you book the menu?",
            "Speaker 1",
            "11:02:10",
            "11:02:13",
        ),
        seg(f"{prefix}-4", "Not yet, I'll do it today.", "Speaker 0", "11:02:14", "11:02:16"),
    ]


def _rec_a() -> tuple[Recording, list[Transcript], TranscriptCorrection]:
    rec = Recording(
        id="rec-a",
        sourceId="omi-pendant",
        modality="audio_input",
        range=span("10:54:20", "11:05:31"),
        origin="recovered",
        startReason="silence",
        endReason="file_boundary",
        contentHash="sha256:a913",
        currentTranscriptRevision="rev-2",
        metadata={"audioPath": "chronicle://audio/rec-a.wav", "device": "omi"},
    )
    speakers = [
        Speaker(label="Speaker 0", role="owner", personId="person-sam", displayName="Sam"),
        Speaker(label="Speaker 1", role="participant", personId="person-alex", displayName="Alex"),
    ]
    rev1 = Transcript(
        recordingId="rec-a",
        revision="rev-1",
        createdAt=at("11:30:00"),
        model="deepgram-nova-2",
        speakers=speakers,
        segments=_rec_a_segments("a"),
    )
    rev2 = Transcript(
        recordingId="rec-a",
        revision="rev-2",
        createdAt=at("18:00:00"),
        model="deepgram-nova-3",
        speakers=speakers,
        segments=_rec_a_segments("a2"),
    )
    fix = TranscriptCorrection(
        id="fix-venue",
        recordingId="rec-a",
        range=span("11:02:10", "11:02:13"),
        text="Different thing: did you book the venue?",
        author="person-sam",
        recordedAt=at("12:15:00"),
    )
    return rec, [rev1, rev2], fix


def _rec_b() -> tuple[Recording, Transcript]:
    rec = Recording(
        id="rec-b",
        sourceId="omi-pendant",
        modality="audio_input",
        range=span("11:05:41", "11:22:29"),
        origin="recovered",
        startReason="file_boundary",
        endReason="silence",
        contentHash="sha256:c04e",
        currentTranscriptRevision="rev-1",
    )
    transcript = Transcript(
        recordingId="rec-b",
        revision="rev-1",
        createdAt=at("11:30:00"),
        model="deepgram-nova-3",
        speakers=[
            Speaker(label="Speaker 0", role="participant", personId="person-alex"),
            Speaker(label="Speaker 1", role="owner", personId="person-sam"),
            Speaker(label="Speaker 2", role="participant", displayName="Plumber"),
        ],
        segments=[
            seg(
                "b-1",
                "Back to the budget: can we cut paid ads?",
                "Speaker 0",
                "11:05:43",
                "11:05:47",
            ),
            seg("b-2", "Yes, move half of it to events.", "Speaker 1", "11:05:48", "11:05:51"),
            seg(
                "b-3",
                "Hi, it's the plumber. I can come about the leak on Friday.",
                "Speaker 2",
                "11:08:02",
                "11:08:07",
            ),
            seg("b-4", "Friday morning works.", "Speaker 1", "11:08:08", "11:08:10"),
        ],
    )
    return rec, transcript


def long_segments() -> list[Segment]:
    """~11 min of talk from 13:00:05: 4 s lines, 1 s apart, a 3 s pause every 10th line,
    and a 60 s pause after 13:05:00."""
    out: list[Segment] = []
    start = at("13:00:05")
    for i in range(110):
        if i == 50:
            start += timedelta(seconds=60)
        end = start + timedelta(seconds=4)
        label = f"Speaker {i % 2}"
        out.append(
            Segment(
                id=f"l-{i}",
                text=f"line {i} about the garden plan today",
                start=start,
                end=end,
                speakerLabel=label,
            )
        )
        start = end + timedelta(seconds=3 if i % 10 == 9 else 1)
    return out


def _rec_long() -> tuple[Recording, Transcript]:
    segs = long_segments()
    rec = Recording(
        id="rec-long",
        sourceId="phone",
        modality="audio_input",
        range=TimeRange(start=at("13:00:00"), end=segs[-1].end + timedelta(seconds=5)),
        origin="recovered",
        contentHash="sha256:long",
    )
    transcript = Transcript(
        recordingId="rec-long",
        revision="rev-1",
        createdAt=at("13:20:00"),
        model="deepgram-nova-3",
        speakers=[
            Speaker(label="Speaker 0", role="owner"),
            Speaker(label="Speaker 1", role="participant"),
        ],
        segments=segs,
    )
    return rec, transcript


def _example_links() -> list[Link]:
    return [
        Link(
            id="link-dup",
            kind="duplicate_of",
            fromId="rec-tv",
            toId="rec-tv-copy",
            key="duplicate_of:rec-tv:rec-tv-copy:p1",
            decidedBy="rule",
            policyVersion="p1",
            confidence=1.0,
            gapSeconds=-640,
            reason="same contentHash and range",
            recordedAt=at("07:31:00"),
        ),
        Link(
            id="link-split-model",
            kind="split_at",
            fromId="rec-b",
            at=at("11:07:50"),
            key="split_at:rec-b:p1",
            decidedBy="model",
            model="small-gap-model",
            policyVersion="p1",
            confidence=0.7,
            reason="topic and people change",
            recordedAt=at("11:31:05"),
        ),
        Link(
            id="link-split-human",
            kind="split_at",
            fromId="rec-b",
            at=at("11:08:00"),
            key="split_at:rec-b:p1",
            decidedBy="human",
            reason="the plumber's call starts here",
            recordedAt=at("12:20:00"),
            retracts="link-split-model",
        ),
    ]


def golden_day() -> CaptureBundle:
    tv_recs, tv_transcript = _tv()
    rec_a, rec_a_transcripts, fix = _rec_a()
    rec_b, rec_b_transcript = _rec_b()
    rec_long, long_transcript = _rec_long()
    return CaptureBundle(
        schemaVersion="2.0.0",
        range=TimeRange(start=DAY, end=DAY + timedelta(days=1)),
        timezone="Europe/London",
        recordings=[*tv_recs, rec_a, rec_b, rec_long],
        transcripts=[tv_transcript, *rec_a_transcripts, rec_b_transcript, long_transcript],
        corrections=[fix],
        gaps=[
            CaptureGap(
                id="gap-1",
                sourceId="omi-pendant",
                range=span("07:48:10", "10:06:42"),
                cause="not_recording",
            )
        ],
        links=_example_links(),
    )
