"""
Test environment initialisation.

Run once before a fresh test suite to provision the test Casdoor instance.
Called by suite_setup.robot via the ``Provision Test Environment`` keyword.

Delegates to ``setup.setup_utils.provision_casdoor`` — the same function used
by ``setup/run.py`` on normal dev startup — so both environments follow exactly
the same provisioning code path.

All provisioning parameters (CASDOOR_EXTERNAL_URL, CASDOOR_PG_CONTAINER, …)
are read from .env.test by the SDK; no values are hardcoded here.
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROBOT_TESTS_DIR = Path(__file__).parents[2]
_PROJECT_ROOT    = _ROBOT_TESTS_DIR.parent
_ENV_FILE        = _ROBOT_TESTS_DIR / ".env.test"
_CONFIG_DIR      = _PROJECT_ROOT / "config" / "casdoor"
_BACKEND_DIR     = _PROJECT_ROOT / "ushadow" / "backend"

# Add project setup/ dir to path so we can import the shared utility
sys.path.insert(0, str(_PROJECT_ROOT / "setup"))
from setup_utils import provision_casdoor  # noqa: E402


def provision_test_environment() -> None:
    """Idempotent: provision the test Casdoor instance.

    Safe to call on every test run — all steps are no-ops if already done.
    """
    ok, err = provision_casdoor(
        env_file=_ENV_FILE,
        config_dir=_CONFIG_DIR,
        backend_dir=_BACKEND_DIR,
    )
    if not ok:
        raise RuntimeError(f"casdoor-provision failed:\n{err}")
    print("  ✓ Test Casdoor provisioned")
