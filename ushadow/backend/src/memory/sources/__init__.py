"""
Memory source plugin system for chat tool calling.

Memory sources provide detailed information that supplements the central memory store.
Each source can be queried by the LLM via function calling when it needs specific details.
"""

from .base import MemorySource, MemorySourceConfig
from .registry import MemorySourceRegistry, get_memory_source_registry
from .config_loader import (
    load_memory_sources_from_config,
    register_memory_source_type,
    get_memory_sources_status,
)

__all__ = [
    "MemorySource",
    "MemorySourceConfig",
    "MemorySourceRegistry",
    "get_memory_source_registry",
    "load_memory_sources_from_config",
    "register_memory_source_type",
    "get_memory_sources_status",
]
