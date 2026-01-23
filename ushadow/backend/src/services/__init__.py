"""
Services Layer - Public API

This module exports the public interface of the services layer.
Agents should import from here to discover available services.

Quick Reference:
    from src.services import DockerManager, get_docker_manager

For full service catalog, see:
    - /backend_index.py (static reference)
    - /ushadow/backend/BACKEND_QUICK_REF.md (patterns and usage)
"""

# =============================================================================
# Resource Managers (External Systems)
# =============================================================================

from src.services.docker_manager import (
    DockerManager,
    PortConflict,
    ServiceEndpoint,
    ServiceInfo,
    ServiceStatus,
    ServiceType,
)
from src.services.kubernetes_manager import KubernetesManager, get_kubernetes_manager
from src.services.tailscale_manager import (
    AuthUrlResponse,
    CertResponse,
    ContainerStatus,
    TailnetSettings,
    TailscaleManager,
)
from src.services.unode_manager import UNodeManager, get_unode_manager

# =============================================================================
# Business Services (Orchestration)
# =============================================================================

from src.services.deployment_manager import DeploymentManager
from src.services.service_config_manager import ServiceConfigManager
from src.services.service_orchestrator import (
    ActionResult,
    DockerDetails,
    LogResult,
    ServiceOrchestrator,
    ServiceSummary,
)

# =============================================================================
# Registries (Runtime Lookups)
# =============================================================================

from src.services.compose_registry import ComposeServiceRegistry
from src.services.provider_registry import ProviderRegistry

# =============================================================================
# Specialized Services
# =============================================================================

from src.services.auth import AuthService
from src.services.capability_resolver import CapabilityResolver
from src.services.deployment_platforms import (
    DeploymentPlatform,
    DockerPlatform,
    K8sPlatform,
    LocalPlatform,
)
from src.services.feature_flags import FeatureFlagService
from src.services.integration_operations import IntegrationOperations
from src.services.llm_client import LLMClient
from src.services.mcp_server import MCPServerManager

# =============================================================================
# Public API - What agents should use
# =============================================================================

__all__ = [
    # Resource Managers
    "DockerManager",
    "KubernetesManager",
    "get_kubernetes_manager",
    "TailscaleManager",
    "UNodeManager",
    "get_unode_manager",
    # Business Services
    "DeploymentManager",
    "ServiceConfigManager",
    "ServiceOrchestrator",
    # Registries
    "ComposeServiceRegistry",
    "ProviderRegistry",
    # Specialized Services
    "AuthService",
    "CapabilityResolver",
    "DeploymentPlatform",
    "DockerPlatform",
    "K8sPlatform",
    "LocalPlatform",
    "FeatureFlagService",
    "IntegrationOperations",
    "LLMClient",
    "MCPServerManager",
    # Common Types (for type hints)
    "ServiceStatus",
    "ServiceType",
    "ServiceInfo",
    "ServiceEndpoint",
    "PortConflict",
    "ContainerStatus",
    "AuthUrlResponse",
    "CertResponse",
    "TailnetSettings",
    "ServiceSummary",
    "DockerDetails",
    "ActionResult",
    "LogResult",
]

# =============================================================================
# Quick Reference for Agents
# =============================================================================

SERVICE_PURPOSES = {
    "DockerManager": "Docker container lifecycle management",
    "KubernetesManager": "Kubernetes cluster and deployment operations",
    "TailscaleManager": "Tailscale mesh networking configuration",
    "UNodeManager": "Distributed cluster node management",
    "ServiceOrchestrator": "High-level service lifecycle coordination",
    "DeploymentManager": "Multi-platform deployment strategies",
    "ServiceConfigManager": "Service configuration CRUD operations",
    "ComposeServiceRegistry": "Runtime registry of Compose services",
    "ProviderRegistry": "Runtime registry of LLM providers",
    "CapabilityResolver": "Service capability resolution",
    "FeatureFlagService": "Feature flag management",
    "AuthService": "Authentication and authorization",
    "LLMClient": "LLM API client operations",
    "MCPServerManager": "MCP server lifecycle management",
}


def list_services() -> dict[str, str]:
    """
    List all available services with their purposes.

    Useful for agents discovering what services exist.

    Returns:
        Dict mapping service class names to purpose descriptions.
    """
    return SERVICE_PURPOSES
