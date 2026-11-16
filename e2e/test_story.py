"""pytest entry for the story. Opt-in: skipped unless E2E_MONGO_URI is set. E2E_DOCKER=1 runs
it against the two built images instead of local processes."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from runner import run_all  # noqa: E402

pytestmark = pytest.mark.skipif(not os.environ.get("E2E_MONGO_URI"), reason="E2E_MONGO_URI not set")


def test_ledger_and_memory_story(tmp_path):
    assert run_all(docker=os.environ.get("E2E_DOCKER") == "1", logs=tmp_path) == 0
