"""Load the plugin package as `ledger_adapter` without Chronicle installed.

Chronicle's `backend.plugins.base` is replaced by a minimal stand-in that copies the
real BasePlugin/PluginContext/PluginResult signatures
(chronicle/backend/src/backend/plugins/base.py). Only this file knows about the stub.
"""

import importlib.util
import sys
import types
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

ROOT = Path(__file__).resolve().parents[1]


@dataclass
class PluginContext:
    user_id: str
    event: str
    data: Dict[str, Any]
    metadata: Dict[str, Any] = field(default_factory=dict)
    services: Optional[Any] = None


@dataclass
class PluginResult:
    success: bool
    data: Optional[Dict[str, Any]] = None
    message: Optional[str] = None
    should_continue: bool = True


class BasePlugin:
    def __init__(self, config):
        self.config = config
        self.enabled = config.get("enabled", False)
        self.events = config.get("events", [])
        self.condition = config.get("condition", {"type": "always"})
        self.priority = config.get("priority", 100)


def _install():
    if "ledger_adapter" in sys.modules:
        return
    for name in ("backend", "backend.plugins"):
        sys.modules.setdefault(name, types.ModuleType(name))
    base = types.ModuleType("backend.plugins.base")
    base.BasePlugin, base.PluginContext, base.PluginResult = BasePlugin, PluginContext, PluginResult
    sys.modules["backend.plugins.base"] = base
    spec = importlib.util.spec_from_file_location(
        "ledger_adapter", ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
    mod = importlib.util.module_from_spec(spec)
    sys.modules["ledger_adapter"] = mod
    spec.loader.exec_module(mod)


_install()
