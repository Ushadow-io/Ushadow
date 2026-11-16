"""Store backends: Mongo side tables (mongomock) and the taskfacts adapter (local checkout)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from mongomock_motor import AsyncMongoMockClient

from memory_service.actions import ActionFactDraft, ActionSubject, ControlledEraseUnsupported
from memory_service.actions.store import TaskfactsActionFactStore
from memory_service.services.port import MemoryPort
from memory_service.stores import mongo_tables
from tests.helpers import T0, USER_A, make_deps, seed, seg_range, texts


async def test_full_cycle_on_mongo_side_tables():
    db = AsyncMongoMockClient()["memory_test"]
    deps = make_deps(tables=mongo_tables(db))
    port = MemoryPort(deps)
    lines = [("S1", "Zorblax works at Quuxcorp."), ("S0", "Dana likes Jazz.")]
    unit = await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, lines))
    assert unit.status == "done" and unit.facts_written == 2
    assert (await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, lines))).attempts == 1
    await port.erase(USER_A, "rec-c1", seg_range(T0, 0))
    assert await texts(port, USER_A, "Zorblax Dana") == ["Dana likes Jazz"]
    for name in await db.list_collection_names():
        async for doc in db[name].find({}):
            assert "zorblax" not in str(doc).lower(), name


def _taskfacts():
    """A taskfacts checkout: $TASKFACTS_PATH, else a `taskfacts` folder beside any parent folder."""
    found = [p / "taskfacts" for p in Path(__file__).resolve().parents if (p / "taskfacts").is_dir()]
    path = Path(os.environ["TASKFACTS_PATH"]) if "TASKFACTS_PATH" in os.environ else (
        found[0] if found else Path("taskfacts"))
    if not (path / "ushadow_facts" / "memory.py").exists():
        pytest.skip(f"no taskfacts checkout at {path}")
    sys.path.insert(0, str(path))
    sys.dont_write_bytecode = True  # read-only checkout: leave no __pycache__ in it
    try:
        from ushadow_facts.facts import Subject, standing
        from ushadow_facts.memory import MemoryStore
    except ImportError as exc:  # pragma: no cover
        pytest.skip(f"taskfacts not importable: {exc}")
    finally:
        sys.path.remove(str(path))
        sys.dont_write_bytecode = False
    return Subject, standing, MemoryStore


async def test_taskfacts_adapter_through_public_port_only():
    Subject, standing, MemoryStore = _taskfacts()
    raw = MemoryStore()
    store = TaskfactsActionFactStore(raw, Subject)
    draft = ActionFactDraft(subject=ActionSubject(kind="task", id="a_1"), key="task_requested",
                            occurred_at=T0, source="agent", scope="user:a",
                            value={"text": "book the venue", "memory_key": "k1", "key_hash": "h1"})
    f1 = await store.record(draft)
    assert (await store.record(draft)).id == f1.id  # idempotent on memory_key
    assert [f.id for f in await store.standing("user:a")] == [f1.id]
    assert await store.standing("user:b") == []
    await store.retract(f1, source="person")
    assert await store.standing("user:a") == []
    assert standing(raw.log, T0.replace(year=2030)) == []  # taskfacts' own rule agrees
    with pytest.raises(ControlledEraseUnsupported):
        await store.erase(f1)


async def test_erase_with_taskfacts_store_reports_unsupported():
    Subject, _, MemoryStore = _taskfacts()
    deps = make_deps(actions=TaskfactsActionFactStore(MemoryStore(), Subject))
    port = MemoryPort(deps)
    await port.ingest(USER_A, seed(deps, USER_A, "c1", T0, [("S0", "I will call the plumber.")]))
    rep = await port.erase(USER_A, "rec-c1", seg_range(T0, 0))
    # The fact stops standing, but taskfacts keeps the words: it has no controlled erase yet.
    assert rep.action_facts_erase_unsupported == 1 and rep.action_facts_erased == 0
    assert await port.action_facts(USER_A) == []
