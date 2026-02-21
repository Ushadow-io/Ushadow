"""
Share Gateway - Public-facing proxy for shared resources

This service runs on a public VPS and validates share tokens before
proxying requests to the private ushadow backend via Tailscale.

Security model:
- Only exposes /c/{token} endpoint (no other ushadow APIs)
- Validates tokens against shared database before proxying
- Records audit logs for all access
- Rate-limited to prevent abuse
"""

import logging
import os
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from models import ShareToken, ShareTokenResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration from environment
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://mongo:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "ushadow")
USHADOW_BACKEND_URL = os.getenv(
    "USHADOW_BACKEND_URL",
    "http://ushadow.your-tailnet.ts.net:8080"  # TODO: Replace with your Tailscale hostname
)

# Rate limiting
limiter = Limiter(key_func=get_remote_address)

# FastAPI app
app = FastAPI(
    title="Ushadow Share Gateway",
    description="Public gateway for accessing shared conversations",
    version="1.0.0"
)

# Enable CORS for web access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Public endpoint, allow all origins
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Add rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# MongoDB connection
@app.on_event("startup")
async def startup():
    """Initialize MongoDB connection."""
    app.mongodb_client = AsyncIOMotorClient(MONGODB_URI)
    app.mongodb = app.mongodb_client[MONGODB_DATABASE]
    logger.info(f"Connected to MongoDB: {MONGODB_URI}/{MONGODB_DATABASE}")


@app.on_event("shutdown")
async def shutdown():
    """Close MongoDB connection."""
    app.mongodb_client.close()


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "ushadow-share-gateway"
    }


@app.get("/c/{token}")
@limiter.limit("10/minute")  # Rate limit: 10 requests per minute per IP
async def access_shared_resource(
    token: str,
    request: Request
):
    """
    Access a shared resource via token.

    This is the ONLY public endpoint. All other ushadow APIs remain private.

    Rate limited to 10 requests/minute per IP to prevent abuse.
    """
    # 1. Validate token exists in database
    share_token_doc = await app.mongodb.share_tokens.find_one({"token": token})
    if not share_token_doc:
        logger.warning(f"Share token not found: {token}")
        raise HTTPException(status_code=404, detail="Share link not found")

    # Convert to ShareToken object for validation
    share_token = ShareToken(**share_token_doc)

    # 2. Check expiration
    if share_token.is_expired():
        logger.warning(f"Share token expired: {token}")
        raise HTTPException(status_code=403, detail="Share link has expired")

    # 3. Check view limit
    if share_token.is_view_limit_exceeded():
        logger.warning(f"Share token view limit exceeded: {token}")
        raise HTTPException(status_code=403, detail="Share link view limit exceeded")

    # 4. Check if authentication required
    if share_token.require_auth:
        # TODO: Implement authentication check
        # For now, reject auth-required shares at gateway
        logger.warning(f"Auth-required share attempted via gateway: {token}")
        raise HTTPException(
            status_code=403,
            detail="This share requires authentication. Please access via the ushadow app."
        )

    # 5. Record access in audit log
    client_ip = request.client.host if request.client else "unknown"
    await record_access(
        token_doc=share_token_doc,
        user_identifier=client_ip,
        action="view",
        metadata={
            "ip": client_ip,
            "user_agent": request.headers.get("user-agent"),
            "via": "gateway"
        }
    )

    # 6. Proxy request to ushadow backend via Tailscale
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{USHADOW_BACKEND_URL}/api/share/{token}",
                headers={
                    "X-Gateway-Request": "true",
                    "X-Forwarded-For": client_ip,
                }
            )

            if response.status_code != 200:
                logger.error(f"Backend returned {response.status_code} for token {token}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Failed to fetch shared resource"
                )

            return response.json()

    except httpx.TimeoutException:
        logger.error(f"Timeout fetching resource for token {token}")
        raise HTTPException(status_code=504, detail="Request timeout")
    except httpx.RequestError as e:
        logger.error(f"Request error for token {token}: {e}")
        raise HTTPException(status_code=502, detail="Failed to reach backend")


async def record_access(
    token_doc: dict,
    user_identifier: str,
    action: str,
    metadata: dict
):
    """Record access to shared resource in audit log."""
    from datetime import datetime

    # Increment view count
    view_count = token_doc.get("view_count", 0) + 1

    # Build audit log entry
    log_entry = {
        "timestamp": datetime.utcnow(),
        "user_identifier": user_identifier,
        "action": action,
        "view_count": view_count,
        "metadata": metadata
    }

    # Update database
    await app.mongodb.share_tokens.update_one(
        {"token": token_doc["token"]},
        {
            "$set": {
                "view_count": view_count,
                "last_accessed_at": datetime.utcnow(),
                "last_accessed_by": user_identifier,
                "updated_at": datetime.utcnow(),
            },
            "$push": {"access_log": log_entry}
        }
    )

    logger.info(f"Recorded access to token {token_doc['token']} by {user_identifier}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
