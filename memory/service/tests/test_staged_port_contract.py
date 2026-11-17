"""The memory port's own tests, run again with the staged engine behind it (FakeLLM answering
with the fake engine's regexes, MemoryGraphStore). Every test of these modules that takes the
`deps` fixture is collected here with `deps` overridden; tests that build their own deps keep
the fake engine and are not repeated."""

from __future__ import annotations

import importlib
import inspect

import pytest

from memory_service.services.deps import Deps
from tests.helpers import make_deps
from tests.staged_helpers import staged

MODULES = ["test_ingest", "test_human_wins", "test_erase", "test_proof", "test_fact_lookup", "test_sync",
           "test_final_and_corrections", "test_isolation_and_actions"]
# Looks inside FakeEngine (deps.engine.groups); the staged engine passes the rest of it.
FAKE_INTERNALS = {"test_failed_unit_is_retried_without_duplicates"}

for _mod in MODULES:
    for _name, _fn in vars(importlib.import_module(f"tests.{_mod}")).items():
        if (_name.startswith("test_") and _name not in FAKE_INTERNALS and callable(_fn)
                and "deps" in inspect.signature(_fn).parameters):
            globals()[f"{_name}__staged"] = _fn


@pytest.fixture
def deps() -> Deps:
    return make_deps(engine=staged())


def test_the_contract_set_is_not_empty():
    assert sum(1 for k in globals() if k.endswith("__staged")) >= 20
