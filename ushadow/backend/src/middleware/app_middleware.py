"""
Middleware configuration for ushadow backend.

Centralizes CORS configuration, request logging, and global exception handlers.
"""

import json
import logging
import os
import re
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pymongo.errors import ConnectionFailure, PyMongoError
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)
request_logger = logging.getLogger("api.requests")


def _get_tailscale_hostname() -> str | None:
    """Read the Tailscale hostname from config if available."""
    try:
        import yaml
        config_path = "/config/tailscale.yaml"
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
                return config.get('hostname')
    except Exception as e:
        logger.debug(f"Could not read Tailscale config: {e}")
    return None


def _get_cors_origins_from_config() -> list[str]:
    """
    Get CORS origins from OmegaConf settings.

    OmegaConf resolves ${oc.env:CORS_ORIGINS,...} in config.defaults.yaml,
    so env var is used if set, otherwise defaults apply.
    Config priority: overrides.yaml > secrets.yaml > defaults.yaml
    """
    try:
        from src.config import get_settings
        settings = get_settings()
        cors_origins = settings.get_sync("security.cors_origins", "")

        if cors_origins and cors_origins.strip():
            origins = [o.strip() for o in cors_origins.split(",") if o.strip()]
            if origins:
                return origins
    except Exception as e:
        logger.warning(f"Could not read CORS from OmegaConf: {e}")

    return ['*']


def _get_tailscale_origin_regex() -> str | None:
    """Build a regex pattern for Tailscale MagicDNS origins.

    Matches: https://{project_name}.*.ts.net (any tailnet suffix)
    Example: https://ushadow.spangled-kettle.ts.net
    """
    project_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip()
    if project_name:
        # Pattern: https://{project_name}.{tailnet-suffix}.ts.net
        escaped_name = re.escape(project_name)
        return rf"https://{escaped_name}\.[-a-z0-9]+\.ts\.net"
    return None


