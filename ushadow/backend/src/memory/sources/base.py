"""
Base interface for memory source plugins.

Memory sources are external data stores that can be queried by the LLM via tool calling.
Each source provides specific domain knowledge (e.g., documentation, code, personal notes).
"""

from abc import ABC, abstractmethod
from typing import Any, Optional
from pydantic import BaseModel, Field


class MemorySourceConfig(BaseModel):
    """Configuration for a memory source."""

    source_id: str = Field(..., description="Unique identifier for this memory source")
    name: str = Field(..., description="Human-readable name")
    description: str = Field(..., description="What kind of information this source provides")
    enabled: bool = Field(default=True, description="Whether this source is available")
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Additional source-specific configuration"
    )


class MemorySourceResult(BaseModel):
    """Result from querying a memory source."""

    content: str = Field(..., description="The retrieved content")
    source_id: str = Field(..., description="ID of the source that provided this result")
    source_name: str = Field(..., description="Name of the source")
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata (e.g., link, timestamp, relevance score)",
    )
    references: list[str] = Field(
        default_factory=list,
        description="Links or references back to original content",
    )


class MemorySource(ABC):
    """
    Abstract base class for memory sources.

    Memory sources are queryable external data stores that the LLM can access
    via function calling. Each source exposes itself as one or more LLM tools.
    """

    def __init__(self, config: MemorySourceConfig):
        self.config = config

    @abstractmethod
    async def query(self, query: str, **kwargs) -> list[MemorySourceResult]:
        """
        Query the memory source.

        Args:
            query: The search query
            **kwargs: Additional source-specific parameters

        Returns:
            List of results from this source
        """
        pass

    @abstractmethod
    def get_tool_definition(self) -> dict[str, Any]:
        """
        Generate LLM tool definition for this memory source.

        Returns OpenAI function calling format:
        {
            "type": "function",
            "function": {
                "name": "query_source_name",
                "description": "Description of what this source provides",
                "parameters": {
                    "type": "object",
                    "properties": {...},
                    "required": [...]
                }
            }
        }
        """
        pass

    async def execute_tool_call(
        self, tool_call_id: str, arguments: dict[str, Any]
    ) -> str:
        """
        Execute a tool call from the LLM.

        Args:
            tool_call_id: Unique ID for this tool call
            arguments: Parsed JSON arguments from the LLM

        Returns:
            Formatted string result to send back to the LLM
        """
        # Extract query from arguments
        query = arguments.get("query", "")
        if not query:
            return "Error: No query provided"

        try:
            results = await self.query(query, **arguments)
            return self._format_results(results)
        except Exception as e:
            return f"Error querying {self.config.name}: {str(e)}"

    def _format_results(self, results: list[MemorySourceResult]) -> str:
        """
        Format results for LLM consumption.

        Override this method to customize how results are presented to the LLM.
        """
        if not results:
            return f"No results found in {self.config.name}"

        formatted = f"Results from {self.config.name}:\n\n"
        for i, result in enumerate(results, 1):
            formatted += f"{i}. {result.content}\n"
            if result.references:
                formatted += f"   References: {', '.join(result.references)}\n"
            formatted += "\n"

        return formatted.strip()

    @property
    def is_enabled(self) -> bool:
        """Check if this source is enabled."""
        return self.config.enabled

    @property
    def source_id(self) -> str:
        """Get the unique source ID."""
        return self.config.source_id
