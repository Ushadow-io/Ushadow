"""Service settings, read from the environment. Secrets are never logged or printed."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

os.environ.setdefault("GRAPHITI_TELEMETRY_ENABLED", "false")


@dataclass(frozen=True)
class Settings:
    port: int = 8210
    memory_token: str = field(default="", repr=False)  # empty: every protected route answers 503
    ledger_url: str = "http://ledger:8200"
    ledger_token: str = field(default="", repr=False)
    store: str = "mongo"  # mongo | memory
    mongo_uri: str = "mongodb://mongo:27017/?replicaSet=rs0"
    db_name: str = "memory"
    engine: str = "graphiti"  # graphiti | fake
    actions: str = "memory"  # memory | taskfacts
    taskfacts_database_url: str = field(default="", repr=False)
    extractor: str = "none"  # none | fake | openai


def load_settings() -> Settings:
    e = os.environ
    return Settings(
        port=int(e.get("MEMORY_PORT", "8210")),
        memory_token=e.get("MEMORY_TOKEN", ""),
        ledger_url=e.get("LEDGER_URL", "http://ledger:8200"),
        ledger_token=e.get("LEDGER_TOKEN", ""),
        store=e.get("MEMORY_STORE", "mongo"),
        mongo_uri=e.get("MEMORY_MONGO_URI", "mongodb://mongo:27017/?replicaSet=rs0"),
        db_name=e.get("MEMORY_DB", "memory"),
        engine=e.get("MEMORY_ENGINE", "graphiti"),
        actions=e.get("MEMORY_ACTION_STORE", "memory"),
        taskfacts_database_url=e.get("TASKFACTS_DATABASE_URL", ""),
        extractor=e.get("MEMORY_ACTION_EXTRACTOR", "none"),
    )
