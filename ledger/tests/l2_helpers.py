"""Shared helpers for the L2 tests."""

from __future__ import annotations

from ledger.llm import FakeBehaviour
from ledger.services import Services
from tests.conftest import fake_models, make_services
from tests.fixtures.l2_day import DAY_RANGE, SPLIT_MARKER, USER, l2_request

SPLIT = FakeBehaviour(split_marker=SPLIT_MARKER)


def l2_services(behaviour: FakeBehaviour | None = SPLIT, db=None) -> Services:
    return make_services(db=db, models=fake_models(behaviour))


async def ingest_and_run(services: Services):
    await services.ingest.ingest(l2_request())
    return await services.conversations.run(USER, DAY_RANGE)


async def shape(services: Services) -> list[tuple]:
    """Everything a reader sees, in a comparable form."""
    out = []
    for view in await services.conversations.list(USER, None):
        conv = view.conversation
        out.append(
            (
                conv.id,
                conv.revision,
                conv.range.start,
                conv.range.end,
                tuple((p.recordingId, p.range.start, p.range.end) for p in conv.parts),
                tuple((f.id, f.range.start, f.range.end, f.topic) for f in view.fragments),
                conv.closedAt,
                conv.title,
                conv.summary,
                tuple((c.recordingId, c.range.start) for c in conv.citations or []),
            )
        )
    return out


def recordings(row: tuple) -> list[str]:
    return [p[0] for p in row[4]]


async def all_l2_text(services: Services) -> str:
    """Every derived record of L2 (conversations incl. retired, states, links)."""
    parts = []
    for name in ("conversations", "states", "links"):
        parts.extend(str(doc) for doc in await getattr(services.stores, name).find({}))
    return "\n".join(parts)
