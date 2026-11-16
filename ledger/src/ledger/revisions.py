"""Transcript revision rules: provisional (draft) vs final revisions.

`Transcript.status` decides (life-datatypes v2): `provisional` is a draft, `final` or not set is
final. `is_provisional` is the ONE place that also accepts the revision id `live` with no
status as provisional: backward tolerance for senders from before the status field.

Validator rule 7: a recording has at most one provisional revision, and it is not changed once
a final revision of the recording exists. While there is no final, the provisional revision
may grow and its segments may be replaced. Once a final exists, the provisional one is frozen.
"""

from __future__ import annotations

from collections.abc import Sequence
from enum import Enum

from ledger.schema import Transcript
from ledger.timeutil import ts

LEGACY_LIVE_REVISION = "live"


def is_provisional(revision: str | None, status: str | Enum | None) -> bool:
    """Draft or final, from a header's revision and status (model or JSON values)."""
    value = status.value if isinstance(status, Enum) else status
    if value is not None:
        return value == "provisional"
    return revision == LEGACY_LIVE_REVISION  # backward tolerance: pre-status senders


def provisional(header: Transcript) -> bool:
    return is_provisional(header.revision, header.status)


def finals(headers: Sequence[Transcript]) -> list[Transcript]:
    """Final revisions, oldest first."""
    return sorted(
        (h for h in headers if not provisional(h)), key=lambda h: (ts(h.createdAt), h.revision)
    )


def draft(headers: Sequence[Transcript]) -> Transcript | None:
    """The provisional revision of a recording (rule 7: at most one)."""
    return next((h for h in headers if provisional(h)), None)


def cut_source(headers: Sequence[Transcript]) -> str | None:
    """The revision moments are cut from: the provisional one if there is one (work starts
    during the conversation), else the first final revision. It never changes once moments
    exist."""
    live = draft(headers)
    if live is not None:
        return live.revision
    done = finals(headers)
    return done[0].revision if done else None


def pick_current(incoming: str | None, headers: Sequence[Transcript]) -> str | None:
    """currentTranscriptRevision: a final the sender names wins; else the newest final;
    the provisional one only while no final exists."""
    known = {h.revision: h for h in headers}
    if incoming in known and not provisional(known[incoming]):
        return incoming
    done = finals(headers)
    if done:
        return done[-1].revision
    if incoming in known:
        return incoming
    live = draft(headers)
    return live.revision if live else incoming
