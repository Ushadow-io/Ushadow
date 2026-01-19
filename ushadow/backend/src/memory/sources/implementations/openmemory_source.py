"""
OpenMemory source - queries the central memory store.

Wraps OpenMemory as a tool-callable memory source, allowing the LLM
to explicitly query for contextual information when needed.
"""

import logging
from typing import Any, Dict, List

import httpx

from ..base import MemorySource, MemorySourceConfig, MemorySourceResult

logger = logging.getLogger(__name__)


class OpenMemorySource(MemorySource):
    """
    Memory source for querying OpenMemory central store.

    OpenMemory provides the main inference facts and contextual information
    stored across Postgres, Qdrant vector DB, and Neo4j graph DB.
    """

    def __init__(self, config: MemorySourceConfig):
        super().__init__(config)

        # Extract configuration
        self.base_url = config.metadata.get("base_url", "http://localhost:8765")
        self.timeout = config.metadata.get("timeout", 5.0)

    async def query(self, query: str, **kwargs) -> List[MemorySourceResult]:
        """
        Search OpenMemory for relevant context.

        Args:
            query: Search query
            **kwargs: Additional parameters:
                - user_id: User identifier for personalized memories
                - limit: Max number of results (default: 5)

        Returns:
            List of memory results
        """
        user_id = kwargs.get("user_id", "default")
        limit = kwargs.get("limit", 5)

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                search_url = f"{self.base_url}/api/v1/memories/search"

                logger.info(f"Querying OpenMemory: query='{query}', user_id={user_id}")

                response = await client.post(
                    search_url,
                    json={
                        "query": query,
                        "user_id": user_id,
                        "limit": limit,
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    memories = data.get("results", [])

                    results = []
                    for mem in memories:
                        # Extract memory content
                        content = mem.get("memory", mem.get("content", ""))

                        # Build metadata
                        metadata = {
                            "memory_id": mem.get("id", ""),
                            "user_id": mem.get("user_id", ""),
                            "timestamp": mem.get("created_at", ""),
                            "relevance_score": mem.get("score", 0.0),
                        }

                        # Extract source references if available
                        references = []
                        source_ref = mem.get("metadata", {}).get("source_url")
                        if source_ref:
                            references.append(source_ref)

                        result = MemorySourceResult(
                            content=content,
                            source_id=self.config.source_id,
                            source_name=self.config.name,
                            metadata=metadata,
                            references=references,
                        )
                        results.append(result)

                    logger.info(f"Found {len(results)} memories from OpenMemory")
                    return results

                else:
                    logger.warning(f"OpenMemory returned status {response.status_code}")
                    return []

        except httpx.TimeoutException:
            logger.warning("OpenMemory timeout")
            return []
        except httpx.ConnectError:
            logger.debug("OpenMemory not available")
            return []
        except Exception as e:
            logger.error(f"Error querying OpenMemory: {e}")
            return []

    def get_tool_definition(self) -> Dict[str, Any]:
        """
        Generate LLM tool definition for OpenMemory search.

        Returns OpenAI function calling format.
        """
        return {
            "type": "function",
            "function": {
                "name": "search_openmemory",
                "description": (
                    "Search the central memory store (OpenMemory) for relevant context and inference facts. "
                    "OpenMemory contains high-level knowledge, user context, and previous conversation insights. "
                    "Use this when you need general contextual information or to recall previous interactions."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query for memory lookup",
                        },
                        "user_id": {
                            "type": "string",
                            "description": "User identifier for personalized memories (default: 'default')",
                            "default": "default",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of memories to return (1-10)",
                            "default": 5,
                            "minimum": 1,
                            "maximum": 10,
                        },
                    },
                    "required": ["query"],
                },
            },
        }

    def _format_results(self, results: List[MemorySourceResult]) -> str:
        """Format memory results for LLM."""
        if not results:
            return "No relevant memories found in OpenMemory"

        formatted = "Relevant memories from OpenMemory:\n\n"

        for i, result in enumerate(results, 1):
            formatted += f"{i}. {result.content}\n"

            # Add source reference if available
            if result.references:
                formatted += f"   🔗 Source: {result.references[0]}\n"

            # Add timestamp if available
            timestamp = result.metadata.get("timestamp")
            if timestamp:
                formatted += f"   📅 {timestamp}\n"

            formatted += "\n"

        return formatted.strip()
