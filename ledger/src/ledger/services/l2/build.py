"""Pure: a walked Group -> a Conversation with parts, participants and fragments.

The id is hash(owner, policy, recording, first line start) of the group's ANCHOR slice: the
slice of the moment created first (Moment.createdAt, then time, then key). A moment is never
re-cut, so the anchor survives growth: late evidence or a human join at the start adds moments
created later, and the id stays. It is a pure function of the stored moments, so a replay of
the same evidence (same order, same clock) gives the same ids, and a fresh one-shot ingest
anchors on the first moment in time (the v1 rule). An erase re-cuts the moments it touches
(new createdAt), so an erase inside the anchor moment can move the anchor. When a rebuild
changes an id, the old conversation is retired with `replacedBy` (persist.py). The digest
covers everything the build makes (not the composed text and not closedAt); a new digest is a
new revision.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from ledger.l2_models import CONVERSATION_POLICY, ConvState
from ledger.schema import (
    Conversation,
    ConversationPart,
    Fragment,
    Participant,
    SpeakerRef,
    TimeRange,
)
from ledger.services.l2.lines import Line, lines_digest
from ledger.services.l2.rules import LONG_GAP_SECONDS
from ledger.services.l2.walker import Group, Slice
from ledger.timeutil import stable_hash, ts, utc

QUIET = timedelta(seconds=LONG_GAP_SECONDS)


@dataclass(frozen=True)
class Built:
    conversation: Conversation
    fragments: list[Fragment]
    state: ConvState
    digest: str
    decisions: list[dict]
    moment_keys: list[str]
    lines: list[Line]


def _runs(slices: list[Slice]) -> list[list[Slice]]:
    """Slices in a row of the same recording form one part (and one fragment)."""
    runs: list[list[Slice]] = []
    for piece in slices:
        if runs and runs[-1][-1].view.recording_id == piece.view.recording_id:
            runs[-1].append(piece)
        else:
            runs.append([piece])
    return runs


def _participants(lines: list[Line]) -> list[Participant]:
    found: dict[str, dict] = {}
    for ln in lines:
        key = ln.person or f"{ln.recording_id}:{ln.label}"
        entry = found.setdefault(key, {"line": ln, "refs": set()})
        entry["refs"].add((ln.recording_id, ln.label))
    out = []
    for key in sorted(found):
        ln = found[key]["line"]
        refs = [
            SpeakerRef(recordingId=r, speakerLabel=label) for r, label in sorted(found[key]["refs"])
        ]
        out.append(
            Participant(
                id="p-" + stable_hash(key, length=12),
                personId=ln.person,
                displayName=ln.name,
                role=ln.role,
                speakerRefs=refs,
            )
        )
    return out


def _fragment(conv_id: str, run: list[Slice]) -> Fragment:
    lines = [ln for s in run for ln in s.lines]
    rec = lines[0].recording_id
    return Fragment(
        id="frag-" + stable_hash(conv_id, rec, ts(lines[0].start), length=16),
        recordingId=rec,
        transcriptRevision=lines[0].revision,
        segmentIds=[ln.seg_id for ln in lines],
        range=TimeRange(start=lines[0].start, end=max(ln.end for ln in lines)),
        topic=run[-1].state_after.topic or None,
    )


def _decisions(group: Group) -> list[dict]:
    rows = [{"role": "opened_by", "source": group.opened[0], "linkId": group.opened[1]}]
    rows += [{"role": "joined", "source": s, "linkId": i} for s, i in group.joins]
    rows += [{"role": "split", "source": s, "linkId": i} for s, i in group.splits]
    if group.closed_by:
        rows.append(
            {"role": "closed_by", "source": group.closed_by[0], "linkId": group.closed_by[1]}
        )
    return rows


def _anchor(piece: Slice) -> tuple[str, str, str]:
    return (ts(utc(piece.view.moment.createdAt)), ts(piece.lines[0].start), piece.view.key)


def conversation_id(user_id: str, group: Group) -> str:
    """The slice of the oldest moment; its first line start keeps two parts of one split
    moment apart."""
    anchor = min(group.slices, key=_anchor)
    first = anchor.lines[0]
    return "conv-" + stable_hash(user_id, CONVERSATION_POLICY, first.recording_id, ts(first.start))


def build(user_id: str, group: Group) -> Built:
    conv_id = conversation_id(user_id, group)
    runs = _runs(group.slices)
    fragments = [_fragment(conv_id, run) for run in runs]
    parts = [ConversationPart(recordingId=f.recordingId, range=f.range) for f in fragments]
    lines = group.lines
    conv = Conversation(
        id=conv_id,
        revision=1,
        range=TimeRange(start=group.start, end=group.end),
        parts=parts,
        participants=_participants(lines),
        fragmentIds=[f.id for f in fragments],
        metadata={"ledger": {"policyVersion": CONVERSATION_POLICY}},
    )
    moment_keys = list(dict.fromkeys(s.view.key for s in group.slices))
    digest = stable_hash(
        conv.model_dump_json(exclude={"revision"}),
        [f.model_dump_json() for f in fragments],
        lines_digest(lines),
        group.state.model_dump_json(),
        length=32,
    )
    return Built(conv, fragments, group.state, digest, _decisions(group), moment_keys, lines)


def closed_at(end: datetime, next_start: datetime | None, now: datetime) -> datetime | None:
    """Closed when the next conversation began, or after a quiet period (30 min)."""
    quiet_end = end + QUIET
    if next_start is not None:
        return max(end, min(next_start, quiet_end))
    return quiet_end if now >= quiet_end else None
