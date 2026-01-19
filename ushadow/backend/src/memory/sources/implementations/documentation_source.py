"""
Documentation memory source - queries documentation APIs.

Example implementation showing how to create a memory source that queries
external documentation systems (e.g., Confluence, ReadTheDocs, custom docs APIs).
"""

import logging
from typing import Any, Dict, List

import httpx

from ..base import MemorySource, MemorySourceConfig, MemorySourceResult

logger = logging.getLogger(__name__)


class DocumentationSource(MemorySource):
    """
    Memory source for querying documentation systems.

    This can query various documentation backends:
    - Confluence API
    - ReadTheDocs search
    - Custom documentation APIs
    - Internal knowledge bases
    """

    def __init__(self, config: MemorySourceConfig):
        super().__init__(config)

        # Extract source-specific config
        self.api_url = config.metadata.get("api_url")
        self.api_key = config.metadata.get("api_key")
        self.search_endpoint = config.metadata.get("search_endpoint", "/search")
        self.timeout = config.metadata.get("timeout", 10.0)

        if not self.api_url:
            raise ValueError("DocumentationSource requires 'api_url' in metadata")

    async def query(self, query: str, **kwargs) -> List[MemorySourceResult]:
        """
        Search documentation for relevant content.

        Args:
            query: Search query string
            **kwargs: Additional parameters:
                - limit: Max number of results (default: 5)
                - category: Optional category filter

        Returns:
            List of documentation search results
        """
        limit = kwargs.get("limit", 5)
        category = kwargs.get("category")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Build search request
                search_url = f"{self.api_url}{self.search_endpoint}"
                headers = {}

                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"

                params = {
                    "q": query,
                    "limit": limit,
                }

                if category:
                    params["category"] = category

                logger.info(f"Querying documentation: {search_url} with query='{query}'")

                response = await client.get(search_url, headers=headers, params=params)
                response.raise_for_status()

                data = response.json()

                # Parse results (format depends on your API)
                results = []
                for item in data.get("results", [])[:limit]:
                    result = MemorySourceResult(
                        content=item.get("content", item.get("excerpt", "")),
                        source_id=self.config.source_id,
                        source_name=self.config.name,
                        metadata={
                            "title": item.get("title", ""),
                            "url": item.get("url", ""),
                            "category": item.get("category", ""),
                            "relevance_score": item.get("score", 0.0),
                        },
                        references=[item.get("url")] if item.get("url") else [],
                    )
                    results.append(result)

                logger.info(f"Found {len(results)} documentation results")
                return results

        except httpx.TimeoutException:
            logger.warning(f"Documentation source timeout: {self.api_url}")
            return []
        except httpx.HTTPStatusError as e:
            logger.error(f"Documentation API error: {e.response.status_code}")
            return []
        except Exception as e:
            logger.error(f"Error querying documentation: {e}")
            return []

    def get_tool_definition(self) -> Dict[str, Any]:
        """
        Generate LLM tool definition for documentation search.

        Returns OpenAI function calling format.
        """
        return {
            "type": "function",
            "function": {
                "name": f"search_{self.config.source_id}",
                "description": (
                    f"Search {self.config.name} for relevant documentation. "
                    f"{self.config.description}. "
                    "Use this when you need detailed information from official documentation."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query for documentation",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results to return (1-10)",
                            "default": 5,
                            "minimum": 1,
                            "maximum": 10,
                        },
                        "category": {
                            "type": "string",
                            "description": "Optional category filter (e.g., 'api', 'guides', 'reference')",
                        },
                    },
                    "required": ["query"],
                },
            },
        }

    def _format_results(self, results: List[MemorySourceResult]) -> str:
        """Format documentation results for LLM."""
        if not results:
            return f"No documentation found in {self.config.name}"

        formatted = f"Documentation from {self.config.name}:\n\n"

        for i, result in enumerate(results, 1):
            title = result.metadata.get("title", "Untitled")
            formatted += f"{i}. **{title}**\n"
            formatted += f"   {result.content}\n"

            if result.references:
                formatted += f"   📄 View full documentation: {result.references[0]}\n"

            formatted += "\n"

        return formatted.strip()
