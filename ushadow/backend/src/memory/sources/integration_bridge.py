"""
Bridge between Integration system and Memory Source tool calling.

When a user creates a Notion/Obsidian integration instance, this bridge
automatically registers it as a tool-callable memory source for the LLM.
"""

import logging
from typing import List, Dict, Any

from src.services.instance_manager import get_instance_manager
from src.memory.adapters.factory import AdapterFactory
from .base import MemorySource, MemorySourceConfig, MemorySourceResult
from .registry import get_memory_source_registry

logger = logging.getLogger(__name__)


class IntegrationMemorySource(MemorySource):
    """
    Memory source that wraps an integration instance.

    Provides LLM tool calling access to integration adapters (MCP, REST, etc.).
    """

    def __init__(self, config: MemorySourceConfig, adapter):
        super().__init__(config)
        self.adapter = adapter

    async def query(self, query: str, **kwargs) -> List[MemorySourceResult]:
        """
        Query the integration via its adapter.

        For MCP integrations: Calls search/query tool
        For REST integrations: Makes HTTP request
        For filesystem: Searches files
        """
        try:
            # TODO: Implement query routing based on adapter type
            # This should call the appropriate adapter method

            # For now, fetch items and filter by query
            items = await self.adapter.fetch_items()

            # Simple text matching (should use semantic search in production)
            results = []
            for item in items:
                if query.lower() in item.content.lower() or query.lower() in item.title.lower():
                    result = MemorySourceResult(
                        content=item.content,
                        source_id=self.config.source_id,
                        source_name=self.config.name,
                        metadata=item.metadata or {},
                        references=[item.source_id] if item.source_id else [],
                    )
                    results.append(result)

                    if len(results) >= kwargs.get("limit", 5):
                        break

            return results

        except Exception as e:
            logger.error(f"Error querying integration {self.config.source_id}: {e}")
            return []

    def get_tool_definition(self) -> Dict[str, Any]:
        """
        Generate LLM tool definition for this integration.

        Returns OpenAI function calling format.
        """
        return {
            "type": "function",
            "function": {
                "name": f"search_{self.config.source_id}",
                "description": (
                    f"Search {self.config.name} for relevant information. "
                    f"{self.config.description}"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results (1-10)",
                            "default": 5,
                            "minimum": 1,
                            "maximum": 10,
                        },
                    },
                    "required": ["query"],
                },
            },
        }


async def register_integration_as_memory_source(instance_id: str) -> None:
    """
    Register an integration instance as a memory source for tool calling.

    Args:
        instance_id: The integration instance ID (e.g., "notion-1")
    """
    try:
        instance_manager = get_instance_manager()
        instance = instance_manager.get_instance(instance_id)

        if not instance or not instance.integration_type:
            logger.warning(f"Instance {instance_id} is not an integration")
            return

        # Create adapter for this integration
        adapter = AdapterFactory.create_adapter(instance.config, instance.settings or {})

        # Create memory source config
        source_config = MemorySourceConfig(
            source_id=instance_id,
            name=instance.name,
            description=instance.description or f"{instance.template_id} integration",
            enabled=True,
            metadata={
                "integration_type": instance.integration_type,
                "template_id": instance.template_id,
            }
        )

        # Create and register memory source
        source = IntegrationMemorySource(source_config, adapter)
        registry = get_memory_source_registry()
        registry.register(source)

        logger.info(f"Registered integration {instance_id} as memory source for tool calling")

    except Exception as e:
        logger.error(f"Failed to register integration {instance_id} as memory source: {e}")


async def unregister_integration_memory_source(instance_id: str) -> None:
    """
    Unregister an integration instance from memory sources.

    Args:
        instance_id: The integration instance ID
    """
    try:
        registry = get_memory_source_registry()
        registry.unregister(instance_id)
        logger.info(f"Unregistered integration {instance_id} from memory sources")
    except Exception as e:
        logger.error(f"Failed to unregister integration {instance_id}: {e}")


async def sync_integration_memory_sources() -> None:
    """
    Sync all active integration instances as memory sources.

    Should be called on startup to register existing integrations.
    """
    try:
        instance_manager = get_instance_manager()
        instance_summaries = instance_manager.list_instances()

        count = 0
        for summary in instance_summaries:
            # Load full instance to check integration_type
            instance = instance_manager.get_instance(summary.id)
            if instance and instance.integration_type:
                await register_integration_as_memory_source(instance.id)
                count += 1

        logger.info(f"Synced {count} integration(s) as memory sources")

    except Exception as e:
        logger.error(f"Failed to sync integration memory sources: {e}")
