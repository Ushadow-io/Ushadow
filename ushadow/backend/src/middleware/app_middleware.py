"""
Middleware configuration for ushadow backend.

Centralizes CORS configuration, request logging, and global exception handlers.
"""

import json
import logging
import time
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pymongo.errors import ConnectionFailure, PyMongoError
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)
request_logger = logging.getLogger("api.requests")


def setup_cors_middleware(app: FastAPI) -> None:
    """Configure CORS middleware for the FastAPI application."""
    # Get CORS origins from environment or use defaults
    cors_origins_env = os.getenv('CORS_ORIGINS', '*')

    if cors_origins_env == '*':
        allowed_origins = ['*']
    else:
        allowed_origins = [origin.strip() for origin in cors_origins_env.split(',')]

    logger.info(f"🌐 CORS configured with origins: {allowed_origins}")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
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
        "/api/docker/dockerstatus_events",  # SSE endpoint - don't interfere
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
                    # Use compact JSON (no indent)
                    compact_json = json.dumps(json_body, separators=(',', ':'))
                    # Truncate if too long (max 500 chars)
                    if len(compact_json) > 500:
                        compact_json = compact_json[:500] + "..."
                    request_logger.info(
                        f"← {request.method} {path} - {response.status_code} - {duration_ms:.2f}ms | {compact_json}"
                    )
                except (json.JSONDecodeError, UnicodeDecodeError):
                    # Not JSON or not UTF-8, just log the status
                    request_logger.info(
                        f"← {request.method} {path} - {response.status_code} - {duration_ms:.2f}ms "
                        f"(non-JSON response)"
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
        # For authentication failures (401), add error_type
        if exc.status_code == 401:
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "detail": exc.detail,
                    "error_type": "authentication_failure",
                    "error_category": "security"
                }
            )

        # For other HTTP exceptions, return as normal
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail}
        )


def setup_middleware(app: FastAPI) -> None:
    """Set up all middleware for the FastAPI application."""
    # Add request logging middleware
    app.add_middleware(RequestLoggingMiddleware)
    logger.info("📝 Request logging middleware enabled")

    # Set up CORS middleware
    setup_cors_middleware(app)

    # Set up exception handlers
    setup_exception_handlers(app)
    logger.info("✅ Middleware and exception handlers configured")
