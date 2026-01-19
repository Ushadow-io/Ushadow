"""
MCP Adapter - Integrates Model Context Protocol servers as memory sources.

Handles both:
1. Sync operations: Query MCP server for pages/data → Push to OpenMemory
2. Tool calling: Route LLM tool calls to MCP server tools
"""

import json
import logging
from typing import Any, Dict, List, Optional
import httpx

from src.models.memory import MemoryCreate
from src.models.integration import IntegrationConfig
from .base import MemoryAdapter

logger = logging.getLogger(__name__)


class MCPAdapter(MemoryAdapter):
    """
    Adapter for Model Context Protocol servers (Notion, etc.).

    Supports two modes:
    1. Sync Mode: Fetch all items from MCP server → Transform → Store in OpenMemory
    2. Tool Call Mode: Execute specific MCP tools on-demand (for LLM function calling)
    """

    def __init__(self, config: IntegrationConfig, settings: Dict[str, Any]):
        super().__init__(config, settings)

        # MCP server configuration
        self.mcp_url = settings.get("mcp_config", {}).get("url")
        self.transport = settings.get("mcp_config", {}).get("transport", "sse")
        self.tools = settings.get("mcp_config", {}).get("tools", [])

        if not self.mcp_url:
            raise ValueError(f"MCP adapter requires 'mcp_url' in settings for {config.integration_id}")

        # Credentials
        self.api_token = settings.get("api_token")

        logger.info(f"Initialized MCP adapter for {config.integration_id} ({self.mcp_url})")

    async def test_connection(self) -> bool:
        """
        Test connection to MCP server.

        Returns:
            True if MCP server is reachable and responding
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Try health endpoint or simple tool list
                response = await client.get(
                    f"{self.mcp_url}/health",
                    headers=self._get_headers()
                )
                return response.status_code == 200
        except Exception as e:
            logger.error(f"MCP connection test failed: {e}")
            return False

    async def fetch_items(self) -> List[MemoryCreate]:
        """
        Sync operation: Fetch all items from MCP server for initial sync.

        For Notion:
        - Call search_notion() to get all pages
        - Transform each page to MemoryCreate
        - Return list for bulk storage in OpenMemory

        Returns:
            List of MemoryCreate objects ready for OpenMemory
        """
        logger.info(f"Fetching items from MCP adapter: {self.config.integration_id}")

        try:
            # For Notion: search with empty query returns all pages
            # Each MCP server might have different "list all" strategies
            search_tool = self._get_list_tool_name()

            if not search_tool:
                logger.warning(f"No list/search tool defined for {self.config.integration_id}")
                return []

            # Call MCP tool to search/list all items
            result_json = await self._call_mcp_tool(
                tool_name=search_tool,
                arguments={"query": ""}  # Empty query = list all
            )

            # Parse MCP response
            if isinstance(result_json, str):
                result_json = json.loads(result_json)

            # Extract pages/items from response
            # Format depends on MCP server implementation
            items = result_json.get("results", [])
            if not items:
                # Try alternate keys
                items = result_json.get("pages", [])
                if not items:
                    items = result_json.get("data", [])

            # Transform each item to MemoryCreate
            memory_items = []
            for item in items:
                try:
                    memory_item = self._transform_mcp_item(item)
                    memory_items.append(memory_item)
                except Exception as e:
                    logger.warning(f"Failed to transform item: {e}")
                    continue

            logger.info(f"Fetched {len(memory_items)} items from {self.config.integration_id}")
            return memory_items

        except Exception as e:
            logger.error(f"Error fetching items from MCP: {e}", exc_info=True)
            return []

    def _get_list_tool_name(self) -> Optional[str]:
        """
        Get the tool name for listing/searching all items.

        Different MCP servers use different conventions:
        - Notion: search_notion
        - GitHub: list_repositories
        - etc.
        """
        # Check if explicitly configured
        for tool in self.tools:
            tool_name = tool.get("name") if isinstance(tool, dict) else tool
            if "search" in tool_name.lower() or "list" in tool_name.lower():
                return tool_name

        # Default fallback
        return f"search_{self.config.integration_id}"

    async def fetch_item(self, item_id: str) -> Optional[MemoryCreate]:
        """
        Fetch a single item by ID.

        Args:
            item_id: The Notion page ID or similar identifier

        Returns:
            MemoryCreate object or None if not found
        """
        # Similar implementation choice as fetch_items()
        raise NotImplementedError("TODO: Implement fetch_item() for single page retrieval")

    async def execute_tool_call(self, tool_name: str, arguments: Dict[str, Any]) -> str:
        """
        Execute an MCP tool call (for LLM function calling).

        This is called when the LLM wants to query Notion directly
        during a conversation (e.g., "get_page", "query_database").

        Args:
            tool_name: Name of the MCP tool (e.g., "query_database")
            arguments: Tool arguments from LLM

        Returns:
            Formatted result string for LLM
        """
        logger.info(f"Executing MCP tool: {tool_name} with args: {arguments}")

        try:
            result = await self._call_mcp_tool(tool_name, arguments)

            # Format result for LLM consumption
            if isinstance(result, dict):
                return json.dumps(result, indent=2)
            elif isinstance(result, str):
                return result
            else:
                return json.dumps({"result": result}, indent=2)

        except Exception as e:
            logger.error(f"MCP tool call failed: {tool_name} - {e}")
            return f"Error executing {tool_name}: {str(e)}"

    async def _call_mcp_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """
        Call an MCP tool via MetaMCP HTTP endpoint.

        Uses JSON-RPC 2.0 protocol over HTTP (Streamable HTTP transport).
        MetaMCP aggregates all MCP servers and routes tool calls appropriately.

        Args:
            tool_name: The tool to call (e.g., "search_notion", "query_database")
            arguments: Tool arguments as dict

        Returns:
            Tool result (dict or string)

        Raises:
            httpx.HTTPError: If MCP server is unreachable
            ValueError: If tool call fails or returns error
        """
        # Build JSON-RPC 2.0 request
        # See: https://modelcontextprotocol.io/docs/learn/architecture
        request_payload = {
            "jsonrpc": "2.0",
            "id": 1,  # Request ID for correlation
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments or {}
            }
        }

        logger.debug(f"Calling MCP tool via MetaMCP: {tool_name} with args: {arguments}")

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.mcp_url,
                    json=request_payload,
                    headers=self._get_headers()
                )
                response.raise_for_status()

                # Parse JSON-RPC 2.0 response
                result_data = response.json()

                # Check for JSON-RPC error
                if "error" in result_data:
                    error = result_data["error"]
                    raise ValueError(
                        f"MCP tool call failed: {error.get('message', 'Unknown error')} "
                        f"(code: {error.get('code', 'N/A')})"
                    )

                # Extract result content
                # Result format: {"jsonrpc": "2.0", "id": 1, "result": {"content": [...]}}
                result = result_data.get("result", {})
                content = result.get("content", [])

                # Extract text from content array
                if content and len(content) > 0:
                    # Return first text content item
                    first_item = content[0]
                    if first_item.get("type") == "text":
                        text = first_item.get("text", "")
                        # Try to parse as JSON, otherwise return as string
                        try:
                            return json.loads(text)
                        except json.JSONDecodeError:
                            return text
                    else:
                        # Non-text content, return as-is
                        return first_item

                # No content in response
                return result

        except httpx.HTTPError as e:
            logger.error(f"HTTP error calling MCP tool {tool_name}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error calling MCP tool {tool_name}: {e}", exc_info=True)
            raise ValueError(f"Failed to call MCP tool {tool_name}: {str(e)}")

    def _get_headers(self) -> Dict[str, str]:
        """Build HTTP headers for MCP requests."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json,text/event-stream",  # Required for Streamable HTTP (SSE) transport
        }

        if self.api_token:
            headers["Authorization"] = f"Bearer {self.api_token}"

        return headers

    def _transform_mcp_item(self, item: Dict[str, Any]) -> MemoryCreate:
        """
        Transform MCP server response item to MemoryCreate.

        Uses field_mappings from integration config to map
        Notion fields → OpenMemory format.

        Args:
            item: Raw item from MCP server (e.g., Notion page object)

        Returns:
            MemoryCreate ready for OpenMemory storage
        """
        # Use parent class field mapping logic
        return self._apply_field_mappings(item)
