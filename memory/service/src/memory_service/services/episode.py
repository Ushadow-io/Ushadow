"""Conversation + ledger transcripts -> episode lines, and the proof checks on those lines.

Rules (design "Intake rules", spike s1/episodes.py):
- a segment belongs to a part when its midpoint is in the part's range on the same recording;
- speakers with role media or background make no lines (no facts about the user from TV);
- a segment that overlaps an erased range is dropped, whatever the ledger still returns;
- the transcript used is the newest non-`live` revision, else the newest.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from memory_service.engine.base import EngineFact
from memory_service.models import EpisodeLine, WorkUnit
from memory_service.schema import EvidenceRef, TimeRange, Transcript
from memory_service.textutil import midpoint, norm, overlaps

DROP_ROLES = {"media", "background"}
Erased = list[tuple[str, datetime, datetime]]


def pick_transcript(ts: list[Transcript]) -> Transcript | None:
    if not ts:
        return None
    final = [t for t in ts if t.revision != "live"] or ts
    return max(final, key=lambda t: (t.createdAt, t.revision))


def _erased(erased: Erased, recording_id: str, start: datetime, end: datetime) -> bool:
    return any(r == recording_id and overlaps(start, end, s, e) for r, s, e in erased)


@dataclass
class EpisodeContext:
    unit: WorkUnit
    transcripts: dict[str, list[Transcript]]  # recording id -> every revision from the ledger
    erased: Erased
    lines: list[EpisodeLine] = field(default_factory=list)

    @property
    def user_id(self) -> str:
        return self.unit.user_id

    def chosen(self, recording_id: str) -> Transcript | None:
        return pick_transcript(self.transcripts.get(recording_id, []))


def build_lines(ctx: EpisodeContext) -> list[EpisodeLine]:
    lines: list[EpisodeLine] = []
    for part in ctx.unit.parts:
        t = ctx.chosen(part.recordingId)
        if t is None:
            continue
        speakers = {s.label: s for s in t.speakers or []}
        for seg in t.segments:
            sp = speakers.get(seg.speakerLabel)
            role = sp.role.value if sp else "unknown"
            mid = midpoint(seg.start, seg.end)
            if not (part.range.start <= mid <= part.range.end) or role in DROP_ROLES:
                continue
            if _erased(ctx.erased, part.recordingId, seg.start, seg.end) or not seg.text.strip():
                continue
            name = (sp.displayName if sp and sp.displayName else seg.speakerLabel)
            lines.append(EpisodeLine(recording_id=part.recordingId, transcript_revision=t.revision,
                                     start=seg.start, end=seg.end, speaker=name, role=role,
                                     text=seg.text))
    return sorted(lines, key=lambda x: (x.start, x.recording_id))


def _ref(line: EpisodeLine, quote: str, end: datetime | None = None) -> EvidenceRef:
    return EvidenceRef(recordingId=line.recording_id,
                       range=TimeRange(start=line.start, end=end or line.end),
                       transcriptRevision=line.transcript_revision, quote=quote)


def locate_quote(quote: str, lines: list[EpisodeLine]) -> EvidenceRef | None:
    """The line (or two adjacent lines of one recording) whose words contain the quote."""
    q = norm(quote)
    if not q:
        return None
    for line in lines:  # the narrowest proof first: one line
        if q in norm(line.text):
            return _ref(line, quote)
    for line, nxt in zip(lines, lines[1:], strict=False):
        if nxt.recording_id == line.recording_id and q in norm(f"{line.text} {nxt.text}"):
            return _ref(line, quote, end=nxt.end)
    return None


def _has(phrase: str, text: str) -> bool:
    p = norm(phrase)
    return bool(p) and f" {p} " in f" {norm(text)} "


def locate_fact(f: EngineFact, lines: list[EpisodeLine], limit: int = 3) -> list[EvidenceRef]:
    """Proof for an engine fact: the engine's own hints, else the lines that name both ends.
    Lexical only; how well this finds proof for Graphiti's paraphrased facts is NOT verified."""
    if f.hints:
        return list(f.hints)
    hits = [ln for ln in lines if _has(f.source, ln.text) and _has(f.target, ln.text)]
    return [_ref(ln, ln.text) for ln in hits[:limit]]


def verify(ev: EvidenceRef, ctx: EpisodeContext) -> bool:
    """The quote really occurs in the ledger transcript text for that range, the range is in
    this conversation, and none of it is erased."""
    q = norm(ev.quote)
    s, e = ev.range.start, ev.range.end
    in_parts = any(p.recordingId == ev.recordingId and overlaps(s, e, p.range.start, p.range.end)
                   for p in ctx.unit.parts)
    if not q or not in_parts or _erased(ctx.erased, ev.recordingId, s, e):
        return False
    revs = ctx.transcripts.get(ev.recordingId, [])
    t = next((x for x in revs if x.revision == ev.transcriptRevision), None) or ctx.chosen(
        ev.recordingId)
    if t is None:
        return False
    text = " ".join(seg.text for seg in t.segments if overlaps(seg.start, seg.end, s, e))
    return q in norm(text)
