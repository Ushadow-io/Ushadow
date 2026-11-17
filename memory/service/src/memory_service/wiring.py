"""Build the real dependencies from settings. Optional backends are imported lazily."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from memory_service.actions import (
    ActionExtractor,
    ActionFactStore,
    FakeActionExtractor,
    InMemoryActionFactStore,
    MongoActionFactStore,
    NoActionExtractor,
    OpenAICompatibleActionExtractor,
    TaskfactsActionFactStore,
)
from memory_service.config import Settings
from memory_service.engine import FakeEngine, KnowledgeEngine, PersistentFakeEngine
from memory_service.ledger_client import HttpLedgerClient
from memory_service.services.deps import Deps
from memory_service.stores import SideTables, ensure_indexes, memory_tables, mongo_tables


def _db(s: Settings) -> Any:
    from motor.motor_asyncio import AsyncIOMotorClient

    return AsyncIOMotorClient(s.mongo_uri)[s.db_name]


async def _tables(s: Settings, db: Any) -> SideTables:
    if s.store == "memory":
        return memory_tables()
    await ensure_indexes(db)
    return mongo_tables(db)


def _engine(s: Settings, db: Any) -> KnowledgeEngine:
    if s.engine == "fake":
        return FakeEngine()
    if s.engine == "fake-mongo":  # tests and demos: the fake, kept in this service's Mongo
        return PersistentFakeEngine(db["fake_engine"])
    if s.engine == "staged":
        from memory_service.engine.staged.factory import make_staged_engine

        return make_staged_engine(s.staged)
    if s.engine != "graphiti":
        raise ValueError(f"MEMORY_ENGINE={s.engine!r}: use graphiti, staged, fake or fake-mongo")
    from memory_service.engine.graphiti import make_graphiti_engine

    return make_graphiti_engine()


async def _actions(s: Settings, db: Any) -> ActionFactStore:
    if s.actions == "memory":  # in-process: lost on restart (tests only)
        return InMemoryActionFactStore()
    if s.actions == "mongo":
        store = MongoActionFactStore(db)
        await store.ensure_indexes()
        return store
    if s.actions != "taskfacts":
        raise ValueError(f"MEMORY_ACTION_STORE={s.actions!r}: use mongo, taskfacts or memory")
    # taskfacts on Postgres, through its public port. Needs `ushadow-facts[postgres]` installed
    # (not a dependency of this image yet) and a database migrated with taskfacts' 001_facts.sql.
    from sqlalchemy.ext.asyncio import create_async_engine  # type: ignore[import-not-found]
    from ushadow_facts.facts import Subject  # type: ignore[import-not-found]
    from ushadow_facts.postgres.store import PgStore  # type: ignore[import-not-found]

    if not s.taskfacts_database_url:
        raise RuntimeError("MEMORY_ACTION_STORE=taskfacts needs TASKFACTS_DATABASE_URL")
    pg: Any = PgStore(create_async_engine(s.taskfacts_database_url))
    return TaskfactsActionFactStore(pg, Subject)


def _extractor(s: Settings) -> ActionExtractor:
    if s.extractor == "fake":
        return FakeActionExtractor()
    if s.extractor == "openai":
        return OpenAICompatibleActionExtractor.from_env()
    return NoActionExtractor()


async def build_deps(s: Settings) -> Deps:
    needs_db = s.store == "mongo" or s.actions == "mongo" or s.engine == "fake-mongo"
    db = _db(s) if needs_db else None
    return Deps(engine=_engine(s, db), tables=await _tables(s, db),
                ledger=HttpLedgerClient(s.ledger_url, s.ledger_token),
                actions=await _actions(s, db), extractor=_extractor(s),
                min_owner_words=s.min_owner_words,
                owner_conversations_only=s.owner_conversations_only, lease_ttl=timedelta(seconds=s.lease_seconds),
                max_attempts=s.max_attempts,
                retry_backoff=timedelta(seconds=s.retry_backoff_seconds),
                maintain_budget=s.staged.maintain_budget if s.staged.maintain else 0)
