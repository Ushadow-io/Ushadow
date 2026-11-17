"""Build a StagedEngine from the environment (used by wiring.py and eval/run_staged.py)."""

from __future__ import annotations

import os
from collections.abc import Mapping

from memory_service.engine.staged.llm import LLMConfig, OpenAICompatibleLLM
from memory_service.engine.staged.pipeline import StagedEngine
from memory_service.engine.staged.settings import StagedSettings
from memory_service.engine.staged.store import GraphStore, MemoryGraphStore


def make_store(settings: StagedSettings, env: Mapping[str, str] | None = None) -> GraphStore:
    if settings.store == "memory":
        return MemoryGraphStore()
    if settings.store != "neo4j":
        raise ValueError(f"MEMORY_STAGED_STORE={settings.store!r}: use neo4j or memory")
    from memory_service.engine.staged.store_neo4j import make_neo4j_store

    return make_neo4j_store(env)


def make_staged_engine(settings: StagedSettings | None = None,
                       env: Mapping[str, str] | None = None) -> StagedEngine:
    e = env if env is not None else os.environ
    s = settings or StagedSettings.from_env(e)
    return StagedEngine(make_store(s, e), OpenAICompatibleLLM(LLMConfig.from_env(e)), s)
