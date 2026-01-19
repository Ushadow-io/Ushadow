"""
MCP Client Manager - Shared session management for MCP servers.

Provides reusable MCP client sessions for both:
1. LLM tool calling (via MCPSource)
2. Sync operations (via MCPAdapter)

Uses official MCP Python SDK with SSE and HTTP transports.
"""

import logging
from typing import Dict, Literal, Optional
from contextlib import asynccontextmanager

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamablehttp_client

logger = logging.getLogger(__name__)

TransportType = Literal["sse", "http"]


class MCPClientManager:
    """
    Manages MCP client sessions with connection pooling.

    Maintains persistent sessions to MCP servers
    to avoid repeated initialization overhead.
    """

    def __init__(self):
        self._sessions: Dict[str, ClientSession] = {}
        self._initialized: Dict[str, bool] = {}

    @asynccontextmanager
    async def get_session(
        self,
        server_id: str,
        server_url: str,
        auth_token: Optional[str] = None,
        transport: TransportType = "sse"
    ):
        """
        Get or create an MCP client session.

        Args:
            server_id: Unique identifier for the server
            server_url: MCP endpoint URL
            auth_token: Optional bearer token for authentication
            transport: Transport type - "sse" or "http"

        Yields:
            ClientSession for making MCP tool calls

        Example:
            async with manager.get_session("notion", url, transport="http") as session:
                tools = await session.list_tools()
                result = await session.call_tool("API-post-search", {"query": "test"})
        """
        session_key = f"{server_id}:{server_url}"

        # Create new session if needed
        if session_key not in self._sessions:
            logger.info(f"Creating new MCP session for {server_id} at {server_url} (transport={transport})")

            # Build headers
            headers = {"Content-Type": "application/json"}
            if auth_token:
                headers["Authorization"] = f"Bearer {auth_token}"

            # Select transport based on config
            if transport == "http":
                # Streamable HTTP transport
                async with streamablehttp_client(server_url, headers=headers) as (read, write, _):
                    session = ClientSession(read, write)
                    await session.initialize()
                    logger.info(f"Initialized MCP session for {server_id} (HTTP)")

                    self._sessions[session_key] = session
                    self._initialized[session_key] = True

                    try:
                        yield session
                    finally:
                        pass
            else:
                # SSE transport (default)
                async with sse_client(server_url, headers=headers) as (read, write):
                    session = ClientSession(read, write)
                    await session.initialize()
                    logger.info(f"Initialized MCP session for {server_id} (SSE)")

                    self._sessions[session_key] = session
                    self._initialized[session_key] = True

                    try:
                        yield session
                    finally:
                        pass
        else:
            # Reuse existing session
            logger.debug(f"Reusing existing MCP session for {server_id}")
            yield self._sessions[session_key]

    async def close_session(self, server_id: str, server_url: str):
        """Close and remove a session."""
        session_key = f"{server_id}:{server_url}"
        if session_key in self._sessions:
            del self._sessions[session_key]
            del self._initialized[session_key]
            logger.info(f"Closed MCP session for {server_id}")

    async def close_all(self):
        """Close all sessions."""
        for session_key in list(self._sessions.keys()):
            parts = session_key.split(":", 1)
            if len(parts) == 2:
                await self.close_session(parts[0], parts[1])
        logger.info("Closed all MCP sessions")


# Global singleton instance
_mcp_client_manager: Optional[MCPClientManager] = None


def get_mcp_client_manager() -> MCPClientManager:
    """Get the global MCP client manager singleton."""
    global _mcp_client_manager
    if _mcp_client_manager is None:
        _mcp_client_manager = MCPClientManager()
    return _mcp_client_manager
