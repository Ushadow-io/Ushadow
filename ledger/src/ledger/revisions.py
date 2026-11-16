"""Transcript revision rules: provisional `live` vs final revisions.

life-datatypes has no "provisional" flag on Transcript, so the ledger uses the revision id:
`live` is provisional (Chronicle also sets metadata.chronicle.provisional = true); every other
revision is final. While a recording has no final revision, its live revision may grow and its
live segments may be replaced. Once a final revision exists, live is frozen.
"""

from __future__ import annotations

from collections.abc import Sequence

from ledger.schema import Transcript
from ledger.timeutil import ts

LIVE_REVISION = "live"


def is_live(revision: str | None) -> bool:
    return revision == LIVE_REVISION


def finals(headers: Sequence[Transcript]) -> list[Transcript]:
    """Final revisions, oldest first."""
    return sorted(
        (h for h in headers if not is_live(h.revision)), key=lambda h: (ts(h.createdAt), h.revision)
    )


def cut_source(headers: Sequence[Transcript]) -> str | None:
    """The revision moments are cut from: live if there is one (work starts during the
    conversation), else the first final revision. It never changes once moments exist."""
    if any(is_live(h.revision) for h in headers):
        return LIVE_REVISION
    done = finals(headers)
    return done[0].revision if done else None


def pick_current(incoming: str | None, headers: Sequence[Transcript]) -> str | None:
    """currentTranscriptRevision: a final the sender names wins; else the newest final;
    live only while no final exists."""
    known = {h.revision for h in headers}
    if incoming and not is_live(incoming) and incoming in known:
        return incoming
    done = finals(headers)
    if done:
        return done[-1].revision
    return incoming if incoming in known else (LIVE_REVISION if known else incoming)
