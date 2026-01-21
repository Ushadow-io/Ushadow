"""
Health check endpoints following best practices.

Provides comprehensive health monitoring for:
- Overall application status
- Critical service dependencies (MongoDB, Redis)
- Configuration visibility
- Performance metrics (response time)

Response always returns 200 OK to allow monitoring systems to detect
the service is running, even when dependencies are degraded.
"""

import logging
import os
import time
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


class ServiceHealth(BaseModel):
    """Health status for a single service."""
    status: str  # "healthy", "degraded", "unhealthy"
    healthy: bool
    critical: bool
    message: str | None = None
    latency_ms: float | None = None


class HealthResponse(BaseModel):
    """Comprehensive health check response."""
    status: str  # "healthy", "degraded", "unhealthy"
    timestamp: int  # Unix epoch seconds
    services: dict[str, ServiceHealth]
    config: dict[str, Any]
    overall_healthy: bool
    critical_services_healthy: bool


async def check_mongodb_health(request: Request) -> ServiceHealth:
    """Check MongoDB connectivity and responsiveness."""
    start = time.time()
    try:
        # Get MongoDB client from app state (set in lifespan)
        db = getattr(request.app.state, "db", None)
        if db is None:
            return ServiceHealth(
                status="unhealthy",
                healthy=False,
                critical=True,
                message="MongoDB client not initialized"
            )

        # Ping the database
        await db.command("ping")
        latency_ms = (time.time() - start) * 1000

        return ServiceHealth(
            status="healthy",
            healthy=True,
            critical=True,
            latency_ms=round(latency_ms, 2)
        )
    except Exception as e:
        latency_ms = (time.time() - start) * 1000
        logger.warning(f"MongoDB health check failed: {e}")
        return ServiceHealth(
            status="unhealthy",
            healthy=False,
            critical=True,
            message=str(e),
            latency_ms=round(latency_ms, 2)
        )


async def check_redis_health(request: Request) -> ServiceHealth:
    """Check Redis connectivity and responsiveness."""
    start = time.time()
    try:
        # Get Redis client from app state (set in lifespan)
        redis_client = getattr(request.app.state, "redis", None)
        if redis_client is None:
            # Try to create a temporary connection for health check
            import redis.asyncio as redis
            redis_url = os.environ.get("REDIS_URL", "redis://redis:6379")
            redis_client = redis.from_url(redis_url, decode_responses=True)

        # Ping Redis
        await redis_client.ping()
        latency_ms = (time.time() - start) * 1000

        # Close temporary connection if we created one
        if getattr(request.app.state, "redis", None) is None:
            await redis_client.close()

        return ServiceHealth(
            status="healthy",
            healthy=True,
            critical=True,
            latency_ms=round(latency_ms, 2)
        )
    except Exception as e:
        latency_ms = (time.time() - start) * 1000
        logger.warning(f"Redis health check failed: {e}")
        return ServiceHealth(
            status="unhealthy",
            healthy=False,
            critical=True,
            message=str(e),
            latency_ms=round(latency_ms, 2)
        )


def get_config_info() -> dict[str, Any]:
    """Get non-sensitive configuration information."""
    return {
        "environment": os.environ.get("COMPOSE_PROJECT_NAME", "ushadow"),
        "version": "0.1.0",
        "debug": os.environ.get("DEBUG", "false").lower() == "true",
        "mongodb_database": os.environ.get("MONGODB_DATABASE", "ushadow"),
    }


def calculate_overall_status(services: dict[str, ServiceHealth]) -> tuple[str, bool, bool]:
    """
    Calculate overall health status from individual services.

    Returns:
        Tuple of (status, overall_healthy, critical_services_healthy)
    """
    all_healthy = all(s.healthy for s in services.values())
    critical_healthy = all(s.healthy for s in services.values() if s.critical)

    if all_healthy:
        status = "healthy"
    elif critical_healthy:
        status = "degraded"
    else:
        status = "unhealthy"

    return status, all_healthy, critical_healthy


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request) -> HealthResponse:
    """
    Comprehensive health check endpoint.

    Always returns 200 OK to allow monitoring systems to detect the service
    is running. The response body contains detailed health status.

    Response fields:
    - status: "healthy", "degraded", or "unhealthy"
    - timestamp: Unix epoch seconds
    - services: Health status of each dependency
    - config: Non-sensitive configuration info
    - overall_healthy: True if all services are healthy
    - critical_services_healthy: True if critical services are healthy
    """
    # Check all services concurrently
    import asyncio
    mongodb_health, redis_health = await asyncio.gather(
        check_mongodb_health(request),
        check_redis_health(request)
    )

    services = {
        "mongodb": mongodb_health,
        "redis": redis_health,
    }

    # Calculate overall status
    status, overall_healthy, critical_healthy = calculate_overall_status(services)

    return HealthResponse(
        status=status,
        timestamp=int(time.time()),
        services=services,
        config=get_config_info(),
        overall_healthy=overall_healthy,
        critical_services_healthy=critical_healthy,
    )
