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
    engine: str = "graphiti"  # graphiti | fake | fake-mongo (fakes: tests and demos only)
    actions: str = "mongo"  # mongo | taskfacts | memory (memory is lost on restart: tests only)
    taskfacts_database_url: str = field(default="", repr=False)
    extractor: str = "none"  # none | fake | openai
    min_owner_words: int = 20  # owner gate: fewer owner words in a conversation = skipped
    lease_seconds: int = 600  # lease on a running work unit (renewed while it runs)
    worker_interval_seconds: float = 0  # background sync + retry loop; 0 = off
    worker_users: tuple[str, ...] = ()  # users to sync even before they have a cursor or queue
    max_attempts: int = 5  # a unit failing this often ends `failed` for good
    retry_backoff_seconds: float = 30  # wait after attempt n: this * 2**(n-1), capped at 15 min


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
        actions=e.get("MEMORY_ACTION_STORE", "mongo"),
        taskfacts_database_url=e.get("TASKFACTS_DATABASE_URL", ""),
        extractor=e.get("MEMORY_ACTION_EXTRACTOR", "none"),
        min_owner_words=int(e.get("MEMORY_MIN_OWNER_WORDS", "20")),
        lease_seconds=int(e.get("MEMORY_LEASE_SECONDS", "600")),
        worker_interval_seconds=float(e.get("MEMORY_WORKER_INTERVAL_SECONDS") or 0),
        worker_users=tuple(u.strip() for u in e.get("MEMORY_WORKER_USERS", "").split(",") if u.strip()),
        max_attempts=int(e.get("MEMORY_MAX_ATTEMPTS", "5")),
        retry_backoff_seconds=float(e.get("MEMORY_RETRY_BACKOFF_SECONDS", "30")),
    )
