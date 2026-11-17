"""What the services are built from. One object, passed explicitly."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from memory_service.actions import ActionExtractor, ActionFactStore
from memory_service.engine import KnowledgeEngine, knowledge_key
from memory_service.ledger_client import LedgerClient
from memory_service.stores import SideTables
from memory_service.textutil import digest, norm


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass
class Deps:
    engine: KnowledgeEngine
    tables: SideTables
    ledger: LedgerClient
    actions: ActionFactStore
    extractor: ActionExtractor
    clock: Callable[[], datetime] = field(default=utcnow)
    max_attempts: int = 5  # a unit that fails this often ends `failed` for good
    retry_backoff: timedelta = timedelta(seconds=30)  # wait after attempt n: backoff * 2**(n-1)
    retry_backoff_cap: timedelta = timedelta(minutes=15)
    min_owner_words: int = 20  # owner gate; 0 turns it off
    owner_conversations_only: bool = True  # no owner voice in the conversation = skipped
    lease_ttl: timedelta = timedelta(minutes=10)
    worker_id: str = field(default_factory=lambda: uuid.uuid4().hex)


# ---- ids ---------------------------------------------------------------------------------------

KNOWLEDGE_PREFIX = "mf_"
ACTION_PREFIX = "act_"
ENTITY_PREFIX = "ent_"


def knowledge_fact_id(user_id: str, signature: str) -> str:
    return KNOWLEDGE_PREFIX + knowledge_key(user_id, signature)


def action_key(user_id: str, key: str, text: str) -> str:
    """Suppression key of an action fact: same key + same words = the same fact."""
    return digest("action", user_id, key, norm(text))


def action_scope(user_id: str) -> str:
    """taskfacts `scope` for one user's action facts."""
    return f"user:{user_id}"
