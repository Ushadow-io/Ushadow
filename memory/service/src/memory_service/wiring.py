"""Build the real dependencies from settings. Optional backends are imported lazily."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from memory_service.actions import (
    ActionExtractor,
    ActionFactStore,
    FakeActionExtractor,
    InMemoryActionFactStore,
    NoActionExtractor,
    OpenAICompatibleActionExtractor,
    TaskfactsActionFactStore,
)
from memory_service.config import Settings
from memory_service.engine import FakeEngine, KnowledgeEngine
from memory_service.ledger_client import HttpLedgerClient
from memory_service.services.deps import Deps
from memory_service.stores import SideTables, ensure_indexes, memory_tables, mongo_tables


async def _tables(s: Settings) -> SideTables:
    if s.store == "memory":
        return memory_tables()
    from motor.motor_asyncio import AsyncIOMotorClient

    db = AsyncIOMotorClient(s.mongo_uri)[s.db_name]
    await ensure_indexes(db)
    return mongo_tables(db)


def _engine(s: Settings) -> KnowledgeEngine:
    if s.engine == "fake":
        return FakeEngine()
    from memory_service.engine.graphiti import make_graphiti_engine

    return make_graphiti_engine()


async def _actions(s: Settings) -> ActionFactStore:
    if s.actions == "memory":
        return InMemoryActionFactStore()
    # taskfacts on Postgres, through its public port. Needs `ushadow-facts[postgres]` installed
    # (not a dependency of this image yet) and a database migrated with taskfacts' 001_facts.sql.
    from sqlalchemy.ext.asyncio import create_async_engine  # type: ignore[import-not-found]
    from ushadow_facts.facts import Subject  # type: ignore[import-not-found]
    from ushadow_facts.postgres.store import PgStore  # type: ignore[import-not-found]

    if not s.taskfacts_database_url:
        raise RuntimeError("MEMORY_ACTION_STORE=taskfacts needs TASKFACTS_DATABASE_URL")
    store: Any = PgStore(create_async_engine(s.taskfacts_database_url))
    return TaskfactsActionFactStore(store, Subject)


def _extractor(s: Settings) -> ActionExtractor:
    if s.extractor == "fake":
        return FakeActionExtractor()
    if s.extractor == "openai":
        return OpenAICompatibleActionExtractor.from_env()
    return NoActionExtractor()


async def build_deps(s: Settings) -> Deps:
    return Deps(engine=_engine(s), tables=await _tables(s),
                ledger=HttpLedgerClient(s.ledger_url, s.ledger_token),
                actions=await _actions(s), extractor=_extractor(s),
                min_owner_words=s.min_owner_words, lease_ttl=timedelta(seconds=s.lease_seconds))
