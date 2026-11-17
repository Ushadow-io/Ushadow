"""Synthetic recordings with the shapes real transcripts have and tidy fixtures do not.

All text is invented. Shapes taken from real days (counts and times only):
- zero-length segments (start == end), often two or three at the very start of a recording,
  at the same instant as the next real segment;
- segments that overlap the one before, and segments listed out of time order;
- pauses of every size, from 0 to well over the 45 s hard pause.
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

from ledger.models import IngestRequest
from ledger.schema import CaptureBundle, Recording, Segment, Speaker, TimeRange, Transcript
from ledger.schema.life_datatypes import CutReason, RecordingOrigin, TranscriptStatus

USER = "user-rand"
DAY = datetime(2026, 11, 20, tzinfo=UTC)
WORDS = "garden plan bus ticket lunch paint shelf river walk coffee price list".split()
SPEAKERS = [
    Speaker(label="Speaker 0", role="owner"),
    Speaker(label="Speaker 1", role="participant"),
]


def _text(rnd: random.Random) -> str:
    return " ".join(rnd.choice(WORDS) for _ in range(rnd.randint(1, 18)))


def _pause(rnd: random.Random) -> float:
    roll = rnd.random()
    if roll < 0.08:
        return rnd.uniform(46, 120)  # a hard pause
    if roll < 0.15:
        return 0.0  # back to back
    if roll < 0.22:
        return -rnd.uniform(0.05, 1.0)  # overlaps the segment before
    return round(rnd.uniform(0.01, 6.0), 3)


def random_segments(rnd: random.Random, prefix: str, start: datetime) -> list[Segment]:
    """One recording's segments, in time order (shuffled later by the caller)."""
    out: list[Segment] = []
    t = start
    for i in range(rnd.randint(1, 3)):  # the leading zero-length segments of real days
        out.append(_seg(rnd, f"{prefix}-z{i}", t, t))
    for i in range(rnd.randint(5, 140)):
        length = 0.0 if rnd.random() < 0.05 else round(rnd.uniform(0.1, 9.0), 3)
        out.append(_seg(rnd, f"{prefix}-{i}", t, t + timedelta(seconds=length)))
        t = max(t, t + timedelta(seconds=length + _pause(rnd)))
    return out


def _seg(rnd: random.Random, seg_id: str, start: datetime, end: datetime) -> Segment:
    return Segment(
        id=seg_id, text=_text(rnd), speakerLabel=rnd.choice(SPEAKERS).label, start=start, end=end
    )


def _end(segs: list[Segment]) -> datetime:
    return max(s.end for s in segs) + timedelta(seconds=1)


def _recording(rec_id: str, segs: list[Segment], live: bool) -> Recording:
    start = min(s.start for s in segs) - timedelta(seconds=1)
    return Recording(
        id=rec_id,
        sourceId="phone",
        modality="audio_input",
        range=TimeRange(start=start, end=_end(segs)),
        origin=RecordingOrigin.live if live else RecordingOrigin.recovered,
        contentHash=f"sha256:{rec_id}",
    )


def _transcript(rec_id: str, revision: str, segs: list[Segment], created: datetime) -> Transcript:
    return Transcript(
        recordingId=rec_id,
        revision=revision,
        createdAt=created,
        status=TranscriptStatus.provisional if revision == "live" else TranscriptStatus.final,
        model="test-model",
        speakers=SPEAKERS,
        segments=segs,
    )


def _bundle(recs: list[Recording], transcripts: list[Transcript]) -> IngestRequest:
    rng = TimeRange(start=DAY, end=DAY + timedelta(days=1))
    bundle = CaptureBundle(
        schemaVersion="2.0.0", range=rng, recordings=recs, transcripts=transcripts
    )
    return IngestRequest(userId=USER, bundle=bundle)


class RandomDay:
    """A day of 1-4 random recordings. `batch()` is one closed bundle; `live_posts()` sends
    each recording as a provisional revision in 1-5 posts (segments out of order inside a
    post), then a final revision with small time and word changes."""

    def __init__(self, seed: int) -> None:
        rnd = random.Random(seed)
        self.rnd = rnd
        self.segments: dict[str, list[Segment]] = {}
        t = DAY + timedelta(hours=9)
        for r in range(rnd.randint(1, 4)):
            segs = random_segments(rnd, f"s{seed}-{r}", t)
            self.segments[f"rec-{seed}-{r}"] = segs
            t = _end(segs) + timedelta(minutes=rnd.randint(1, 40))

    def _shuffled(self, segs: list[Segment]) -> list[Segment]:
        out = list(segs)
        self.rnd.shuffle(out)
        return out

    def batch(self) -> IngestRequest:
        recs = [_recording(rid, segs, live=False) for rid, segs in self.segments.items()]
        transcripts = [
            _transcript(rid, "rev-1", self._shuffled(segs), _end(segs))
            for rid, segs in self.segments.items()
        ]
        return _bundle(recs, transcripts)

    def live_posts(self) -> list[tuple[datetime, IngestRequest]]:
        """(clock at the post, post) in send order."""
        posts: list[tuple[datetime, IngestRequest]] = []
        for rid, segs in self.segments.items():
            cuts = sorted(
                self.rnd.sample(range(1, len(segs)), min(len(segs) - 1, self.rnd.randint(0, 4)))
            )
            for lo, hi in zip([0, *cuts], [*cuts, len(segs)], strict=True):
                part = segs[lo:hi]
                seen = segs[:hi]
                rec = _recording(rid, seen, live=True)
                body = _transcript(rid, "live", self._shuffled(part), _end(part))
                posts.append((_end(seen) + timedelta(seconds=1), _bundle([rec], [body])))
            posts.append(self._final(rid, segs))
        return posts

    def _final(self, rid: str, segs: list[Segment]) -> tuple[datetime, IngestRequest]:
        final = []
        for s in segs:
            shift = timedelta(seconds=self.rnd.choice([0, 0, 0, 0.2, -0.2]))
            text = _text(self.rnd) if self.rnd.random() < 0.1 else s.text
            final.append(
                s.model_copy(update={"start": s.start + shift, "end": s.end + shift, "text": text})
            )
        rec = _recording(rid, segs, live=True).model_copy(update={"endReason": CutReason.silence})
        when = _end(segs) + timedelta(seconds=10)
        return when, _bundle([rec], [_transcript(rid, "rev-final", final, when)])
