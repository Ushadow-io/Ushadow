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

import asyncio
import logging
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

from src.services.service_orchestrator import get_service_orchestrator, ServiceOrchestrator
from src.services.auth import get_current_user
from src.models.user import User

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
    from src.config import get_settings

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
    settings = get_settings()
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
    import os
    from src.services.docker_manager import get_docker_manager
    from src.services.deployment_manager import get_deployment_manager
    from src.services.compose_registry import get_compose_registry

    docker_mgr = get_docker_manager()
    deployment_mgr = get_deployment_manager()
    compose_registry = get_compose_registry()

    container_name = None
    internal_port = 8000
    port = None
    env_var = None
    default_port = None

    # First check deployments (user-deployed services override infrastructure)
    all_deployments = await deployment_mgr.list_deployments()

    # Find deployment matching service name
    matching_deployment = None
    for deployment in all_deployments:
        if deployment.service_id == name:
            # Prefer running deployments
            if deployment.status == "running":
                matching_deployment = deployment
                break
            elif not matching_deployment:
                matching_deployment = deployment

    if matching_deployment:
        # Use deployment's container name and port
        container_name = matching_deployment.container_name

        # Get external port from deployment
        port = matching_deployment.exposed_port

        # Parse internal port from deployed_config
        internal_port = 8000  # default
        if matching_deployment.deployed_config and "ports" in matching_deployment.deployed_config:
            ports_list = matching_deployment.deployed_config["ports"]
            if ports_list and len(ports_list) > 0:
                # Parse first port mapping: "8081:8000" -> container port is 8000
                first_port = ports_list[0]
                if ":" in first_port:
                    _, container_port = first_port.split(":", 1)
                    internal_port = int(container_port)
                else:
                    internal_port = int(first_port)
        elif matching_deployment.backend_type == "kubernetes":
            # K8s deployments often store no ports in deployed_config — fall back to
            # compose service metadata which is the authoritative source.
            compose_svc = compose_registry.get_service_by_name(name)
            if compose_svc and compose_svc.ports:
                first_port = compose_svc.ports[0]
                container_port = first_port.get("container") or first_port.get("target")
                if container_port:
                    try:
                        internal_port = int(container_port)
                    except (ValueError, TypeError):
                        pass

        # For deployments, we don't have env_var/default_port metadata
        env_var = None
        default_port = None

        logger.info(f"[CONNECTION-INFO] Using deployment: {container_name}:{internal_port}, exposed port: {port}")

    elif name in docker_mgr.MANAGEABLE_SERVICES:
        # Fall back to MANAGEABLE_SERVICES (infrastructure services)
        ports_info = docker_mgr.get_service_ports(name)

        if not ports_info:
            return {
                "service": name,
                "proxy_url": None,
                "direct_url": None,
                "internal_url": None,
                "available": False,
                "message": "Service has no exposed ports"
            }

        # Use the first port (primary port)
        primary_port = ports_info[0]
        port = primary_port.get("port") or primary_port.get("default_port")
        internal_port = primary_port.get("container_port", 8000)
        env_var = primary_port.get("env_var")
        default_port = primary_port.get("default_port")

        # Build container name with project prefix
        project_name = os.getenv("COMPOSE_PROJECT_NAME", "ushadow")
        container_name = f"{project_name}-{name}"

        logger.info(f"[CONNECTION-INFO] Using MANAGEABLE_SERVICE: {container_name}:{internal_port}, exposed port: {port}")

    else:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")

    # Import URL utilities
    from src.config import get_docker_proxy_url, get_relative_proxy_url

    # Proxy URL (for frontend REST API access through ushadow)
    proxy_url = get_relative_proxy_url(name)

    # Direct container URL (for health checks only - not exposed in API)
    # K8s deployments need cluster DNS; Docker uses plain container name
    if matching_deployment and matching_deployment.backend_type == "kubernetes":
        namespace = (matching_deployment.backend_metadata or {}).get("namespace", "default")
        direct_container_url = f"http://{container_name}.{namespace}.svc.cluster.local:{internal_port}"
    else:
        direct_container_url = f"http://{container_name}:{internal_port}"

    # Internal URL (for backend-to-service communication)
    # Use proxy with full backend hostname for stable service discovery
    internal_url = get_docker_proxy_url(name)

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

    # Check if service is available via health endpoint
    # Use direct container URL to avoid circular proxy calls
    available = False
    if direct_container_url:
        # Backend checks health using direct container URL (not proxy)
        for health_path in ["/health", "/readiness", "/api/health", "/"]:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    response = await client.get(f"{direct_container_url}{health_path}")
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
        "env_var": env_var,
        "default_port": default_port,
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
):
    """
    Generic proxy endpoint for service REST APIs.

    Routes frontend requests to managed services via DeploymentManager.resolve_service_url(),
    which abstracts away Docker vs K8s vs managed-infrastructure differences.

    Usage:
        Frontend: axios.get('/api/services/chronicle-backend/proxy/api/conversations')
        Backend: Forwards to http://chronicle-backend-abc123:8000/api/conversations

    For WebSocket/streaming, use direct_url from connection-info instead.
    """
    import httpx
    from fastapi.responses import Response as HttpResponse
    from src.services.deployment_manager import get_deployment_manager

    deployment_mgr = get_deployment_manager()

    # ── 1. Resolve internal URL (all env-type logic lives in the service layer) ──
    try:
        internal_url = await deployment_mgr.resolve_service_url(name)
    except ValueError as e:
        status = 503 if "not running" in str(e) or "not reachable" in str(e) else 404
        raise HTTPException(status_code=status, detail=str(e))

    logger.info(f"[PROXY] {name} → {internal_url}")

    # ── 2. Build target URL ────────────────────────────────────────────────────
    target_url = _build_proxy_target_url(internal_url, path, request)
    logger.info(f"[PROXY] {request.method} {request.url.path} → {target_url}")

    # ── 3. Prepare headers + bridge auth ──────────────────────────────────────
    headers = _build_proxy_headers(request)
    headers = await _bridge_proxy_auth(name, headers)

    # ── 4. Forward and return ──────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            if request.method in ["POST", "PUT", "PATCH"]:
                body = await request.body()
                response = await client.request(request.method, target_url, headers=headers, content=body)
            else:
                response = await client.request(request.method, target_url, headers=headers)

        logger.info(f"[PROXY] {name} → {response.status_code}")
        if response.status_code not in [200, 206]:
            logger.warning(f"[PROXY] {name} error body: {response.text[:500]}")

        return HttpResponse(
            content=response.content,
            status_code=response.status_code,
            headers=_build_proxy_response_headers(response, path),
        )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"Service '{name}' timed out (url: {target_url})")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail=f"Service '{name}' unreachable (url: {target_url}): {e}")
    except Exception as e:
        logger.error(f"[PROXY] Unexpected error for {name} at {target_url}: {e}")
        raise HTTPException(status_code=502, detail=f"Proxy error: {e}")


