"""Pure: the lines of a moment (segments + speaker info + human word fixes) and their digest."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from ledger.schema import Segment, Speaker, TimeRange, TranscriptCorrection
from ledger.timeutil import overlaps, stable_hash, ts, utc

NON_SPEECH_ROLES = frozenset({"media", "background"})


@dataclass(frozen=True)
class Line:
    seg_id: str
    recording_id: str
    revision: str
    start: datetime
    end: datetime
    label: str
    role: str
    person: str | None  # Speaker.personId
    name: str | None  # Speaker.displayName
    text: str

    @property
    def who(self) -> str:
        return f"{self.role}:{self.name or self.person or self.label}"

    @property
    def range(self) -> TimeRange:
        return TimeRange(start=self.start, end=self.end)


@dataclass(frozen=True)
class LineSource:
    recording_id: str
    revision: str
    segments: Sequence[Segment]
    speakers: Sequence[Speaker]
    corrections: Sequence[TranscriptCorrection]


def _inside(seg: Segment, rng: TimeRange) -> bool:
    return utc(rng.start) <= utc(seg.start) and utc(seg.end) <= utc(rng.end)


def _texts(segs: Sequence[Segment], fixes: Sequence[TranscriptCorrection]) -> list[tuple]:
    """(segment, text): a human fix replaces the text of the segments it covers (once)."""
    out: list[tuple[Segment, str]] = []
    used: set[str] = set()
    for seg in segs:
        fix = next((f for f in fixes if f.text and _inside(seg, f.range)), None)
        if fix is None:
            out.append((seg, seg.text))
        elif fix.id not in used:
            used.add(fix.id)
            out.append((seg, fix.text or ""))
    return out


def assign(segments: Sequence[Segment], ranges: Sequence[TimeRange]) -> list[list[Segment]]:
    """Segments per range (moment). A segment belongs to the range its start is in, else to the
    first range it overlaps (a later revision can move a boundary a little). Never to two."""
    out: list[list[Segment]] = [[] for _ in ranges]
    for seg in segments:
        start = utc(seg.start)
        home = next((i for i, r in enumerate(ranges) if utc(r.start) <= start <= utc(r.end)), None)
        if home is None:
            span = TimeRange(start=seg.start, end=seg.end)
            home = next((i for i, r in enumerate(ranges) if overlaps(span, r)), None)
        if home is not None:
            out[home].append(seg)
    return out


def build_lines(src: LineSource) -> list[Line]:
    """The lines of src.segments, in time order, with speaker info and human fixes."""
    speakers = {s.label: s for s in src.speakers}
    segs = sorted(src.segments, key=lambda s: (utc(s.start), utc(s.end), s.id))
    lines: list[Line] = []
    for seg, text in _texts(segs, src.corrections):
        spk = speakers.get(seg.speakerLabel or "")
        lines.append(
            Line(
                seg_id=seg.id,
                recording_id=src.recording_id,
                revision=src.revision,
                start=utc(seg.start),
                end=utc(seg.end),
                label=seg.speakerLabel or "unknown",
                role=spk.role.value if spk else "unknown",
                person=spk.personId if spk else None,
                name=spk.displayName if spk else None,
                text=text,
            )
        )
    return lines


def lines_digest(lines: Sequence[Line]) -> str:
    return stable_hash(
        *[(ln.seg_id, ts(ln.start), ts(ln.end), ln.who, ln.person, ln.text) for ln in lines],
        length=32,
    )


def is_media_only(lines: Sequence[Line]) -> bool:
    """TV, radio, background: no conversation is made from these lines."""
    return all(ln.role in NON_SPEECH_ROLES for ln in lines)


def people(lines: Sequence[Line]) -> frozenset[str]:
    """Known participants (personId), the owner not included."""
    return frozenset(ln.person for ln in lines if ln.role == "participant" and ln.person)


def seconds(a: datetime, b: datetime) -> float:
    return (utc(b) - utc(a)).total_seconds()
