"""
ushadow Backend - AI Orchestration Platform
FastAPI application entry point
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.config.settings import get_settings
from src.api import health, wizard, chronicle, auth, docker, feature_flags
from src.api import settings as settings_api
from src.middleware import setup_middleware
from src.services.feature_flags import create_feature_flag_service, set_feature_flag_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info("🚀 ushadow starting up...")
    logger.info(f"Environment: {settings.ENV_NAME}")
    logger.info(f"MongoDB: {settings.MONGODB_URI}/{settings.MONGODB_DATABASE}")

    # Initialize feature flags
    feature_flag_service = create_feature_flag_service(
        backend="yaml",
        yaml_config_path="/config/feature_flags.yaml"
    )
    set_feature_flag_service(feature_flag_service)
    await feature_flag_service.startup()
    logger.info("✓ Feature flags initialized")

    yield

    # Cleanup feature flags
    await feature_flag_service.shutdown()

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
app.include_router(feature_flags.router, tags=["feature-flags"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "ushadow API",
        "version": "0.1.0",
        "status": "running"
    }