# ── Proxy helpers (HTTP-layer concerns, not service-discovery) ─────────────────

def _build_proxy_target_url(internal_url: str, path: str, request: Request) -> str:
    """Build the full target URL, extracting token from query params for audio paths."""
    from urllib.parse import urlencode
    query_params = dict(request.query_params)
    # Audio elements pass JWT as query param; move it to header downstream
    if ("audio" in path or "media" in path) and "token" in query_params:
        query_params.pop("token")
    target = f"{internal_url}/{path}"
    qs = urlencode(query_params)
    return f"{target}?{qs}" if qs else target


def _build_proxy_headers(request: Request) -> dict:
    """Copy request headers, lifting audio token and stripping hop-by-hop/cache headers."""
    headers = dict(request.headers)
    # Lift audio token from query param to Authorization header
    token_from_query = request.query_params.get("token")
    if token_from_query and not headers.get("authorization") and (
        "audio" in str(request.url) or "media" in str(request.url)
    ):
        headers["authorization"] = f"Bearer {token_from_query}"

    headers.pop("host", None)
    for h in ["if-none-match", "if-modified-since", "if-unmodified-since", "if-match", "if-range"]:
        headers.pop(h, None)
    return headers


async def _bridge_proxy_auth(service_name: str, headers: dict) -> dict:
    """Convert a Casdoor OIDC token to a service JWT if needed."""
    from src.services.token_bridge import bridge_to_service_token
    auth = headers.get("authorization", "")
    if not auth:
        logger.warning(f"[PROXY] No Authorization header for {service_name}")
        return headers
    token = auth.removeprefix("Bearer ")
    bridged = await bridge_to_service_token(token, audiences=["ushadow", "chronicle"])
    if bridged and bridged != token:
        headers["authorization"] = f"Bearer {bridged}"
        logger.info(f"[PROXY] ✓ Bridged auth token for {service_name}")
    return headers


