"""Knowledge engines behind the memory port. `graphiti` is imported lazily (optional extra)."""

from memory_service.engine.base import (
    EngineEntity,
    EngineFact,
    EpisodeResult,
    KnowledgeEngine,
    entity_key,
    knowledge_key,
    statement_signature,
)
from memory_service.engine.fake import FakeEngine

__all__ = [
    "EngineEntity",
    "EngineFact",
    "EpisodeResult",
    "FakeEngine",
    "KnowledgeEngine",
    "entity_key",
    "knowledge_key",
    "statement_signature",
]
