"""
ushadow Backend - AI Orchestration Platform
FastAPI application entry point
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient

from src.config.settings import get_settings
from src.routers import health, wizard, chronicle, auth, docker, unodes, feature_flatgs
from src.routers import settings as settings_api
from src.middleware import setup_middleware
from src.services.unode_manager import init_unode_manager, get_unode_manager
from src.services.feature_flags import create_feature_flag_service, set_feature_flag_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()


async def check_stale_unodes_task():
    """Background task to check for stale u-nodes."""
    while True:
        try:
            await asyncio.sleep(30)  # Check every 30 seconds
            unode_manager = await get_unode_manager()
            await unode_manager.check_stale_unodes()
        except Exception as e:
            logger.error(f"Error in stale u-nodes check: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info("🚀 ushadow starting up...")
    logger.info(f"Environment: {settings.ENV_NAME}")
    logger.info(f"MongoDB: {settings.MONGODB_URI}/{settings.MONGODB_DATABASE}")

    # Initialize MongoDB connection and u-node manager
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DATABASE]
    await init_unode_manager(db)
    logger.info("✓ UNode manager initialized")

    # Start background task for stale u-node checking
    stale_check_task = asyncio.create_task(check_stale_unodes_task())

    yield

    # Cleanup
    stale_check_task.cancel()
    client.close()
    logger.info("ushadow shutting down...")


# Create FastAPI app
app = FastAPI(
    title="ushadow API",
    description="AI Orchestration Platform",
    version="0.1.0",
    lifespan=lifespan
)

# Set up middleware (CORS, request logging, exception handlers)
setup_middleware(app)

# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(wizard.router, prefix="/api/wizard", tags=["wizard"])
app.include_router(chronicle.router, prefix="/api/chronicle", tags=["chronicle"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["settings"])
app.include_router(docker.router, prefix="/api/docker", tags=["docker"])
app.include_router(unodes.router, prefix="/api/unodes", tags=["unodes"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "ushadow API",
        "version": "0.1.0",
        "status": "running"
    }