def _build_proxy_response_headers(response, path: str) -> dict:
    """Strip hop-by-hop headers; fix Content-Disposition and add CORS for audio."""
    headers = dict(response.headers)
    for h in ["connection", "keep-alive", "transfer-encoding"]:
        headers.pop(h, None)
    if "audio" in path or "media" in path:
        cd = headers.get("content-disposition", "")
        if "attachment" in cd:
            headers["content-disposition"] = cd.replace("attachment", "inline")
        headers["access-control-allow-origin"] = "*"
        headers["access-control-expose-headers"] = "Content-Range, Content-Length, Accept-Ranges"
    return headers


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

    # Pass full service_id as config_id to enable wiring-aware env resolution
    result = await orchestrator.start_service(name, config_id=service_id)

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


@router.get("/{name}/container-env")
async def get_container_environment(
    name: str,
    unmask: bool = False,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get actual environment variables from the running container.

    Unlike /resolve which shows configured values, this endpoint inspects
    the actual container to verify what was deployed. Useful for:
    - Testing that configured env vars are actually passed to containers
    - Debugging deployment issues
    - Verifying the configuration hierarchy works correctly

    Args:
        name: Service name
        unmask: If True, return actual values without masking (for testing)

    Returns:
        success: Whether the container was found and inspected
        env_vars: Dict of env var name -> value (sensitive values masked unless unmask=True)
        container_found: Whether a container exists for this service
    """
    from src.services.docker_manager import get_docker_manager

    docker_mgr = get_docker_manager()

    # Validate service exists
    if name not in docker_mgr.MANAGEABLE_SERVICES:
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")

    success, result = docker_mgr.get_container_environment(name)

    if not success:
        return {
            "success": False,
            "env_vars": {},
            "container_found": False,
            "message": result  # Error message
        }

    # Return unmasked if requested (for testing)
    if unmask:
        return {
            "success": True,
            "env_vars": result,
            "container_found": True,
            "total_vars": len(result)
        }

    # Mask sensitive values
    masked_env = {}
    for key, value in result.items():
        if any(kw in key.upper() for kw in ["KEY", "SECRET", "PASSWORD", "TOKEN", "CREDENTIAL"]):
            if len(value) > 4:
                masked_env[key] = f"***{value[-4:]}"
            else:
                masked_env[key] = "****"
        else:
            masked_env[key] = value

    return {
        "success": True,
        "env_vars": masked_env,
        "container_found": True,
        "total_vars": len(result)
    }


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
    deploy_target: Optional[str] = None,
    config_id: Optional[str] = None,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator)
) -> Dict[str, Any]:
    """
    Get environment variable configuration for a service.

    Returns the env schema with current configuration and suggested settings.

    Args:
        name: Service name
        deploy_target: Optional deployment target (unode hostname or cluster ID)
                      to include deploy_env layer in resolution
        config_id: Optional ServiceConfig ID — when provided, previously saved
                   deploy values are included so the deploy dialog pre-fills
                   with the user's last values for this target.
    """
    result = await orchestrator.get_env_config(name, deploy_target=deploy_target, config_id=config_id)
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


@router.post("/mycelia/provision-tokens")
async def provision_mycelia_tokens(
    force: bool = False,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Provision Mycelia credentials (idempotent).

    Retrieves existing tokens from settings or generates fresh ones via
    mycelia-generate-token.py (pymongo direct — Mycelia need not be running).
    Newly generated tokens are saved to ushadow settings immediately.

    Query params:
        force: Generate new tokens even if existing ones are stored.
    """
    from src.services.deployment_manager import get_deployment_manager

    manager = get_deployment_manager()
    tokens = await manager._ensure_mycelia_tokens(force_regenerate=force)
    if not tokens:
        raise HTTPException(
            status_code=500,
            detail="Failed to provision Mycelia tokens. Ensure MongoDB is running.",
        )
    return {
        "client_id": tokens["MYCELIA_CLIENT_ID"],
        "token_preview": tokens["MYCELIA_TOKEN"][:24] + "...",
    }


@router.post("/mycelia/generate-token")
async def generate_mycelia_token(
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """
    Generate Mycelia authentication token by running the token-create command
    inside the running container.

    Returns:
        Dictionary with 'token' and 'client_id' fields
    """
    import subprocess
    import re
    from src.services.docker_manager import get_docker_manager
    from src.services.compose_registry import get_compose_registry

    service_name = "mycelia-backend"

    try:
        # Find the actual running container
        docker_mgr = get_docker_manager()
        compose_registry = get_compose_registry()

        # Verify Docker is actually reachable before checking service status.
        # In K8s mode the Docker socket is absent — ping() raises, we fall through to K8s.
        docker_mgr._client.ping()

        container_name = None

        # First check if service is in MANAGEABLE_SERVICES

        if service_name in docker_mgr.MANAGEABLE_SERVICES:
            service_info = docker_mgr.get_service_info(service_name)

            if service_info.status != "running":
                raise HTTPException(
                    status_code=503,
                    detail=f"Mycelia service is not running. Please start it first using the Services page."
                )

            if service_info.container_id:
                container = docker_mgr._client.containers.get(service_info.container_id)
                container_name = container.name

        # If not in MANAGEABLE_SERVICES, search via compose registry
        if not container_name:
            discovered_service = compose_registry.get_service_by_name(service_name)

            if not discovered_service:
                raise HTTPException(
                    status_code=404,
                    detail="Mycelia service not found. Please ensure mycelia-compose.yml is loaded."
                )

            # Search for running container by compose label
            containers = docker_mgr._client.containers.list(
                all=False,  # Only running
                filters={"label": f"com.docker.compose.service={service_name}"}
            )

            if not containers:
                raise HTTPException(
                    status_code=503,
                    detail="Mycelia service is not running. Please start it first using the Services page."
                )

            # Use first running container
            container_name = containers[0].name
            logger.info(f"[MYCELIA-TOKEN] Found container via compose label: {container_name}")

        if not container_name:
            raise HTTPException(
                status_code=503,
                detail="Could not find running Mycelia container"
            )

        logger.info(f"[MYCELIA-TOKEN] Using container: {container_name}")

        # Execute token-create command inside the running container
        result = subprocess.run(
            [
                "docker", "exec", container_name,
                "deno", "run", "-A", "server.ts", "token-create"
            ],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            logger.error(f"Failed to generate Mycelia token: {result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate token: {result.stderr}"
            )

        # Parse output to extract token and client_id
        # Expected format:
        # MYCELIA_TOKEN=mycelia_...
        # MYCELIA_CLIENT_ID=...
        output = result.stdout
        token_match = re.search(r'MYCELIA_TOKEN=(\S+)', output)
        client_id_match = re.search(r'MYCELIA_CLIENT_ID=(\S+)', output)

        if not token_match or not client_id_match:
            logger.error(f"Failed to parse token from output: {output}")
            raise HTTPException(
                status_code=500,
                detail="Failed to parse token from output"
            )

        return {
            "token": token_match.group(1),
            "client_id": client_id_match.group(1)
        }

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Token generation timed out")

    except Exception:
        pass  # Docker unavailable (e.g. K8s mode) — fall through to K8s path

    # ---- K8s fallback: find pod by label and exec via Python k8s client ----
    try:
        import asyncio
        from kubernetes.stream import stream as k8s_stream
        from src.services.kubernetes import get_kubernetes_manager
        k8s_mgr = await get_kubernetes_manager()
        clusters = await k8s_mgr.list_clusters()
        for cluster in clusters:
            namespace = cluster.namespace or "ushadow"
            try:
                pods = await k8s_mgr.list_pods(cluster.cluster_id, namespace=namespace)
            except Exception as e:
                logger.warning(f"[MYCELIA-TOKEN] Could not list pods in {cluster.name}: {e}")
                continue
            for pod in pods:
                if (pod["labels"].get("app.kubernetes.io/name") == service_name
                        and pod["status"] == "Running"):
                    pod_name = pod["name"]
                    logger.info(f"[MYCELIA-TOKEN] Exec into K8s pod {pod_name} ({cluster.name})")
                    core_api, _ = k8s_mgr._k8s_client.get_kube_client(cluster.cluster_id)
                    loop = asyncio.get_event_loop()
                    output = await loop.run_in_executor(
                        None,
                        lambda: k8s_stream(
                            core_api.connect_get_namespaced_pod_exec,
                            pod_name, namespace,
                            command=["deno", "run", "-A", "server.ts", "token-create"],
                            stderr=True, stdin=False, stdout=True, tty=False,
                        ),
                    )
                    return _parse_mycelia_token_output(output)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating Mycelia token: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
