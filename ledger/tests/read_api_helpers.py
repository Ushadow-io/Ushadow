"""Shared setup for the read-API tests: the L2 day, a fake memory with facts about it, scoped
principals, and an HTTP client on the app."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

from ledger.clients.memory import MemoryEntity, MemoryFact
from ledger.clients.memory_fake import FakeMemoryClient
from ledger.models import EraseRequest
from ledger.schema import EvidenceRef, TimeRange
from ledger.services import build_services
from ledger.stores import build_stores
from tests.conftest import fake_models, fixed_clock, new_db
from tests.fixtures.l2_day import USER, at
from tests.l2_helpers import SPLIT, ingest_and_run

TOKENS = {
    "agent": "tok-agent-0123456789",  # everything, may write
    "reader": "tok-reader-0123456789",  # all kinds, normal only, read-only
    "convonly": "tok-convonly-0123456789",  # conversations only
    "bound": "tok-bound-0123456789",  # may act for another user only
    "writer": "tok-writer-0123456789",  # writes, normal only
    "chronicle": "tok-chronicle-0123456789",  # a service principal: no scope entry
}
SCOPES = {
    "principals": {
        "agent": {"kinds": ["*"], "sensitivity": ["*"], "write": True},
        "reader": {"kinds": ["conversation", "knowledge", "action"], "sensitivity": ["normal"]},
        "convonly": {"kinds": ["conversation"], "sensitivity": ["normal"]},
        "bound": {"kinds": ["*"], "sensitivity": ["*"], "users": ["someone-else"]},
        "writer": {"kinds": ["*"], "sensitivity": ["normal"], "write": True},
    }
}
ERASED = TimeRange(start=at("13:00:10"), end=at("13:00:20"))


def env(monkeypatch) -> None:
    monkeypatch.setenv("LEDGER_TOKENS", ",".join(f"{k}:{v}" for k, v in TOKENS.items()))
    monkeypatch.delenv("LEDGER_TOKEN", raising=False)
    monkeypatch.setenv("LEDGER_SCOPES", json.dumps(SCOPES))


def auth(name: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKENS[name]}"}


def _ev(rec: str, start: datetime, quote: str) -> list[EvidenceRef]:
    return [EvidenceRef(recordingId=rec, range=TimeRange(start=start, end=start + timedelta(
        seconds=5)), transcriptRevision="r1", quote=quote)]


def fake_memory() -> FakeMemoryClient:
    k = dict(kind="knowledge", key="works at", source="agent")
    facts = [
        MemoryFact(id="mf_alexjob", text="Alex works at Northwind venue", about=["ent_alex"],
                   subject={"kind": "entity", "id": "ent_alex"}, validAt=at("09:00:05"),
                   evidence=_ev("rec-m", at("09:00:05"), "Alex works at Northwind"), **k),
        MemoryFact(id="mf_alexsmith", text="Alex Smith likes the venue", about=["ent_alexs"],
                   subject={"kind": "entity", "id": "ent_alexs"}, validAt=at("09:12:05"),
                   evidence=_ev("rec-n", at("09:12:05"), "Alex Smith likes"), **k),
        MemoryFact(id="act_promise", kind="action", key="promise_made", source="agent",
                   text="I will send Alex the venue budget", direction="owed_by_me",
                   subject={"kind": "commitment", "id": "a1"}, about=["ent_alex"],
                   conversationId="placeholder", validAt=at("09:00:11"),
                   evidence=_ev("rec-m", at("09:00:11"), "I will send Alex the venue budget")),
        MemoryFact(id="act_owed", kind="action", key="promise_made", source="agent",
                   text="Alex will book the venue", direction="owed_to_me",
                   subject={"kind": "commitment", "id": "a2"}, validAt=at("09:00:17"),
                   evidence=_ev("rec-m", at("09:00:17"), "Alex will book the venue")),
        MemoryFact(id="act_private", kind="action", key="task_requested", source="agent",
                   text="Alex asked about the venue health check", sensitivity="private",
                   subject={"kind": "task", "id": "a3"}, validAt=at("09:00:23"),
                   evidence=_ev("rec-m", at("09:00:23"), "venue health check")),
    ]
    entities = [MemoryEntity(id="ent_alex", name="Alex"),
                MemoryEntity(id="ent_alexs", name="Alex Smith")]
    return FakeMemoryClient(facts, entities)


async def read_services(memory: FakeMemoryClient | None = None):
    """The L2 day built, rec-x partly erased (an `excluded` gap), memory faked."""
    mem = memory or fake_memory()
    services = build_services(build_stores(new_db()), clock=fixed_clock,
                              models=fake_models(SPLIT), memory=mem)
    await ingest_and_run(services)
    await services.conversations.erase(EraseRequest(userId=USER, recordingId="rec-x",
                                                    range=ERASED))
    first = (await services.conversations.list(USER, None))[0].conversation.id
    mem.facts["act_promise"].conversationId = first
    return services, mem
