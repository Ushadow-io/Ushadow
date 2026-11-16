"""Service settings, read from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    mongo_uri: str
    db_name: str
    port: int


def load_settings() -> Settings:
    return Settings(
        mongo_uri=os.environ.get("LEDGER_MONGO_URI", "mongodb://mongo:27017/?replicaSet=rs0"),
        db_name=os.environ.get("LEDGER_DB", "ledger"),
        port=int(os.environ.get("LEDGER_PORT", "8200")),
    )
