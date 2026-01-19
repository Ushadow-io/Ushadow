"""
MCP Memory Source - Exposes MCP server tools as LLM-callable memory sources.

Provides direct access to MCP servers (Notion, GitHub, etc.) for LLM tool calling
without requiring a full integration instance.

Uses official MCP Python SDK with SSE or HTTP transports.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from ..base import MemorySource, MemorySourceConfig, MemorySourceResult
from src.config.omegaconf_settings import get_settings_store
from src.services.mcp_client import get_mcp_client_manager

logger = logging.getLogger(__name__)


class MCPSource(MemorySource):
    """
    Memory source that queries an MCP server.

    Wraps MCP server tools to make them available as LLM-callable functions.
    Supports both search/query operations and direct tool calls.
    """

    def __init__(self, config: MemorySourceConfig):
        super().__init__(config)

        # Extract MCP configuration from metadata
        adapter_config = config.metadata.get("adapter_config", {})
        self.mcp_url = adapter_config.get("mcp_url")
        self.transport = adapter_config.get("transport", "http")
        self.auth_config = adapter_config.get("auth", {})
        self.tools = adapter_config.get("tools", [])

        if not self.mcp_url:
            raise ValueError(f"MCP source {config.source_id} missing 'adapter_config.mcp_url'")

        # Determine primary search tool
        self.primary_tool = self._get_primary_tool_name()

        tool_name = self.primary_tool if isinstance(self.primary_tool, str) else self.primary_tool.get("name", "unknown")
        logger.info(
            f"Initialized MCP source {config.source_id} → {self.mcp_url} "
            f"(primary tool: {tool_name})"
        )

    def _get_primary_tool_name(self) -> str:
        """
        Get the primary search/query tool name.

        Looks for tools with 'search' or 'query' in the name.
        Falls back to the first tool if none found.
        """
        if not self.tools:
            return f"search_{self.config.source_id}"

        logger.debug(f"Looking for primary tool in: {self.tools}")

        # Look for search/query tools
        for tool in self.tools:
            logger.debug(f"Checking tool: {tool}, type: {type(tool)}")
            # Extract name from dict or use as string
            if isinstance(tool, dict):
                tool_name = tool.get("name", "")
                logger.debug(f"Extracted tool_name: '{tool_name}'")
                if "search" in tool_name.lower() or "query" in tool_name.lower():
                    logger.debug(f"Found search/query tool: {tool_name}")
                    return tool_name
            elif isinstance(tool, str):
                if "search" in tool.lower() or "query" in tool.lower():
                    logger.debug(f"Found search/query tool (string): {tool}")
                    return tool

        # Use first tool as fallback
        logger.debug("No search/query tool found, using first tool as fallback")
        first_tool = self.tools[0]
        if isinstance(first_tool, dict):
            result = first_tool.get("name", f"search_{self.config.source_id}")
            logger.debug(f"Fallback (dict): {result}")
            return result
        else:
            result = str(first_tool)
            logger.debug(f"Fallback (str): {result}")
            return result

    async def query(self, query: str, **kwargs) -> List[MemorySourceResult]:
        """
        Query the MCP server using the primary search tool.

        Args:
            query: Search query string
            **kwargs: Additional parameters (limit, filters, etc.)

        Returns:
            List of results from the MCP server
        """
        try:
            # Call the primary search tool
            result = await self._call_mcp_tool(
                tool_name=self.primary_tool,
                arguments={"query": query, **kwargs}
            )

            # Parse and format results
            return self._parse_mcp_response(result)

        except Exception as e:
            logger.error(f"Error querying MCP source {self.config.source_id}: {e}")
            return []

    def get_tool_definition(self) -> Dict[str, Any]:
        """
        Generate LLM tool definition for this MCP source.

        Exposes the primary search tool to the LLM.
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
                            "description": "Search query or keywords",
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

    async def execute_tool_call(
        self, tool_call_id: str, arguments: Dict[str, Any]
    ) -> str:
        """
        Execute an MCP tool call from the LLM.

        Routes the tool call to the MCP server and formats the response.
        """
        query = arguments.get("query", "")
        if not query:
            return f"Error: No query provided for {self.config.name}"

        try:
            # Remove 'query' from kwargs to avoid duplicate argument error
            kwargs = {k: v for k, v in arguments.items() if k != "query"}
            results = await self.query(query, **kwargs)
            return self._format_results(results)
        except Exception as e:
            logger.error(f"MCP tool call failed: {e}")
            return f"Error querying {self.config.name}: {str(e)}"

    async def _call_mcp_tool(
        self, tool_name: str, arguments: Dict[str, Any]
    ) -> Any:
        """
        Call an MCP tool using the official MCP SDK.

        Args:
            tool_name: MCP tool to call
            arguments: Tool arguments

        Returns:
            Tool result (parsed content)
        """
        logger.debug(
            f"Calling MCP tool {tool_name} at {self.mcp_url} with args: {arguments}"
        )

        try:
            # Get auth token from settings
            auth_token = await self._get_auth_token()

            # Get MCP session via client manager
            manager = get_mcp_client_manager()
            async with manager.get_session(
                server_id=f"mcp_{self.config.source_id}",
                server_url=self.mcp_url,
                auth_token=auth_token,
                transport=self.transport
            ) as session:
                # Call tool using MCP SDK
                result = await session.call_tool(
                    name=tool_name,
                    arguments=arguments or {}
                )

                # Extract content from MCP result
                if hasattr(result, 'content') and result.content:
                    # Result has content array
                    first_content = result.content[0]
                    if hasattr(first_content, 'text'):
                        # Text content - try to parse as JSON
                        text = first_content.text
                        try:
                            return json.loads(text)
                        except json.JSONDecodeError:
                            return text
                    else:
                        return first_content

                # Return raw result if no content
                return result

        except Exception as e:
            logger.error(f"Error calling MCP tool {tool_name}: {e}", exc_info=True)
            raise

    async def _get_auth_token(self) -> Optional[str]:
        """
        Get authentication token from settings.

        Returns:
            Bearer token string or None
        """
        if self.auth_config:
            auth_type = self.auth_config.get("type")
            if auth_type == "bearer":
                # Get token from settings
                token_setting = self.auth_config.get("token_setting")
                if token_setting:
                    try:
                        settings = get_settings_store()
                        token = await settings.get(token_setting)
                        if token:
                            logger.debug(f"Retrieved bearer token from {token_setting}")
                            return str(token)
                    except Exception as e:
                        logger.warning(f"Failed to resolve auth token from {token_setting}: {e}")

        return None

    def _parse_mcp_response(self, result: Any) -> List[MemorySourceResult]:
        """
        Parse MCP tool response into MemorySourceResult objects.

        Args:
            result: Raw MCP tool result

        Returns:
            List of formatted results
        """
        results = []

        try:
            # Handle different response formats
            if isinstance(result, str):
                # Single text result
                results.append(
                    MemorySourceResult(
                        content=result,
                        source_id=self.config.source_id,
                        source_name=self.config.name,
                        metadata={},
                        references=[],
                    )
                )
            elif isinstance(result, dict):
                # Check for common result array keys
                items = (
                    result.get("results")
                    or result.get("pages")
                    or result.get("data")
                    or result.get("items")
                    or [result]  # Single result
                )

                for item in items if isinstance(items, list) else [items]:
                    # Extract content from item
                    content = (
                        item.get("content")
                        or item.get("text")
                        or item.get("title")
                        or json.dumps(item, indent=2)
                    )

                    results.append(
                        MemorySourceResult(
                            content=content,
                            source_id=self.config.source_id,
                            source_name=self.config.name,
                            metadata=item if isinstance(item, dict) else {},
                            references=[item.get("url")] if item.get("url") else [],
                        )
                    )
            else:
                # Unknown format, convert to string
                results.append(
                    MemorySourceResult(
                        content=str(result),
                        source_id=self.config.source_id,
                        source_name=self.config.name,
                        metadata={},
                        references=[],
                    )
                )

        except Exception as e:
            logger.error(f"Error parsing MCP response: {e}")

        return results