def setup_cors_middleware(app: FastAPI) -> None:
    """Configure CORS middleware for the FastAPI application."""
    # Get CORS origins from OmegaConf (with env var fallback)
    allowed_origins = _get_cors_origins_from_config()

    # Add Tailscale hostname if configured (and not already in list)
    tailscale_hostname = _get_tailscale_hostname()
    if tailscale_hostname:
        tailscale_origin = f"https://{tailscale_hostname}"
        if tailscale_origin not in allowed_origins and '*' not in allowed_origins:
            allowed_origins.append(tailscale_origin)
            logger.info(f"Added Tailscale origin to CORS: {tailscale_origin}")

    # Build Tailscale origin regex for any tailnet
    tailscale_regex = _get_tailscale_origin_regex()
    if tailscale_regex:
        logger.info(f"Tailscale CORS regex: {tailscale_regex}")

    logger.info(f"CORS configured with origins: {allowed_origins}")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=tailscale_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log API requests and JSON responses.

    Excludes:
    - Health check endpoints
    - Authentication endpoints
    - WebSocket connections
    - Binary file responses (audio, images)
    - Streaming responses
    """

    # Paths to exclude from logging
    EXCLUDED_PATHS = {
        "/health",
        "/api/auth/login",
        "/api/auth/logout",
        "/api/auth/me",
        "/docs",
        "/redoc",
        "/openapi.json",
    }

    # Binary content types to exclude
    BINARY_CONTENT_TYPES = {
        "audio/",
        "image/",
        "video/",
        "application/octet-stream",
    }

    def should_log_request(self, path: str) -> bool:
        """Determine if request should be logged."""
        # Exclude exact path matches
        if path in self.EXCLUDED_PATHS:
            return False

        # Exclude paths starting with excluded prefixes
        for excluded in self.EXCLUDED_PATHS:
            if path.startswith(excluded):
                return False

        return True

    def should_log_response_body(self, content_type: str) -> bool:
        """Determine if response body should be logged."""
        if not content_type:
            return True

        # Exclude binary content types
        for binary_type in self.BINARY_CONTENT_TYPES:
            if content_type.startswith(binary_type):
                return False

        return True

    async def dispatch(self, request: Request, call_next):
        """Process request and log request/response information."""
        path = request.url.path

        # Skip logging for excluded paths
        if not self.should_log_request(path):
            return await call_next(request)

        # Start timing
        start_time = time.time()

        # Log request
        request_logger.info(f"→ {request.method} {path}")

        # Process request
        response = await call_next(request)

        # Calculate duration
        duration_ms = (time.time() - start_time) * 1000

        # Check if we should log response body
        content_type = response.headers.get("content-type", "")
        should_log_body = self.should_log_response_body(content_type)

        # Skip body logging for streaming responses
        if isinstance(response, StreamingResponse):
            request_logger.info(
                f"← {request.method} {path} - {response.status_code} "
                f"(streaming response) - {duration_ms:.2f}ms"
            )
            return response

        # For non-streaming responses, try to extract and log JSON body
        if should_log_body and response.status_code != 204:  # No content
            try:
                # Read response body
                response_body = b""
                async for chunk in response.body_iterator:
                    response_body += chunk

                # Try to parse as JSON for compact logging
                try:
                    json_body = json.loads(response_body)

                    # Skip logging verbose metadata endpoints
                    skip_body_paths = ['/connection-info', '/health', '/status']
                    if any(skip in path for skip in skip_body_paths):
                        request_logger.info(
                            f"← {request.method} {path} - {response.status_code} - {duration_ms:.2f}ms"
                        )
                    else:
                        # Use compact JSON (no indent)
                        compact_json = json.dumps(json_body, separators=(',', ':'))
                        # Truncate if too long (max 120 chars for readability)
                        if len(compact_json) > 120:
                            compact_json = compact_json[:120] + "..."
                        request_logger.info(
                            f"← {request.method} {path} - {response.status_code} - {duration_ms:.2f}ms | {compact_json}"
                        )
                except (json.JSONDecodeError, UnicodeDecodeError):
                    # Not JSON or not UTF-8, just log the status
                    request_logger.info(
                        f"← {request.method} {path} - {response.status_code} - {duration_ms:.2f}ms"
                    )

                # Recreate response with the body we consumed
                from starlette.responses import Response
                return Response(
                    content=response_body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )
            except Exception as e:
                # If anything goes wrong, just log basic info
                request_logger.warning(
                    f"← {request.method} {path} - {response.status_code} - {duration_ms:.2f}ms "
                    f"(error reading response: {e})"
                )
                return response
        else:
            # Just log status for responses without body
            request_logger.info(
                f"← {request.method} {path} - {response.status_code} - {duration_ms:.2f}ms"
            )
            return response


def setup_exception_handlers(app: FastAPI) -> None:
    """Configure global exception handlers for the FastAPI application."""

    @app.exception_handler(ConnectionFailure)
    @app.exception_handler(PyMongoError)
    async def database_exception_handler(request: Request, exc: Exception):
        """Handle database connection failures and return structured error response."""
        logger.error(f"Database connection error: {type(exc).__name__}: {exc}")
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Unable to connect to database. Please check your connection and try again.",
                "error_type": "connection_failure",
                "error_category": "database"
            }
        )

    @app.exception_handler(ConnectionError)
    async def connection_exception_handler(request: Request, exc: ConnectionError):
        """Handle general connection errors and return structured error response."""
        logger.error(f"Connection error: {exc}")
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Unable to connect to server. Please check your connection and try again.",
                "error_type": "connection_failure",
                "error_category": "network"
            }
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Handle HTTP exceptions with structured error response."""
        # Map status codes to error types for better frontend handling
        error_type_map = {
            400: ("bad_request", "validation"),
            401: ("authentication_failure", "security"),
            403: ("forbidden", "security"),
            404: ("not_found", "resource"),
            409: ("conflict", "resource"),
            422: ("validation_error", "validation"),
            429: ("rate_limited", "throttling"),
            500: ("internal_error", "server"),
            502: ("bad_gateway", "server"),
            503: ("service_unavailable", "server"),
            504: ("gateway_timeout", "server"),
        }

        error_type, error_category = error_type_map.get(
            exc.status_code, ("http_error", "general")
        )

        # Always return structured error response
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "error_type": error_type,
                "error_category": error_category,
                "status_code": exc.status_code
            }
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        """
        Catch-all handler for any unhandled exceptions.

        Logs full stack trace and returns structured error response.
        This ensures all errors are visible in logs for debugging.
        """
        import traceback

        # Log full error with stack trace
        logger.error(
            f"Unhandled exception in {request.method} {request.url.path}: "
            f"{type(exc).__name__}: {exc}"
        )
        logger.error(f"Stack trace:\n{traceback.format_exc()}")

        # Return structured error response
        return JSONResponse(
            status_code=500,
            content={
                "detail": str(exc),
                "error_type": type(exc).__name__,
                "error_category": "internal_error"
            }
        )


def setup_middleware(app: FastAPI) -> None:
    """Set up all middleware for the FastAPI application."""
    # Configure request logger with timestamp format (must be done here after logging.basicConfig)
    if not request_logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        request_logger.addHandler(handler)
        request_logger.setLevel(logging.INFO)
        request_logger.propagate = False  # Don't propagate to root logger

    # Add request logging middleware
    app.add_middleware(RequestLoggingMiddleware)
    logger.info("📝 Request logging middleware enabled")

    # Set up CORS middleware
    setup_cors_middleware(app)

    # Set up exception handlers
    setup_exception_handlers(app)
    logger.info("✅ Middleware and exception handlers configured")
