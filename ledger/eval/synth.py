"""Synthetic days for the L2 evaluation: a small script format -> CaptureBundle + ground truth.

All names and text are invented. A day script is a list of Rec(...) with a text block:

    P: words said by the speaker with key P
    ~25                 the pause before the next line is 25 s (default: a short random pause)
    T: @c3 words        '@c3' marks the FIRST line of true conversation c3 (ground truth)

Line timing: duration = words / 2.6 s (at least 1.2 s); the default pause between lines is
0.3-1.8 s (seeded, so a day is always the same). Ground truth: every '@id' line starts a true
conversation that runs until the next '@id' line in time order. Media lines (TV) belong to no
conversation and are ignored by the scoring.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from ledger.models import IngestRequest
from ledger.schema import CaptureBundle, Recording, Segment, Speaker, TimeRange, Transcript

WORDS_PER_SECOND = 2.6


@dataclass(frozen=True)
class Who:
    label: str
    role: str
    person: str | None = None
    name: str | None = None

    def speaker(self) -> Speaker:
        return Speaker(label=self.label, role=self.role, personId=self.person, displayName=self.name)


@dataclass
class Rec:
    rec_id: str
    source: str
    start: str  # HH:MM:SS of the first line, or '+N': N s after the previous recording ends
    who: dict[str, Who]
    script: str


@dataclass(frozen=True)
class TrueConv:
    cid: str
    start: datetime
    end: datetime
    first_seg: str
    note: str


@dataclass
class Day:
    name: str
    date: datetime
    recs: list[Rec]
    notes: dict[str, str] = field(default_factory=dict)  # true conversation id -> description
    seed: int = 7

    def at(self, hms: str) -> datetime:
        h, m, s = (int(p) for p in hms.split(":"))
        return self.date.replace(hour=h, minute=m, second=s)


_TAG = re.compile(r"^@(\w+)\s+")


@dataclass(frozen=True)
class Built:
    request: IngestRequest
    truth: list[TrueConv]
    segments: list[tuple[str, str, datetime, datetime, str, str]]  # seg, rec, start, end, role, cid
    speech_seconds: float
    span_seconds: float
    words: int


def _segments(
    day: Day, rec: Rec, rng: random.Random, prev_end: datetime | None
) -> list[tuple[Segment, str | None, str]]:
    """(segment, tag or None, role) per line. A start '+N' is N s after the previous recording."""
    if rec.start.startswith("+"):
        assert prev_end is not None, "a relative start needs a previous recording"
        t = prev_end + timedelta(seconds=float(rec.start[1:]))
    else:
        t = day.at(rec.start)
    out: list[tuple[Segment, str | None, str]] = []
    pause: float | None = None
    n = 0
    for raw in rec.script.strip().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("~"):
            pause = float(line[1:])
            continue
        key, text = line.split(":", 1)
        text = text.strip()
        tag = None
        m = _TAG.match(text)
        if m:
            tag, text = m.group(1), text[m.end():]
        if out:
            t += timedelta(seconds=pause if pause is not None else round(rng.uniform(0.3, 1.8), 2))
        pause = None
        dur = max(1.2, len(text.split()) / WORDS_PER_SECOND)
        who = rec.who[key.strip()]
        seg = Segment(
            id=f"{rec.rec_id}-{n:03d}",
            text=text,
            speakerLabel=who.label,
            start=t,
            end=t + timedelta(seconds=round(dur, 2)),
        )
        out.append((seg, tag, who.role))
        t = seg.end
        n += 1
    return out


def build(day: Day, user_id: str) -> Built:
    rng = random.Random(day.seed)
    recs, transcripts = [], []
    flat: list[tuple[Segment, str | None, str, str]] = []
    prev_end: datetime | None = None
    for rec in day.recs:
        segs = _segments(day, rec, rng, prev_end)
        prev_end = segs[-1][0].end
        speakers = {w.label: w.speaker() for w in rec.who.values()}
        first, last = segs[0][0], segs[-1][0]
        recs.append(
            Recording(
                id=rec.rec_id,
                sourceId=rec.source,
                modality="audio_input",
                range=TimeRange(
                    start=first.start - timedelta(seconds=2), end=last.end + timedelta(seconds=3)
                ),
                origin="recovered",
                endReason="silence",
                contentHash=f"sha256:{day.name}:{rec.rec_id}",
                currentTranscriptRevision="rev-1",
            )
        )
        transcripts.append(
            Transcript(
                recordingId=rec.rec_id,
                revision="rev-1",
                createdAt=last.end + timedelta(minutes=2),
                model="asr-synthetic",
                speakers=list(speakers.values()),
                segments=[s for s, _, _ in segs],
            )
        )
        flat.extend((s, tag, role, rec.rec_id) for s, tag, role in segs)
    flat.sort(key=lambda x: x[0].start)
    truth: list[TrueConv] = []
    rows = []
    cur: str | None = None
    for seg, tag, role, rec_id in flat:
        if tag and tag != cur:
            cur = tag
            truth.append(TrueConv(tag, seg.start, seg.end, seg.id, day.notes.get(tag, "")))
        if cur is None:
            raise ValueError(f"{day.name}: line {seg.id} comes before the first @tag")
        if role != "media" and truth and truth[-1].cid == cur:
            last = truth[-1]
            truth[-1] = TrueConv(last.cid, last.start, max(last.end, seg.end), last.first_seg,
                                 last.note)
        rows.append((seg.id, rec_id, seg.start, seg.end, role, cur))
    speech = sum((s.end - s.start).total_seconds() for s, *_ in flat)
    span = (flat[-1][0].end - flat[0][0].start).total_seconds()
    words = sum(len(s.text.split()) for s, *_ in flat)
    bundle = CaptureBundle(
        schemaVersion="2.0.0",
        range=TimeRange(start=day.date, end=day.date + timedelta(days=1)),
        timezone="UTC",
        recordings=recs,
        transcripts=transcripts,
    )
    return Built(IngestRequest(userId=user_id, bundle=bundle), truth, rows, speech, span, words)


def day_range(day: Day) -> TimeRange:
    return TimeRange(start=day.date, end=day.date + timedelta(days=1))


def date(y: int, m: int, d: int) -> datetime:
    return datetime(y, m, d, tzinfo=UTC)
