"""The knowledge engine port. The memory service owns ids, proof and human wins; the engine
only builds and stores a time-aware graph per group (one group per user)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from memory_service.models import EpisodeInput, Statement
from memory_service.schema import EvidenceRef
from memory_service.textutil import digest, norm


@dataclass
class EngineFact:
    engine_id: str
    source: str  # entity name
    relation: str
    target: str  # entity name
    text: str
    valid_at: datetime | None = None
    invalid_at: datetime | None = None
    episodes: list[str] = field(default_factory=list)  # engine episode ids
    human: bool = False
    source_entity_id: str | None = None
    target_entity_id: str | None = None
    # Proof the engine itself can point to. Graphiti gives none (episode granularity only);
    # then the service locates the quote in the episode lines and checks it.
    hints: list[EvidenceRef] = field(default_factory=list)

    @property
    def closed(self) -> bool:
        return self.invalid_at is not None

    def signature(self) -> str:
        return f"k|{norm(self.source)}|{norm(self.relation)}|{norm(self.target)}"


def statement_signature(s: Statement) -> str:
    return f"k|{norm(s.subject)}|{norm(s.relation)}|{norm(s.object)}"


def knowledge_key(user_id: str, signature: str) -> str:
    """Hash that identifies one knowledge fact for a user across engine rebuilds."""
    return digest("knowledge", user_id, signature)


def entity_key(user_id: str, name: str) -> str:
    return digest("entity", user_id, norm(name))


@dataclass
class EngineEntity:
    engine_id: str
    name: str
    summary: str | None = None


@dataclass
class EpisodeResult:
    engine_episode_id: str
    facts: list[EngineFact]  # facts this episode created or now supports
    closed: list[str]  # engine fact ids this episode closed (invalid_at set by it)


class KnowledgeEngine(Protocol):
    """Every call takes the group. There is no call without one (Graphiti searches all groups
    when none is given, so the adapter must never omit it)."""

    async def add_episode(self, group: str, episode: EpisodeInput) -> EpisodeResult: ...

    async def remove_episode(self, group: str, engine_episode_id: str) -> None: ...

    async def facts(self, group: str) -> list[EngineFact]: ...

    async def get_fact(self, group: str, engine_id: str) -> EngineFact | None: ...

    async def search(self, group: str, query: str, limit: int) -> list[EngineFact]: ...

    async def entity(self, group: str, engine_id: str) -> EngineEntity | None: ...

    async def entity_facts(self, group: str, engine_id: str) -> list[EngineFact]: ...

    async def assert_fact(self, group: str, statement: Statement, at: datetime) -> EngineFact: ...

    async def delete_fact(self, group: str, engine_id: str) -> None: ...

    async def reopen_fact(self, group: str, engine_id: str) -> None: ...

    async def clear(self, group: str) -> None: ...
