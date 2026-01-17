"""
Unified Services API - Single entry point for all service operations.

This router consolidates:
- Service discovery (from compose files)
- Docker container lifecycle (start/stop/restart)
- Configuration management (env vars, enabled state)
- Installation management

All operations go through the ServiceOrchestrator facade.

Endpoint Groups:
- Discovery:    GET /, /catalog, /by-capability/{cap}
- Status:       GET /docker-status, /status (BEFORE /{name} to avoid shadowing)
- Single:       GET /{name}, /{name}/status, /{name}/docker
- Lifecycle:    POST /{name}/start, /stop, /restart; GET /{name}/logs
- Config:       GET/PUT /{name}/enabled, /{name}/config, /{name}/env, /{name}/resolve
- Installation: POST /{name}/install, /uninstall, /register
"""

import logging
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

from src.services.service_orchestrator import get_service_orchestrator, ServiceOrchestrator
from src.services.auth import get_current_user
from src.models.user import User
from src.services.docker_manager import ServiceType, IntegrationType

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================

class EnabledRequest(BaseModel):
    """Request to enable/disable a service."""
    enabled: bool


class EnvVarConfigRequest(BaseModel):
    """Request to configure an environment variable."""
    name: str
    source: str  # "setting", "new_setting", "literal", "default"
    setting_path: Optional[str] = None
    new_setting_path: Optional[str] = None
    value: Optional[str] = None


class EnvConfigUpdateRequest(BaseModel):
    """Request to update all env var configs for a service."""
    env_vars: List[EnvVarConfigRequest]


class ServiceEndpointRequest(BaseModel):
    """Service endpoint information."""
    url: str
    integration_type: str = "rest"
    health_check_path: Optional[str] = None
    requires_auth: bool = False
    auth_type: Optional[str] = None


class RegisterServiceRequest(BaseModel):
    """Request to register a dynamic service."""
    service_name: str = Field(..., description="Unique service name")
    description: str = ""
    service_type: str = "application"
    endpoints: List[ServiceEndpointRequest] = []
    user_controllable: bool = True
    compose_file: Optional[str] = None
    metadata: Optional[dict] = None


class ActionResponse(BaseModel):
    """Standard action response."""
    success: bool
    message: str


class LogsResponse(BaseModel):
    """Service logs response."""
    success: bool
    logs: str


class PortConflictInfo(BaseModel):
    """Information about a port conflict."""
    port: int
    env_var: Optional[str] = None
    used_by: str
    suggested_port: int


class PreflightCheckResponse(BaseModel):
    """Response from pre-start checks."""
    can_start: bool
    port_conflicts: List[PortConflictInfo] = []
    message: Optional[str] = None


class PortOverrideRequest(BaseModel):
    """Request to override a service's port."""
    env_var: str = Field(..., description="Environment variable name (e.g., CHRONICLE_PORT)")
    port: int = Field(..., ge=1, le=65535, description="New port number")


# =============================================================================
# Dependencies
# =============================================================================

def get_orchestrator() -> ServiceOrchestrator:
    """Dependency to get the service orchestrator."""
    return get_service_orchestrator()


# =============================================================================
# Discovery Endpoints
# =============================================================================

