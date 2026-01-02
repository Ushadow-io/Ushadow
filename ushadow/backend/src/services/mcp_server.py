"""
MCP Server for ushadow service orchestration and Chronicle integration.

This module implements an MCP (Model Context Protocol) server that provides
service management tools for LLMs to retrieve service data, manage deployments,
query provider capabilities, and access Chronicle conversations.

Key features:
- List services with status and health information
- Query providers and capabilities
- Get service logs and configuration
- Manage service state (start/stop/restart)
- List and retrieve Chronicle conversations
- Search memories and get conversation segments
"""

import contextvars
import json
import logging
import os
from typing import Optional

import httpx
from fastapi import FastAPI, Request
from fastapi.routing import APIRouter
from mcp.server.fastmcp import FastMCP
from mcp.server.sse import SseServerTransport

from src.services.service_orchestrator import get_service_orchestrator
from src.services.provider_registry import get_provider_registry

# Chronicle API configuration
CHRONICLE_URL = os.environ.get("CHRONICLE_URL", "http://chronicle-backend:8000")
CHRONICLE_API_TIMEOUT = 30

logger = logging.getLogger(__name__)

# Initialize MCP
mcp = FastMCP("ushadow-orchestrator")

# Context variables for user authentication
user_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("user_id")

# Create a router for MCP endpoints
mcp_router = APIRouter(prefix="/mcp")

# Initialize SSE transport
sse = SseServerTransport("/mcp/messages/")


# =============================================================================
# MCP Tools - Service Management
# =============================================================================

@mcp.tool(description="List all installed services with their current status. Returns service name, status (running/stopped/not_started), health, and enabled state.")
async def list_services() -> str:
    """
    List all installed services.

    Returns:
        JSON string with list of services and their status
    """
    try:
        orchestrator = await get_service_orchestrator()
        services = await orchestrator.list_installed_services()

        result = {
            "services": services,
            "count": len(services)
        }

        return json.dumps(result, indent=2)

    except Exception as e:
        logger.exception(f"Error listing services: {e}")
        return json.dumps({"error": f"Failed to list services: {str(e)}"}, indent=2)


@mcp.tool(description="Get status overview for all services. Returns a lightweight map of service_id -> {name, status, health} for polling.")
async def get_all_service_statuses() -> str:
    """
    Get status for all services (optimized for polling).

    Returns:
        JSON string with status map
    """
    try:
        orchestrator = await get_service_orchestrator()
        statuses = await orchestrator.get_all_statuses()

        return json.dumps(statuses, indent=2)

    except Exception as e:
        logger.exception(f"Error getting service statuses: {e}")
        return json.dumps({"error": f"Failed to get statuses: {str(e)}"}, indent=2)


@mcp.tool(description="Get detailed information about a specific service including configuration, docker status, and capabilities.")
async def get_service(service_id: str) -> str:
    """
    Get detailed service information.

    Args:
        service_id: The service identifier (e.g., "chronicle", "openwebui")

    Returns:
        JSON string with complete service details
    """
    try:
        orchestrator = await get_service_orchestrator()
        service = await orchestrator.get_service(service_id)

        if not service:
            return json.dumps({"error": f"Service '{service_id}' not found"}, indent=2)

        return json.dumps(service, indent=2)

    except Exception as e:
        logger.exception(f"Error getting service {service_id}: {e}")
        return json.dumps({"error": f"Failed to get service: {str(e)}"}, indent=2)


@mcp.tool(description="Get Docker container details for a service including ports, environment, mounts, and resource usage.")
async def get_docker_details(service_id: str) -> str:
    """
    Get Docker container details for a service.

    Args:
        service_id: The service identifier

    Returns:
        JSON string with Docker container details
    """
    try:
        orchestrator = await get_service_orchestrator()
        details = await orchestrator.get_docker_details(service_id)

        if not details:
            return json.dumps({"error": f"No Docker details for service '{service_id}'"}, indent=2)

        return json.dumps(details.to_dict(), indent=2)

    except Exception as e:
        logger.exception(f"Error getting Docker details for {service_id}: {e}")
        return json.dumps({"error": f"Failed to get Docker details: {str(e)}"}, indent=2)


@mcp.tool(description="Get recent logs from a service container. Returns the last N lines of logs.")
async def get_service_logs(service_id: str, lines: int = 100) -> str:
    """
    Get service container logs.

    Args:
        service_id: The service identifier
        lines: Number of log lines to retrieve (default: 100, max: 1000)

    Returns:
        JSON string with log content and metadata
    """
    try:
        lines = min(max(1, lines), 1000)

        orchestrator = await get_service_orchestrator()
        log_result = await orchestrator.get_service_logs(service_id, tail=lines)

        if not log_result:
            return json.dumps({"error": f"No logs available for service '{service_id}'"}, indent=2)

        return json.dumps(log_result.to_dict(), indent=2)

    except Exception as e:
        logger.exception(f"Error getting logs for {service_id}: {e}")
        return json.dumps({"error": f"Failed to get logs: {str(e)}"}, indent=2)


