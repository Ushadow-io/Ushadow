"""
SSE Router - Server-Sent Events endpoints for real-time streaming.

Provides SSE endpoints for operations that benefit from real-time progress:
- Docker image pulls
- Service deployments
- Long-running tasks

All endpoints support auth via query param (?token=...) since EventSource
doesn't support custom headers.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

from src.utils.sse_bridge import SSEBridge, create_sse_response
from src.services.auth import get_user_from_token

logger = logging.getLogger(__name__)
router = APIRouter()


async def validate_sse_auth(request: Request, token: Optional[str] = None):
    """
    Validate authentication for SSE endpoints.

    Checks Authorization header first, then falls back to query param.
    This is needed because EventSource doesn't support custom headers.
    """
    # Check header first
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required. Pass ?token=your_jwt")

    try:
        user = await get_user_from_token(token)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Token validation failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("/docker/pull/{service_name}")
async def pull_service_image(
    service_name: str,
    request: Request,
    token: Optional[str] = None,
):
    """
    Pull Docker image for a service with streaming progress.

    Auth: Pass token via query param since EventSource doesn't support headers.
        GET /api/sse/docker/pull/faster-whisper?token=your_jwt

    Events:
        {"status": "Pulling", "id": "abc123", "progress": "[=====>  ] 50%"}
        {"status": "Downloading", "id": "def456", "progressDetail": {"current": 1234, "total": 5678}}
        {"complete": true, "success": true, "message": "Pull complete"}

    Usage (JavaScript):
        const token = localStorage.getItem('token');
        const es = new EventSource(`/api/sse/docker/pull/faster-whisper?token=${token}`);
        es.onmessage = (e) => {
            const data = JSON.parse(e.data);
            console.log(data.status, data.progress);
            if (data.complete) es.close();
        };
    """
    await validate_sse_auth(request, token)

    from src.services.docker_manager import get_docker_manager
    from src.services.compose_registry import get_compose_registry

    docker_mgr = get_docker_manager()
    compose_registry = get_compose_registry()

    # Find service
    service = compose_registry.get_service_by_name(service_name)
    if not service:
        raise HTTPException(status_code=404, detail=f"Service '{service_name}' not found")

    if not service.image:
        raise HTTPException(status_code=400, detail=f"Service '{service_name}' has no image defined")

    # Parse image:tag
    image = service.image
    if ":" in image:
        image_name, tag = image.rsplit(":", 1)
    else:
        image_name, tag = image, "latest"

    # Create bridge and pull operation
    bridge = SSEBridge()

    def pull_operation():
        """Run Docker pull with progress callbacks."""
        def on_progress(event: dict):
            bridge.send(event)

        success, message = docker_mgr.pull_image_with_progress(
            image_name, tag, callback=on_progress
        )
        bridge.complete(success=success, message=message)

    return create_sse_response(bridge, pull_operation)


@router.get("/docker/logs/{service_name}")
async def stream_service_logs(
    service_name: str,
    request: Request,
    token: Optional[str] = None,
    tail: int = 50,
):
    """
    Stream Docker container logs in real-time.

    Args:
        service_name: Name of the service
        tail: Number of historical lines to include (default 50)
        token: JWT token for auth

    Events:
        {"log": "2024-01-20 10:00:00 INFO Starting...", "stream": "stdout"}
        {"log": "2024-01-20 10:00:01 ERROR Failed!", "stream": "stderr"}

    Usage:
        const es = new EventSource(`/api/sse/docker/logs/chronicle-backend?token=${token}&tail=100`);
    """
    await validate_sse_auth(request, token)

    from src.services.docker_manager import get_docker_manager
    import docker

    docker_mgr = get_docker_manager()

    if not docker_mgr.is_available():
        raise HTTPException(status_code=503, detail="Docker not available")

    # Get container
    container_name = docker_mgr._get_container_name(service_name)

    try:
        container = docker_mgr._client.containers.get(container_name)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail=f"Container '{service_name}' not found")

    bridge = SSEBridge()

    def stream_logs():
        """Stream logs from container."""
        try:
            for line in container.logs(stream=True, follow=True, tail=tail):
                log_line = line.decode('utf-8', errors='replace').rstrip()
                if log_line:
                    bridge.send({"log": log_line})
        except Exception as e:
            bridge.error(str(e))

    return create_sse_response(bridge, stream_logs)