@router.get("/")
async def list_services(
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> List[Dict[str, Any]]:
    """
    List all installed services.

    Returns services that are in default_services or user-added,
    with their current docker status.
    """
    return await orchestrator.list_installed_services()


@router.get("/catalog")
async def list_catalog(
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> List[Dict[str, Any]]:
    """
    List all available services (catalog).

    Returns all discovered services regardless of installation status.
    Each service includes an 'installed' flag.
    """
    return await orchestrator.list_catalog()


@router.get("/by-capability/{capability}")
async def get_services_by_capability(
    capability: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> List[Dict[str, Any]]:
    """
    Get all services that require a specific capability.

    Args:
        capability: Capability name (e.g., 'llm', 'transcription')
    """
    return await orchestrator.get_services_by_capability(capability)


# =============================================================================
# Status Endpoints (MUST come before /{name} to avoid route shadowing)
# =============================================================================

@router.get("/docker-status")
async def get_docker_status(
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Check if Docker daemon is available."""
    return orchestrator.get_docker_status()


@router.get("/status")
async def get_all_statuses(
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Dict[str, Any]]:
    """
    Get lightweight status for all services.

    Returns only name, status, and health - optimized for polling.
    """
    return await orchestrator.get_all_statuses()


# =============================================================================
# Single Service Endpoints
# =============================================================================

@router.get("/{name}")
async def get_service(
    name: str,
    include_env: bool = False,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Get details for a specific service.

    Args:
        name: Service name (e.g., 'chronicle')
        include_env: Include environment variable definitions
    """
    service = await orchestrator.get_service(name, include_env=include_env)
    if not service:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return service


@router.get("/{name}/status")
async def get_service_status(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get status for a single service."""
    status = await orchestrator.get_service_status(name)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return status


@router.get("/{name}/docker")
async def get_docker_details(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get Docker container details for a service.

    Returns container_id, status, image, ports, health, endpoints, etc.
    """
    details = await orchestrator.get_docker_details(name)
    if details is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return details.to_dict()


# =============================================================================
# Lifecycle Endpoints
# =============================================================================

@router.get("/{name}/preflight", response_model=PreflightCheckResponse)
async def preflight_check(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> PreflightCheckResponse:
    """
    Pre-start checks for a service.

    Checks for port conflicts before attempting to start a service.
    If conflicts are found, returns suggested alternative ports.
    """
    from src.services.docker_manager import get_docker_manager

    docker_mgr = get_docker_manager()

    # Check if service exists
    if name not in docker_mgr.MANAGEABLE_SERVICES:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")

    # Check for port conflicts
    conflicts = docker_mgr.check_port_conflicts(name)

    if conflicts:
        return PreflightCheckResponse(
            can_start=False,
            port_conflicts=[
                PortConflictInfo(
                    port=c.port,
                    env_var=c.env_var,
                    used_by=c.used_by,
                    suggested_port=c.suggested_port
                )
                for c in conflicts
            ],
            message=f"Port conflict: {conflicts[0].port} is in use by {conflicts[0].used_by}"
        )

    return PreflightCheckResponse(can_start=True)


@router.post("/{name}/port-override", response_model=ActionResponse)
async def set_port_override(
    name: str,
    request: PortOverrideRequest,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> ActionResponse:
    """
    Set a port override for a service.

    This saves the port to service_preferences and sets the environment variable
    so that subsequent service starts will use the new port.
    """
    from src.services.docker_manager import get_docker_manager, check_port_in_use
    from src.config.omegaconf_settings import get_settings_store

    docker_mgr = get_docker_manager()

    # Validate service exists
    if name not in docker_mgr.MANAGEABLE_SERVICES:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")

    # Check that the new port is available
    conflict = check_port_in_use(request.port)
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Port {request.port} is already in use by {conflict}"
        )

    # Save the port override simply as services.{name}.ports.{ENV_VAR}
    settings = get_settings_store()
    # Normalize service name for config key (replace - with _)
    config_key = name.replace("-", "_")
    await settings.update({
        f"services.{config_key}.ports.{request.env_var}": request.port
    })

    # Also set the environment variable for immediate use
    import os
    os.environ[request.env_var] = str(request.port)

    logger.info(f"Set port override: services.{config_key}.ports.{request.env_var}={request.port}")

    return ActionResponse(
        success=True,
        message=f"Port {request.port} configured for {name}"
    )


@router.get("/{name}/connection-info")
async def get_service_connection_info(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Get connection info for a service with both proxy and direct URLs.

    Returns TWO connection patterns for flexible service integration:

    1. proxy_url (Recommended for REST APIs):
       - Goes through ushadow backend proxy (/api/services/{name}/proxy/*)
       - Unified authentication (single JWT)
       - No CORS issues
       - Centralized logging/monitoring

    2. direct_url (For WebSocket/Streaming):
       - Direct connection to service (http://localhost:{port})
       - Low latency for real-time data
       - Use for: WebSocket, SSE, audio streaming (ws_pcm)

    Example:
        const info = await api.get('/api/services/chronicle-backend/connection-info')

        // For REST APIs (conversations, queue, config)
        axios.get(`${info.proxy_url}/api/conversations`)  // -> /api/services/chronicle-backend/proxy/api/conversations

        // For WebSocket streaming (ws_pcm)
        new WebSocket(`ws://localhost:${info.port}/ws_pcm`)  // -> ws://localhost:8082/ws_pcm
    """
    import httpx
    from src.services.docker_manager import get_docker_manager

    docker_mgr = get_docker_manager()

    # Validate service exists
    if name not in docker_mgr.MANAGEABLE_SERVICES:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")

    # Get resolved ports (respects user overrides)
    ports = docker_mgr.get_service_ports(name)

    if not ports:
        return {
            "service": name,
            "proxy_url": None,
            "direct_url": None,
            "internal_url": None,
            "available": False,
            "message": "Service has no exposed ports"
        }

    # Use the first port (primary port)
    primary_port = ports[0]
    port = primary_port.get("port") or primary_port.get("default_port")

    # Internal URL (for backend-to-service communication only)
    # Backend uses Docker network, not localhost
    internal_port = primary_port.get("container_port", 8000)
    internal_url = f"http://{name}:{internal_port}"

    # Direct URL (for frontend WebSocket/streaming access)
    # Use Tailscale hostname for web access (goes through Tailscale Serve routes)
    # WebSocket routes like /ws_pcm are configured in Tailscale Serve
    direct_url = None
    try:
        from src.utils.tailscale_serve import get_tailscale_status
        ts_status = get_tailscale_status()
        if ts_status.hostname:
            # Use HTTPS (Tailscale Serve provides TLS)
            direct_url = f"https://{ts_status.hostname}"
    except Exception as e:
        logger.warning(f"Could not get Tailscale hostname for direct_url: {e}")
        # Fallback to localhost (for development)
        direct_url = f"http://localhost:{port}" if port else None

    # Proxy URL (for frontend REST API access through ushadow)
    # Relative URL that goes through this backend
    proxy_url = f"/api/services/{name}/proxy"

    # Check if service is available via health endpoint
    available = False
    if internal_url:
        # Backend checks health using internal Docker network URL
        for health_path in ["/health", "/readiness", "/api/health", "/"]:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    response = await client.get(f"{internal_url}{health_path}")
                    if response.status_code == 200:
                        available = True
                        break
            except Exception:
                continue

    return {
        "service": name,
        # Two-tier architecture URLs
        "proxy_url": proxy_url,  # REST APIs → /api/services/chronicle-backend/proxy/*
        "direct_url": direct_url,  # WebSocket/Streaming → wss://red.spangled-kettle.ts.net
        "internal_url": internal_url,  # Backend only → http://chronicle-backend:8000
        # Port information
        "port": port,  # External port (for direct connections, mainly for mobile/desktop apps)
        "env_var": primary_port.get("env_var"),
        "default_port": primary_port.get("default_port"),
        # Status
        "available": available,
        # Usage hints for frontend
        "usage": {
            "rest_api": f"Use proxy_url: axios.get('{proxy_url}/api/endpoint')",
            "websocket": f"Use direct_url with path: new WebSocket(direct_url.replace('https', 'wss') + '/ws_pcm')",
            "streaming": f"Use direct_url with path: EventSource('{direct_url}/stream')"
        }
    }


@router.api_route("/{name}/proxy/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_service_request(
    name: str,
    path: str,
    request: Request,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
):
    """
    Generic proxy endpoint for service REST APIs.

    Routes frontend requests through ushadow backend to any managed service.
    This provides:
    - Unified authentication (JWT forwarded to service)
    - No CORS issues
    - Centralized logging/monitoring
    - Service discovery (no hardcoded ports)

    Usage:
        Frontend: axios.get('/api/services/chronicle-backend/proxy/api/conversations')
        Backend: Forwards to http://chronicle-backend:8000/api/conversations

    For WebSocket/streaming, use direct_url from connection-info instead.
    """
    import httpx
    from src.services.docker_manager import get_docker_manager

    docker_mgr = get_docker_manager()

    # Validate service exists
    if name not in docker_mgr.MANAGEABLE_SERVICES:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")

    # Get internal URL (Docker network)
    ports = docker_mgr.get_service_ports(name)
    if not ports:
        raise HTTPException(status_code=503, detail=f"Service '{name}' has no ports configured")

    primary_port = ports[0]
    internal_port = primary_port.get("container_port", 8000)

    # Build container name with project prefix (e.g., ushadow-red-chronicle-backend)
    import os
    project_name = os.getenv("COMPOSE_PROJECT_NAME", "ushadow")
    container_name = f"{project_name}-{name}"
    internal_url = f"http://{container_name}:{internal_port}"

    # Extract token from query params for audio/media requests
    # We'll move it to Authorization header
    query_params = dict(request.query_params)
    extracted_token = None
    if ('audio' in path or 'media' in path) and 'token' in query_params:
        extracted_token = query_params.pop('token')
        logger.info(f"[PROXY] Extracted token from query param for audio request")

    # Build target URL (without token in query string if extracted)
    target_url = f"{internal_url}/{path}"
    if query_params:
        # Rebuild query string without token
        from urllib.parse import urlencode
        query_string = urlencode(query_params)
        if query_string:
            target_url = f"{target_url}?{query_string}"
    elif request.url.query and not extracted_token:
        # Use original query string if we didn't extract token
        target_url = f"{target_url}?{request.url.query}"

    logger.info(f"Proxying {request.method} {request.url.path} -> {target_url}")

    # Forward request headers (including auth)
    headers = dict(request.headers)

    # Add extracted token to Authorization header
    if extracted_token and not headers.get("authorization"):
        headers["authorization"] = f"Bearer {extracted_token}"
        logger.info(f"[PROXY] Added Authorization header from extracted token")

    # Log auth header for debugging (masked)
    auth_header = headers.get("authorization", "")
    if auth_header:
        # Show token type and first few chars
        token_preview = auth_header[:20] + "..." if len(auth_header) > 20 else auth_header
        logger.info(f"[PROXY] Forwarding auth: {token_preview}")
    else:
        logger.warning(f"[PROXY] No Authorization header in request to {name}")

    # Remove host header (will be set by httpx)
    headers.pop("host", None)

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Forward the request
            if request.method in ["POST", "PUT", "PATCH"]:
                body = await request.body()
                response = await client.request(
                    method=request.method,
                    url=target_url,
                    headers=headers,
                    content=body
                )
            else:
                response = await client.request(
                    method=request.method,
                    url=target_url,
                    headers=headers
                )

            # Log the response from Chronicle
            logger.info(f"[PROXY] Chronicle response: {response.status_code}")
            if response.status_code == 206:
                logger.info(f"[PROXY] Partial content response - Content-Range: {response.headers.get('content-range')}, Content-Type: {response.headers.get('content-type')}")
            if response.status_code not in [200, 206]:
                logger.warning(f"[PROXY] Chronicle error body: {response.text[:500]}")

            # Forward response headers
            response_headers = dict(response.headers)
            # Remove hop-by-hop headers
            for header in ["connection", "keep-alive", "transfer-encoding"]:
                response_headers.pop(header, None)

            # Fix Content-Disposition for audio/media files
            # Change "attachment" to "inline" so browsers play instead of download
            if 'audio' in path or 'media' in path:
                content_disp = response_headers.get('content-disposition', '')
                if 'attachment' in content_disp:
                    # Change attachment to inline
                    response_headers['content-disposition'] = content_disp.replace('attachment', 'inline')
                    logger.info(f"[PROXY] Changed Content-Disposition from attachment to inline")

                # Add CORS headers for audio playback
                response_headers['access-control-allow-origin'] = '*'
                response_headers['access-control-expose-headers'] = 'Content-Range, Content-Length, Accept-Ranges'

                logger.info(f"[PROXY] Audio response headers: Content-Type={response_headers.get('content-type')}, Content-Length={response_headers.get('content-length')}, Accept-Ranges={response_headers.get('accept-ranges')}")

            # Return proxied response
            from fastapi.responses import Response
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=response_headers
            )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"Service '{name}' request timed out")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=f"Service '{name}' is not reachable")
    except Exception as e:
        logger.error(f"Proxy error for {name}: {e}")
        raise HTTPException(status_code=502, detail=f"Proxy error: {str(e)}")


@router.get("/debug/docker-ports")
async def debug_docker_ports(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Debug endpoint to show all Docker container port bindings.
    """
    from src.services.docker_manager import debug_list_docker_ports

    ports = debug_list_docker_ports()
    return {
        "containers": ports,
        "total_containers": len(ports)
    }


@router.post("/{name}/start", response_model=ActionResponse)
async def start_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> ActionResponse:
    """Start a service container."""
    logger.info(f"POST /services/{name}/start - starting service")

    # For wiring-aware env resolution, we need the full service ID (compose_file:service_name)
    # Look up the service in the compose registry to get its full ID
    from src.services.compose_registry import get_compose_registry
    registry = get_compose_registry()
    discovered = registry.get_service_by_name(name)
    service_id = discovered.service_id if discovered else name

    # Pass full service_id as instance_id to enable wiring-aware env resolution
    result = await orchestrator.start_service(name, instance_id=service_id)

    if not result.success and result.message in ["Service not found", "Operation not permitted"]:
        raise HTTPException(status_code=403, detail=result.message)

    return ActionResponse(success=result.success, message=result.message)


@router.post("/{name}/stop", response_model=ActionResponse)
async def stop_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> ActionResponse:
    """Stop a service container."""
    result = orchestrator.stop_service(name)

    if not result.success and result.message in ["Service not found", "Operation not permitted"]:
        raise HTTPException(status_code=403, detail=result.message)

    return ActionResponse(success=result.success, message=result.message)


@router.post("/{name}/restart", response_model=ActionResponse)
async def restart_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> ActionResponse:
    """Restart a service container."""
    result = orchestrator.restart_service(name)

    if not result.success and result.message in ["Service not found", "Operation not permitted"]:
        raise HTTPException(status_code=403, detail=result.message)

    return ActionResponse(success=result.success, message=result.message)


@router.get("/{name}/logs", response_model=LogsResponse)
async def get_service_logs(
    name: str,
    tail: int = 100,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> LogsResponse:
    """
    Get logs from a service container.

    Args:
        name: Service name
        tail: Number of lines to retrieve (default 100)
    """
    result = orchestrator.get_service_logs(name, tail=tail)

    if not result.success:
        raise HTTPException(status_code=404, detail="Service not found or logs unavailable")

    return LogsResponse(success=result.success, logs=result.logs)


# =============================================================================
# Configuration Endpoints
# =============================================================================

@router.get("/{name}/enabled")
async def get_enabled_state(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Get enabled state for a service."""
    result = await orchestrator.get_enabled_state(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.put("/{name}/enabled")
async def set_enabled_state(
    name: str,
    request: EnabledRequest,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """Enable or disable a service."""
    result = await orchestrator.set_enabled_state(name, request.enabled)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.get("/{name}/config")
async def get_service_config(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Get full service configuration.

    Returns enabled state, env config, and preferences.
    """
    result = await orchestrator.get_service_config(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.get("/{name}/env")
async def get_env_config(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Get environment variable configuration for a service.

    Returns the env schema with current configuration and suggested settings.
    """
    result = await orchestrator.get_env_config(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.put("/{name}/env")
async def update_env_config(
    name: str,
    request: EnvConfigUpdateRequest,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Save environment variable configuration for a service.

    Source types:
    - "setting": Use value from an existing settings path
    - "new_setting": Create a new setting and map to it
    - "literal": Use a directly entered value
    - "default": Use the compose file's default
    """
    env_vars = [ev.model_dump() for ev in request.env_vars]
    result = await orchestrator.update_env_config(name, env_vars)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.get("/{name}/resolve")
async def resolve_env_vars(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Resolve environment variables for runtime injection.

    Returns the actual values that would be passed to docker compose.
    Sensitive values are masked in the response.
    """
    result = await orchestrator.resolve_env_vars(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.get("/{name}/env-export")
async def export_env_vars(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Export environment variables for local development.

    Returns unmasked values suitable for running services locally.
    Use env_content for .env file format or env_vars for dict.

    Example usage:
        curl -H "Authorization: Bearer $TOKEN" \\
            http://localhost:8050/api/services/chronicle-backend/env-export \\
            | jq -r '.env_content' > .env.chronicle
    """
    result = await orchestrator.export_env_vars(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


# =============================================================================
# Installation Endpoints
# =============================================================================

@router.post("/{name}/install")
async def install_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Install a service (add to installed services list).

    This marks the service as user-added, overriding default_services.
    """
    result = await orchestrator.install_service(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.post("/{name}/uninstall")
async def uninstall_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Uninstall a service (remove from installed services list).

    This marks the service as removed, overriding default_services.
    """
    result = await orchestrator.uninstall_service(name)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    return result


@router.post("/register", response_model=ActionResponse)
async def register_dynamic_service(
    request: RegisterServiceRequest,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> ActionResponse:
    """
    Register a dynamic service (e.g., Pieces app, custom integration).

    This allows runtime registration of new services.
    """
    config = {
        "service_name": request.service_name,
        "description": request.description,
        "service_type": request.service_type,
        "endpoints": [ep.model_dump() for ep in request.endpoints],
        "user_controllable": request.user_controllable,
        "compose_file": request.compose_file,
        "metadata": request.metadata,
    }

    result = await orchestrator.register_dynamic_service(config)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return ActionResponse(success=result.success, message=result.message)
