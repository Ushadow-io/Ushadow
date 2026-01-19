"""
Registry for managing memory source plugins.

The registry maintains a collection of available memory sources and provides
methods to convert them into LLM tools and route tool calls to the appropriate source.
"""

from typing import Any, Optional
import logging

from .base import MemorySource

logger = logging.getLogger(__name__)


class MemorySourceRegistry:
    """
    Registry for memory source plugins.

    Manages registration, discovery, and tool call routing for memory sources.
    """

    def __init__(self):
        self._sources: dict[str, MemorySource] = {}

    def register(self, source: MemorySource) -> None:
        """
        Register a memory source.

        Args:
            source: The memory source to register
        """
        source_id = source.source_id
        if source_id in self._sources:
            logger.warning(f"Memory source {source_id} already registered, replacing")

        self._sources[source_id] = source
        logger.info(
            f"Registered memory source: {source_id} ({source.config.name}) "
            f"- Enabled: {source.is_enabled}"
        )

    def unregister(self, source_id: str) -> None:
        """
        Unregister a memory source.

        Args:
            source_id: ID of the source to remove
        """
        if source_id in self._sources:
            del self._sources[source_id]
            logger.info(f"Unregistered memory source: {source_id}")

    def get_source(self, source_id: str) -> Optional[MemorySource]:
        """
        Get a specific memory source by ID.

        Args:
            source_id: The source ID to look up

        Returns:
            The memory source, or None if not found
        """
        return self._sources.get(source_id)

    def get_enabled_sources(self) -> list[MemorySource]:
        """
        Get all enabled memory sources.

        Returns:
            List of enabled sources
        """
        return [source for source in self._sources.values() if source.is_enabled]

    def get_tool_definitions(self) -> list[dict[str, Any]]:
        """
        Get LLM tool definitions for all enabled sources.

        Returns:
            List of OpenAI function calling tool definitions
        """
        tools = []
        for source in self.get_enabled_sources():
            try:
                tool_def = source.get_tool_definition()
                tools.append(tool_def)
            except Exception as e:
                logger.error(
                    f"Error getting tool definition from {source.source_id}: {e}"
                )

        logger.debug(f"Generated {len(tools)} tool definitions from memory sources")
        return tools

    async def execute_tool_call(
        self, function_name: str, tool_call_id: str, arguments: dict[str, Any]
    ) -> str:
        """
        Route a tool call to the appropriate memory source.

        Args:
            function_name: Name of the function being called
            tool_call_id: Unique ID for this tool call
            arguments: Parsed arguments from the LLM

        Returns:
            Result string to send back to the LLM
        """
        # Find the source that handles this function
        for source in self.get_enabled_sources():
            tool_def = source.get_tool_definition()
            if tool_def.get("function", {}).get("name") == function_name:
                logger.info(
                    f"Routing tool call {function_name} to source {source.source_id}"
                )
                return await source.execute_tool_call(tool_call_id, arguments)

        logger.error(f"No memory source found for function: {function_name}")
        return f"Error: Unknown function {function_name}"

    def clear(self) -> None:
        """Clear all registered sources."""
        self._sources.clear()
        logger.info("Cleared all memory sources from registry")

    @property
    def source_count(self) -> int:
        """Get the number of registered sources."""
        return len(self._sources)

    @property
    def enabled_source_count(self) -> int:
        """Get the number of enabled sources."""
        return len(self.get_enabled_sources())


# Global singleton instance
_registry: Optional[MemorySourceRegistry] = None


def get_memory_source_registry() -> MemorySourceRegistry:
    """
    Get the global memory source registry.

    Returns:
        The singleton registry instance
    """
    global _registry
    if _registry is None:
        _registry = MemorySourceRegistry()
        logger.info("Created memory source registry")
    return _registry
