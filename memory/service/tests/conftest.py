"""Shared fixtures. Helpers live in tests/helpers.py."""

from __future__ import annotations

import pytest

from memory_service.services.deps import Deps
from memory_service.services.port import MemoryPort
from tests.helpers import make_deps


@pytest.fixture
def deps() -> Deps:
    return make_deps()


@pytest.fixture
def port(deps: Deps) -> MemoryPort:
    return MemoryPort(deps)