@mcp.tool(description="Start a stopped service container.")
async def start_service(service_id: str) -> str:
    """
    Start a service.

    Args:
        service_id: The service identifier

    Returns:
        JSON string with action result
    """
    try:
        orchestrator = await get_service_orchestrator()
        result = await orchestrator.start_service(service_id)

        return json.dumps(result.to_dict(), indent=2)

    except Exception as e:
        logger.exception(f"Error starting service {service_id}: {e}")
        return json.dumps({"error": f"Failed to start service: {str(e)}"}, indent=2)


@mcp.tool(description="Stop a running service container.")
async def stop_service(service_id: str) -> str:
    """
    Stop a service.

    Args:
        service_id: The service identifier

    Returns:
        JSON string with action result
    """
    try:
        orchestrator = await get_service_orchestrator()
        result = await orchestrator.stop_service(service_id)

        return json.dumps(result.to_dict(), indent=2)

    except Exception as e:
        logger.exception(f"Error stopping service {service_id}: {e}")
        return json.dumps({"error": f"Failed to stop service: {str(e)}"}, indent=2)


@mcp.tool(description="Restart a service container.")
async def restart_service(service_id: str) -> str:
    """
    Restart a service.

    Args:
        service_id: The service identifier

    Returns:
        JSON string with action result
    """
    try:
        orchestrator = await get_service_orchestrator()
        result = await orchestrator.restart_service(service_id)

        return json.dumps(result.to_dict(), indent=2)

    except Exception as e:
        logger.exception(f"Error restarting service {service_id}: {e}")
        return json.dumps({"error": f"Failed to restart service: {str(e)}"}, indent=2)


# =============================================================================
# MCP Tools - Provider & Capability Management
# =============================================================================

@mcp.tool(description="List all available capabilities in the system (e.g., llm, memory, transcription).")
async def list_capabilities() -> str:
    """
    List all available capabilities.

    Returns:
        JSON string with capability definitions
    """
    try:
        registry = get_provider_registry()
        capabilities = registry.get_capabilities()

        # Convert to serializable format
        caps_list = []
        for cap in capabilities:
            caps_list.append({
                "id": cap.id,
                "name": cap.name,
                "description": cap.description,
                "fields": [
                    {"name": f.name, "type": f.type, "required": f.required}
                    for f in cap.fields
                ]
            })

        return json.dumps({"capabilities": caps_list, "count": len(caps_list)}, indent=2)

    except Exception as e:
        logger.exception(f"Error listing capabilities: {e}")
        return json.dumps({"error": f"Failed to list capabilities: {str(e)}"}, indent=2)


@mcp.tool(description="List all providers across all capabilities.")
async def list_providers() -> str:
    """
    List all available providers.

    Returns:
        JSON string with all providers
    """
    try:
        registry = get_provider_registry()
        providers = registry.get_providers()

        # Convert to serializable format
        providers_list = []
        for p in providers:
            providers_list.append({
                "id": p.id,
                "name": p.name,
                "capability": p.capability,
                "mode": p.mode,
                "description": getattr(p, 'description', None),
            })

        return json.dumps({"providers": providers_list, "count": len(providers_list)}, indent=2)

    except Exception as e:
        logger.exception(f"Error listing providers: {e}")
        return json.dumps({"error": f"Failed to list providers: {str(e)}"}, indent=2)


@mcp.tool(description="Get providers for a specific capability (e.g., 'llm' returns openai, anthropic, ollama).")
async def get_providers_for_capability(capability_id: str) -> str:
    """
    Get providers that implement a capability.

    Args:
        capability_id: The capability identifier (e.g., "llm", "memory", "transcription")

    Returns:
        JSON string with matching providers
    """
    try:
        registry = get_provider_registry()
        providers = registry.get_providers_for_capability(capability_id)

        providers_list = []
        for p in providers:
            providers_list.append({
                "id": p.id,
                "name": p.name,
                "capability": p.capability,
                "mode": p.mode,
                "description": getattr(p, 'description', None),
            })

        return json.dumps({
            "capability": capability_id,
            "providers": providers_list,
            "count": len(providers_list)
        }, indent=2)

    except Exception as e:
        logger.exception(f"Error getting providers for {capability_id}: {e}")
        return json.dumps({"error": f"Failed to get providers: {str(e)}"}, indent=2)


