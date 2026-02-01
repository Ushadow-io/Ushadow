"""
ushadow Backend - AI Orchestration Platform
FastAPI application entry point
"""

# Load .env file before any other imports that might use environment variables
# Search up directory tree to find .env at project root
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(usecwd=True))

import asyncio
import logging
import os
import threading
from contextlib import asynccontextmanager

from beanie import init_beanie
from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient

from src.models.user import User  # Beanie document model
from src.models.kanban import Ticket, Epic  # Kanban models

from src.routers import health, wizard, chronicle, auth, feature_flags
from src.routers import services, deployments, providers, service_configs, chat
from src.routers import kubernetes, tailscale, unodes, docker
from src.routers import github_import, kanban
from src.routers import settings as settings_api
from src.middleware import setup_middleware
from src.services.unode_manager import init_unode_manager, get_unode_manager
from src.services.deployment_manager import init_deployment_manager
from src.services.kubernetes_manager import init_kubernetes_manager
from src.services.feature_flags import create_feature_flag_service, set_feature_flag_service
from src.services.mcp_server import setup_mcp_server
from src.config.omegaconf_settings import get_settings_store
from src.utils.telemetry import TelemetryClient
from src.utils.version import VERSION as BACKEND_VERSION

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Telemetry configuration
TELEMETRY_ENDPOINT = os.environ.get(
    "TELEMETRY_ENDPOINT",
    "https://ushadow-telemetry.your-subdomain.workers.dev"
)


class HealthCheckFilter(logging.Filter):
    """Filter out health check requests from uvicorn access logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        # Filter out GET /health requests
        if '"GET /health' in message or '"/health' in message:
            return False
        return True


# Apply filter to uvicorn access logger
logging.getLogger("uvicorn.access").addFilter(HealthCheckFilter())

# Get settings from OmegaConf (sync access at module level)
config = get_settings_store()


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
    # Get settings: OS env vars take priority over OmegaConf YAML
    env_name = os.environ.get("COMPOSE_PROJECT_NAME") or await config.get("environment.name") or "ushadow"
    mongodb_uri = os.environ.get("MONGODB_URI") or await config.get("infrastructure.mongodb_uri") or "mongodb://mongo:27017"
    mongodb_database = os.environ.get("MONGODB_DATABASE") or await config.get("infrastructure.mongodb_database") or "ushadow"

    logger.info("🚀 ushadow starting up...")
    logger.info(f"Environment: {env_name}")
    logger.info(f"MongoDB: {mongodb_uri}/{mongodb_database}")

    # Initialize feature flags
    feature_flag_service = create_feature_flag_service(
        backend="yaml",
        yaml_config_path="/config/feature_flags.yaml"
    )
    set_feature_flag_service(feature_flag_service)
    await feature_flag_service.startup()
    logger.info("✓ Feature flags initialized")

    # Send telemetry ping (non-blocking)
    def send_telemetry():
        try:
            telemetry_client = TelemetryClient(
                endpoint=TELEMETRY_ENDPOINT,
                app_version=BACKEND_VERSION
            )
            success = telemetry_client.send_ping()
            if success:
                logger.info("✓ Telemetry ping sent")
        except Exception as e:
            logger.debug(f"Telemetry failed (non-critical): {e}")

    threading.Thread(target=send_telemetry, daemon=True).start()

    # Initialize MongoDB connection
    client = AsyncIOMotorClient(mongodb_uri)
    db = client[mongodb_database]

    # Store db in app.state for health checks
    app.state.db = db

    # Initialize Beanie ODM with document models
    await init_beanie(database=db, document_models=[User, Ticket, Epic])
    logger.info("✓ Beanie ODM initialized")
    
    # Create admin user if explicitly configured in secrets.yaml
    from src.services.auth import create_admin_user_if_needed
    await create_admin_user_if_needed()

    # Initialize u-node manager
    await init_unode_manager(db)
    logger.info("✓ UNode manager initialized")

    # Initialize OmegaConf settings manager (YAML-based, no DB needed)
    settings_store = get_settings_store()
    await settings_store.load_config()  # Pre-load and cache
    logger.info("✓ OmegaConf settings initialized")
    # Initialize deployment manager
    await init_deployment_manager(db)
    logger.info("✓ Deployment manager initialized")

    # Initialize Kubernetes manager
    await init_kubernetes_manager(db)
    logger.info("✓ Kubernetes manager initialized")

    # Start background task for stale u-node checking
    stale_check_task = asyncio.create_task(check_stale_unodes_task())

    yield

    # Cleanup
    stale_check_task.cancel()
    await feature_flag_service.shutdown()
    client.close()
    logger.info("ushadow shutting down...")


# Create FastAPI app
app = FastAPI(
    title="ushadow API",
    description="AI Orchestration Platform",
    version=BACKEND_VERSION or "0.1.0",
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
app.include_router(unodes.router, prefix="/api/unodes", tags=["unodes"])
app.include_router(kubernetes.router, prefix="/api/kubernetes", tags=["kubernetes"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(providers.router, prefix="/api/providers", tags=["providers"])
app.include_router(service_configs.router, tags=["service-configs"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(deployments.router, tags=["deployments"])
app.include_router(tailscale.router, tags=["tailscale"])
app.include_router(github_import.router, prefix="/api/github-import", tags=["github-import"])
app.include_router(kanban.router, tags=["kanban"])

# Setup MCP server for LLM tool access
setup_mcp_server(app)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "ushadow API",
        "version": BACKEND_VERSION or "0.1.0",
        "status": "running"
    }


@app.get("/api/version")
async def get_version():
    """Get application version information."""
    return {
        "version": BACKEND_VERSION or "0.1.0",
        "api_version": "v1"
    }
