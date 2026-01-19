"""
Notion memory source - queries Notion workspace.

Allows the LLM to search through Notion pages, databases, and notes
for detailed information and saved content.
"""

import logging
from typing import Any, Dict, List

import httpx

from ..base import MemorySource, MemorySourceConfig, MemorySourceResult

logger = logging.getLogger(__name__)


class NotionSource(MemorySource):
    """
    Memory source for querying Notion workspace.

    Searches through Notion pages and databases using the Notion Search API.
    Supports filtering by page type, database, and other criteria.
    """

    def __init__(self, config: MemorySourceConfig):
        super().__init__(config)

        # Extract Notion configuration
        self.api_token = config.metadata.get("api_token")
        self.notion_version = config.metadata.get("notion_version", "2022-06-28")
        self.timeout = config.metadata.get("timeout", 10.0)
        self.base_url = "https://api.notion.com/v1"

        if not self.api_token:
            raise ValueError("NotionSource requires 'api_token' in metadata")

    async def query(self, query: str, **kwargs) -> List[MemorySourceResult]:
        """
        Search Notion workspace for relevant content.

        Args:
            query: Search query string
            **kwargs: Additional parameters:
                - limit: Max number of results (default: 5)
                - filter: Optional filter (e.g., 'page', 'database')

        Returns:
            List of Notion search results
        """
        limit = kwargs.get("limit", 5)
        filter_type = kwargs.get("filter")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Notion Search API
                search_url = f"{self.base_url}/search"

                headers = {
                    "Authorization": f"Bearer {self.api_token}",
                    "Notion-Version": self.notion_version,
                    "Content-Type": "application/json",
                }

                # Build search request
                body: Dict[str, Any] = {
                    "query": query,
                    "page_size": min(limit, 100),  # Notion max is 100
                }

                # Add filter if specified
                if filter_type:
                    body["filter"] = {"value": filter_type, "property": "object"}

                logger.info(f"Searching Notion: query='{query}', filter={filter_type}")

                response = await client.post(search_url, headers=headers, json=body)
                response.raise_for_status()

                data = response.json()
                results = []

                for item in data.get("results", [])[:limit]:
                    # Extract page/database properties
                    item_type = item.get("object")  # 'page' or 'database'
                    item_id = item.get("id", "")
                    url = item.get("url", "")

                    # Extract title (different structure for pages vs databases)
                    title = self._extract_title(item)

                    # Get preview text from properties
                    content_preview = await self._get_content_preview(
                        client, headers, item_id, item_type
                    )

                    # Build result
                    result = MemorySourceResult(
                        content=f"{title}\n\n{content_preview}",
                        source_id=self.config.source_id,
                        source_name=self.config.name,
                        metadata={
                            "title": title,
                            "type": item_type,
                            "notion_id": item_id,
                            "url": url,
                            "created_time": item.get("created_time", ""),
                            "last_edited_time": item.get("last_edited_time", ""),
                        },
                        references=[url] if url else [],
                    )
                    results.append(result)

                logger.info(f"Found {len(results)} Notion results")
                return results

        except httpx.TimeoutException:
            logger.warning("Notion API timeout")
            return []
        except httpx.HTTPStatusError as e:
            logger.error(f"Notion API error: {e.response.status_code} - {e.response.text}")
            return []
        except Exception as e:
            logger.error(f"Error querying Notion: {e}")
            return []

    def _extract_title(self, item: Dict[str, Any]) -> str:
        """Extract title from Notion page or database."""
        try:
            # Try properties.title for pages
            properties = item.get("properties", {})

            # Look for title property (could be named "title", "Name", etc.)
            for prop_name, prop_data in properties.items():
                if prop_data.get("type") == "title":
                    title_array = prop_data.get("title", [])
                    if title_array:
                        return "".join([t.get("plain_text", "") for t in title_array])

            # Fallback to database title
            if item.get("object") == "database":
                title_array = item.get("title", [])
                if title_array:
                    return "".join([t.get("plain_text", "") for t in title_array])

            return "Untitled"

        except Exception as e:
            logger.debug(f"Error extracting title: {e}")
            return "Untitled"

    async def _get_content_preview(
        self,
        client: httpx.AsyncClient,
        headers: Dict[str, str],
        page_id: str,
        item_type: str,
    ) -> str:
        """
        Get content preview from Notion page blocks.

        Fetches the first few blocks of content to provide context.
        """
        if item_type != "page":
            return ""  # Can't get content from databases

        try:
            # Retrieve page blocks
            blocks_url = f"{self.base_url}/blocks/{page_id}/children"
            response = await client.get(blocks_url, headers=headers)

            if response.status_code != 200:
                return ""

            data = response.json()
            blocks = data.get("results", [])

            # Extract text from first few blocks
            preview_parts = []
            for block in blocks[:3]:  # First 3 blocks
                block_type = block.get("type")
                block_data = block.get(block_type, {})

                # Extract rich text
                rich_text = block_data.get("rich_text", [])
                if rich_text:
                    text = "".join([rt.get("plain_text", "") for rt in rich_text])
                    if text.strip():
                        preview_parts.append(text.strip())

            return "\n".join(preview_parts[:200])  # Limit preview length

        except Exception as e:
            logger.debug(f"Error getting content preview: {e}")
            return ""

    def get_tool_definition(self) -> Dict[str, Any]:
        """
        Generate LLM tool definition for Notion search.

        Returns OpenAI function calling format.
        """
        return {
            "type": "function",
            "function": {
                "name": f"search_{self.config.source_id}",
                "description": (
                    f"Search {self.config.name} for relevant notes and information. "
                    f"{self.config.description}. "
                    "Use this when you need to recall detailed notes, saved information, "
                    "or personal knowledge the user has documented."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query for Notion pages and databases",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results to return (1-10)",
                            "default": 5,
                            "minimum": 1,
                            "maximum": 10,
                        },
                        "filter": {
                            "type": "string",
                            "description": "Filter by type: 'page' for pages only, 'database' for databases only",
                            "enum": ["page", "database"],
                        },
                    },
                    "required": ["query"],
                },
            },
        }

    def _format_results(self, results: List[MemorySourceResult]) -> str:
        """Format Notion results for LLM."""
        if not results:
            return f"No notes found in {self.config.name}"

        formatted = f"Notes from {self.config.name}:\n\n"

        for i, result in enumerate(results, 1):
            title = result.metadata.get("title", "Untitled")
            item_type = result.metadata.get("type", "page")

            formatted += f"{i}. **{title}** ({item_type})\n"
            formatted += f"   {result.content[:200]}...\n"  # Show preview

            if result.references:
                formatted += f"   📝 View in Notion: {result.references[0]}\n"

            # Add last edited time
            last_edited = result.metadata.get("last_edited_time")
            if last_edited:
                formatted += f"   📅 Last edited: {last_edited}\n"

            formatted += "\n"

        return formatted.strip()