@mcp.tool(description="Get details about a specific provider including its configuration fields.")
async def get_provider(provider_id: str) -> str:
    """
    Get provider details.

    Args:
        provider_id: The provider identifier (e.g., "openai", "ollama")

    Returns:
        JSON string with provider details
    """
    try:
        registry = get_provider_registry()
        provider = registry.get_provider(provider_id)

        if not provider:
            return json.dumps({"error": f"Provider '{provider_id}' not found"}, indent=2)

        result = {
            "id": provider.id,
            "name": provider.name,
            "capability": provider.capability,
            "mode": provider.mode,
            "description": getattr(provider, 'description', None),
            "fields": [
                {
                    "name": f.name,
                    "type": f.type,
                    "required": f.required,
                    "default": getattr(f, 'default', None),
                    "description": getattr(f, 'description', None)
                }
                for f in getattr(provider, 'fields', [])
            ]
        }

        return json.dumps(result, indent=2)

    except Exception as e:
        logger.exception(f"Error getting provider {provider_id}: {e}")
        return json.dumps({"error": f"Failed to get provider: {str(e)}"}, indent=2)


@mcp.tool(description="Find services that require a specific capability.")
async def get_services_by_capability(capability_id: str) -> str:
    """
    Find services that use a capability.

    Args:
        capability_id: The capability identifier

    Returns:
        JSON string with matching services
    """
    try:
        orchestrator = await get_service_orchestrator()
        services = await orchestrator.get_services_by_capability(capability_id)

        return json.dumps({
            "capability": capability_id,
            "services": services,
            "count": len(services)
        }, indent=2)

    except Exception as e:
        logger.exception(f"Error finding services for capability {capability_id}: {e}")
        return json.dumps({"error": f"Failed to find services: {str(e)}"}, indent=2)


# =============================================================================
# MCP Tools - Chronicle Conversations
# =============================================================================

