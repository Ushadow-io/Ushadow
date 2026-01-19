"""
Configuration loader for memory sources.

Loads memory source configurations and initializes them in the registry.
"""

import logging
from typing import List, Dict, Any

from src.config.omegaconf_settings import get_settings_store

from .base import MemorySourceConfig
from .registry import get_memory_source_registry
from .implementations import DocumentationSource, OpenMemorySource, NotionSource, MCPSource

logger = logging.getLogger(__name__)


# Map source types to implementation classes
SOURCE_TYPE_MAP = {
    "documentation": DocumentationSource,
    "openmemory": OpenMemorySource,
    "notion": NotionSource,
    "mcp": MCPSource,
}


async def load_memory_sources_from_config() -> None:
    """
    Load memory sources from configuration and register them.

    Reads memory source configurations from settings and instantiates
    the appropriate source classes, registering them with the global registry.
    """
    settings = get_settings_store()
    registry = get_memory_source_registry()

    try:
        # Get memory sources config
        sources_config = await settings.get("memory.sources", [])

        logger.info(f"Memory sources config type: {type(sources_config)}, value: {sources_config}")

        if not sources_config:
            logger.info("No memory sources configured")
            return

        logger.info(f"Loading {len(sources_config)} memory source(s)")

        for source_cfg in sources_config:
            try:
                # Extract source config
                source_type = source_cfg.get("type")
                if not source_type:
                    logger.warning(f"Memory source missing 'type': {source_cfg}")
                    continue

                # Get source class
                source_class = SOURCE_TYPE_MAP.get(source_type)
                if not source_class:
                    logger.warning(
                        f"Unknown memory source type '{source_type}'. "
                        f"Available: {list(SOURCE_TYPE_MAP.keys())}"
                    )
                    continue

                # Build MemorySourceConfig
                config = MemorySourceConfig(
                    source_id=source_cfg.get("source_id", source_type),
                    name=source_cfg.get("name", source_type.title()),
                    description=source_cfg.get("description", f"{source_type} memory source"),
                    enabled=source_cfg.get("enabled", True),
                    metadata=source_cfg.get("metadata", {}),
                )

                # Instantiate and register
                source = source_class(config)
                registry.register(source)

                logger.info(
                    f"Registered memory source: {config.source_id} ({config.name}) - "
                    f"Type: {source_type}, Enabled: {config.enabled}"
                )

            except Exception as e:
                logger.error(f"Error loading memory source: {e}", exc_info=True)
                continue

    except Exception as e:
        logger.error(f"Error loading memory sources config: {e}", exc_info=True)


def register_memory_source_type(type_name: str, source_class) -> None:
    """
    Register a custom memory source type.

    Use this to add new memory source implementations at runtime.

    Args:
        type_name: Type identifier for the source (e.g., 'confluence', 'notion')
        source_class: MemorySource subclass to instantiate

    Example:
        >>> from my_sources import ConfluenceSource
        >>> register_memory_source_type('confluence', ConfluenceSource)
    """
    if type_name in SOURCE_TYPE_MAP:
        logger.warning(f"Overwriting existing source type: {type_name}")

    SOURCE_TYPE_MAP[type_name] = source_class
    logger.info(f"Registered memory source type: {type_name}")


async def get_memory_sources_status() -> Dict[str, Any]:
    """
    Get status of all registered memory sources.

    Returns:
        Dictionary with source counts and details
    """
    registry = get_memory_source_registry()

    enabled_sources = registry.get_enabled_sources()

    return {
        "total_sources": registry.source_count,
        "enabled_sources": registry.enabled_source_count,
        "sources": [
            {
                "source_id": source.source_id,
                "name": source.config.name,
                "description": source.config.description,
                "enabled": source.is_enabled,
            }
            for source in enabled_sources
        ],
    }