@mcp.tool(description="List conversations from Chronicle. Returns conversation_id, title, summary, start_datetime, segment_count, and memory_count with pagination support.")
async def list_conversations(
    limit: int = 20,
    offset: int = 0,
    order_by: str = "created_at_desc"
) -> str:
    """
    List conversations from Chronicle.

    Args:
        limit: Maximum number of conversations to return (default: 20, max: 100)
        offset: Number of conversations to skip for pagination (default: 0)
        order_by: Sort order - "created_at_desc" (newest first) or "created_at_asc" (oldest first)

    Returns:
        JSON string with list of conversations and pagination info
    """
    try:
        limit = min(max(1, limit), 100)
        offset = max(0, offset)

        async with httpx.AsyncClient(timeout=CHRONICLE_API_TIMEOUT) as client:
            response = await client.get(
                f"{CHRONICLE_URL}/api/conversations",
                params={"limit": limit, "offset": offset, "order_by": order_by}
            )
            response.raise_for_status()
            data = response.json()

            # Wrap in standard format if needed
            if isinstance(data, list):
                return json.dumps({
                    "conversations": data,
                    "pagination": {
                        "limit": limit,
                        "offset": offset,
                        "returned": len(data)
                    }
                }, indent=2)
            return json.dumps(data, indent=2)

    except httpx.TimeoutException:
        return json.dumps({"error": "Chronicle request timed out"}, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Chronicle API error: {e.response.status_code}"}, indent=2)
    except Exception as e:
        logger.exception(f"Error listing conversations: {e}")
        return json.dumps({"error": f"Failed to list conversations: {str(e)}"}, indent=2)


@mcp.tool(description="Get detailed information about a specific conversation including full transcript, speaker segments, memories, and metadata.")
async def get_conversation(conversation_id: str) -> str:
    """
    Get detailed conversation data from Chronicle.

    Args:
        conversation_id: The unique conversation identifier

    Returns:
        JSON string with complete conversation details
    """
    try:
        async with httpx.AsyncClient(timeout=CHRONICLE_API_TIMEOUT) as client:
            response = await client.get(
                f"{CHRONICLE_URL}/api/conversations/{conversation_id}"
            )
            response.raise_for_status()
            return json.dumps(response.json(), indent=2)

    except httpx.TimeoutException:
        return json.dumps({"error": "Chronicle request timed out"}, indent=2)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return json.dumps({"error": f"Conversation '{conversation_id}' not found"}, indent=2)
        return json.dumps({"error": f"Chronicle API error: {e.response.status_code}"}, indent=2)
    except Exception as e:
        logger.exception(f"Error getting conversation {conversation_id}: {e}")
        return json.dumps({"error": f"Failed to get conversation: {str(e)}"}, indent=2)


@mcp.tool(description="Get speaker segments from a conversation. Returns detailed timing and speaker information for each segment of the transcript.")
async def get_segments_from_conversation(conversation_id: str) -> str:
    """
    Get speaker segments from a conversation.

    Args:
        conversation_id: The unique conversation identifier

    Returns:
        JSON string with speaker segments including timing and text
    """
    try:
        async with httpx.AsyncClient(timeout=CHRONICLE_API_TIMEOUT) as client:
            response = await client.get(
                f"{CHRONICLE_URL}/api/conversations/{conversation_id}/segments"
            )
            response.raise_for_status()
            segments = response.json()

            return json.dumps({
                "conversation_id": conversation_id,
                "segments": segments,
                "segment_count": len(segments) if isinstance(segments, list) else 0
            }, indent=2)

    except httpx.TimeoutException:
        return json.dumps({"error": "Chronicle request timed out"}, indent=2)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return json.dumps({"error": f"Conversation '{conversation_id}' not found"}, indent=2)
        return json.dumps({"error": f"Chronicle API error: {e.response.status_code}"}, indent=2)
    except Exception as e:
        logger.exception(f"Error getting segments for {conversation_id}: {e}")
        return json.dumps({"error": f"Failed to get segments: {str(e)}"}, indent=2)


@mcp.tool(description="Search memories in Chronicle using semantic similarity. Returns relevant memories with their content and metadata.")
async def search_memories(query: str, limit: int = 10) -> str:
    """
    Search memories in Chronicle.

    Args:
        query: Search query text
        limit: Maximum number of results (default: 10, max: 50)

    Returns:
        JSON string with matching memories
    """
    try:
        limit = min(max(1, limit), 50)

        async with httpx.AsyncClient(timeout=CHRONICLE_API_TIMEOUT) as client:
            response = await client.get(
                f"{CHRONICLE_URL}/api/memories/search",
                params={"query": query, "limit": limit}
            )
            response.raise_for_status()
            memories = response.json()

            return json.dumps({
                "query": query,
                "memories": memories,
                "count": len(memories) if isinstance(memories, list) else 0
            }, indent=2)

    except httpx.TimeoutException:
        return json.dumps({"error": "Chronicle request timed out"}, indent=2)
    except httpx.HTTPStatusError as e:
        return json.dumps({"error": f"Chronicle API error: {e.response.status_code}"}, indent=2)
    except Exception as e:
        logger.exception(f"Error searching memories: {e}")
        return json.dumps({"error": f"Failed to search memories: {str(e)}"}, indent=2)


# =============================================================================
# FastAPI Router Endpoints
# =============================================================================

@mcp_router.get("/sse")
async def handle_sse(request: Request):
    """
    Handle SSE connections for MCP.

    The access token should be provided in the Authorization header:
        Authorization: Bearer <token>

    For development, any token is accepted.
    """
    from fastapi.responses import JSONResponse

    # Extract access token from Authorization header
    auth_header = request.headers.get("authorization")
    if not auth_header:
        logger.error("No Authorization header provided")
        return JSONResponse(
            status_code=401,
            content={"error": "Authorization header required. Use: Authorization: Bearer <token>"}
        )

    # Parse Bearer token
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        logger.error(f"Invalid Authorization header format: {auth_header}")
        return JSONResponse(
            status_code=401,
            content={"error": "Invalid Authorization header. Use format: Authorization: Bearer <token>"}
        )

    access_token = parts[1]
    if not access_token:
        logger.error("Empty access token")
        return JSONResponse(
            status_code=401,
            content={"error": "Access token cannot be empty"}
        )

    # For development, accept any token
    logger.info(f"MCP connection established with token: {access_token[:min(8, len(access_token))]}...")
    user_token = user_id_var.set("authenticated")

    try:
        # Handle SSE connection
        async with sse.connect_sse(
            request.scope,
            request.receive,
            request._send,
        ) as (read_stream, write_stream):
            await mcp._mcp_server.run(
                read_stream,
                write_stream,
                mcp._mcp_server.create_initialization_options(),
            )
    finally:
        user_id_var.reset(user_token)


@mcp_router.post("/messages/")
async def handle_post_message(request: Request):
    """Handle POST messages for SSE"""
    try:
        body = await request.body()

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        async def send(message):
            return {}

        await sse.handle_post_message(request.scope, receive, send)

        return {"status": "ok"}
    except Exception as e:
        logger.exception(f"Error handling MCP message: {e}")
        return {"status": "error", "message": str(e)}


def setup_mcp_server(app: FastAPI):
    """Setup MCP server with the FastAPI application."""
    mcp._mcp_server.name = "ushadow-orchestrator"

    # Include MCP router in the FastAPI app
    app.include_router(mcp_router)

    logger.info("ushadow MCP server initialized with orchestration tools")
