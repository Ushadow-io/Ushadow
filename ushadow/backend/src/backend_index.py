"""
Backend Method and Class Index for Agent Discovery.

This is a STATIC REFERENCE FILE for documentation purposes only.
It is NOT a runtime registry like ComposeRegistry or ProviderRegistry.

Purpose:
- Help AI agents discover existing backend code before creating new methods
- Provide quick lookup of available services, managers, and utilities
- Reduce code duplication by making existing functionality visible

Usage:
    # Before creating new code, agents should:
    cat src/backend_index.py           # Read this index
    grep -rn "method_name" src/         # Search for existing implementations
    cat src/ARCHITECTURE.md             # Understand layer rules

Note: This file should be updated when new services/utilities are added.
"""

from typing import Dict, List, Any

# =============================================================================
# MANAGER INDEX (External System Interfaces)
# =============================================================================

MANAGER_INDEX: Dict[str, Dict[str, Any]] = {
    "docker": {
        "class": "DockerManager",
        "module": "src.services.docker_manager",
        "purpose": "Docker container lifecycle and service management",
        "key_methods": [
            "initialize() -> bool",
            "is_available() -> bool",
            "validate_service_name(service_name: str) -> tuple[bool, str]",
            "get_container_status(service_name: str) -> ServiceStatus",
            "start_service(service_name: str) -> ActionResult",
            "stop_service(service_name: str) -> ActionResult",
            "get_service_logs(service_name: str) -> LogResult",
            "get_service_info(service_name: str) -> Optional[ServiceInfo]",
            "check_port_conflict(service_name: str) -> Optional[PortConflict]",
        ],
        "use_when": "Managing Docker containers, checking service status, handling port conflicts",
        "dependencies": ["docker client", "compose files"],
        "line_count": 1537,
    },
    "kubernetes": {
        "class": "KubernetesManager",
        "module": "src.services.kubernetes_manager",
        "purpose": "Kubernetes cluster and deployment management",
        "key_methods": [
            "initialize()",
            "add_cluster(name: str, kubeconfig: str) -> KubernetesCluster",
            "list_clusters() -> List[KubernetesCluster]",
            "get_cluster(cluster_id: str) -> Optional[KubernetesCluster]",
            "remove_cluster(cluster_id: str) -> bool",
            "deploy_service(cluster_id: str, service_config: ServiceConfig) -> DeploymentResult",
            "list_pods(cluster_id: str, namespace: str) -> List[Dict]",
            "get_pod_logs(cluster_id: str, pod_name: str, namespace: str) -> str",
            "scale_deployment(cluster_id: str, deployment_name: str, replicas: int)",
            "ensure_namespace_exists(cluster_id: str, namespace: str)",
        ],
        "use_when": "Deploying to Kubernetes, managing clusters, querying pod status",
        "dependencies": ["kubernetes client", "kubeconfig"],
        "line_count": 1505,
    },
    "unode": {
        "class": "UNodeManager",
        "module": "src.services.unode_manager",
        "purpose": "Distributed cluster node management and orchestration",
        "key_methods": [
            "initialize()",
            "create_join_token(role: UNodeRole, permissions: List[str]) -> str",
            "get_bootstrap_script_bash(token: str) -> str",
            "get_bootstrap_script_powershell(token: str) -> str",
            "validate_token(token: str) -> Tuple[bool, Optional[JoinToken], str]",
            "register_unode(registration: UNodeRegistration) -> UNode",
            "process_heartbeat(heartbeat: UNodeHeartbeat) -> bool",
            "get_unode(hostname: str) -> Optional[UNode]",
            "list_unodes(role: Optional[UNodeRole]) -> List[UNode]",
            "upgrade_unode(hostname: str, version: str) -> bool",
        ],
        "use_when": "Managing cluster nodes, generating join scripts, handling node registration",
        "dependencies": ["MongoDB", "Tailscale"],
        "line_count": 1670,
        "notes": "Large file - consider splitting if adding major features",
    },
    "tailscale": {
        "class": "TailscaleManager",
        "module": "src.services.tailscale_manager",
        "purpose": "Tailscale mesh networking configuration and status",
        "key_methods": [
            "get_container_name() -> str",
            "get_container_status() -> ContainerStatus",
            "start_container() -> Dict[str, Any]",
            "stop_container() -> Dict[str, Any]",
            "clear_auth() -> Dict[str, Any]",
            "exec_command(command: str) -> Tuple[int, str, str]",
            "get_status() -> TailscaleStatus",
            "check_authentication() -> bool",
            "configure_serve(ports: List[int])",
        ],
        "use_when": "Configuring Tailscale, checking network status, managing VPN",
        "dependencies": ["Docker", "Tailscale container"],
        "line_count": 1024,
    },
}

# =============================================================================
# BUSINESS SERVICE INDEX (Orchestration & Workflows)
# =============================================================================

SERVICE_INDEX: Dict[str, Dict[str, Any]] = {
    "service_orchestrator": {
        "class": "ServiceOrchestrator",
        "module": "src.services.service_orchestrator",
        "purpose": "Coordinate service lifecycle across platforms (Docker/K8s)",
        "key_methods": [
            "get_service_summary(service_name: str) -> ServiceSummary",
            "start_service(service_name: str, platform: str) -> ActionResult",
            "stop_service(service_name: str, platform: str) -> ActionResult",
            "get_logs(service_name: str, platform: str) -> LogResult",
            "check_health(service_name: str) -> HealthStatus",
        ],
        "use_when": "High-level service operations, multi-platform coordination",
        "dependencies": ["DockerManager", "KubernetesManager"],
        "line_count": 942,
    },
    "deployment_manager": {
        "class": "DeploymentManager",
        "module": "src.services.deployment_manager",
        "purpose": "Multi-platform deployment strategy and execution",
        "key_methods": [
            "deploy(service_config: ServiceConfig, target: DeploymentTarget) -> DeploymentResult",
            "list_deployments(platform: Optional[str]) -> List[Deployment]",
            "get_deployment_status(deployment_id: str) -> DeploymentStatus",
            "rollback_deployment(deployment_id: str) -> bool",
        ],
        "use_when": "Deploying services, managing deployment lifecycle",
        "dependencies": ["deployment_platforms", "service configs"],
        "line_count": 1124,
    },
    "service_config_manager": {
        "class": "ServiceConfigManager",
        "module": "src.services.service_config_manager",
        "purpose": "Service configuration CRUD and validation",
        "key_methods": [
            "get_service_config(service_name: str) -> Optional[ServiceConfig]",
            "list_service_configs() -> List[ServiceConfig]",
            "create_service_config(config: ServiceConfig) -> ServiceConfig",
            "update_service_config(service_name: str, updates: Dict) -> ServiceConfig",
            "delete_service_config(service_name: str) -> bool",
            "validate_config(config: ServiceConfig) -> ValidationResult",
        ],
        "use_when": "Managing service configurations, validating service definitions",
        "dependencies": ["SettingsStore", "YAML files"],
        "line_count": 890,
    },
}

# =============================================================================
# REGISTRY INDEX (In-Memory Lookups - Runtime Registries)
# =============================================================================

REGISTRY_INDEX: Dict[str, Dict[str, Any]] = {
    "compose_registry": {
        "class": "ComposeServiceRegistry",
        "module": "src.services.compose_registry",
        "purpose": "Runtime registry of available Docker Compose services",
        "key_methods": [
            "reload_from_compose_files()",
            "get_service(service_name: str) -> Optional[ComposeService]",
            "list_services() -> List[ComposeService]",
            "filter_by_capability(capability: str) -> List[ComposeService]",
        ],
        "use_when": "Discovering available compose services, querying service capabilities",
        "note": "This IS a runtime registry (loads from compose files at startup)",
    },
    "provider_registry": {
        "class": "ProviderRegistry",
        "module": "src.services.provider_registry",
        "purpose": "Runtime registry of LLM and service providers",
        "key_methods": [
            "get_provider(provider_id: str) -> Optional[Provider]",
            "list_providers() -> List[Provider]",
            "register_provider(provider: Provider)",
        ],
        "use_when": "Accessing provider definitions, listing available providers",
        "note": "This IS a runtime registry (dynamic provider collection)",
    },
}

# =============================================================================
# STORE INDEX (Data Persistence)
# =============================================================================

STORE_INDEX: Dict[str, Dict[str, Any]] = {
    "settings_store": {
        "class": "SettingsStore",
        "module": "src.config.store",
        "purpose": "Persist and retrieve application settings (YAML files)",
        "key_methods": [
            "get(key: str, default: Any) -> Any",
            "set(key: str, value: Any) -> None",
            "delete(key: str) -> bool",
            "save() -> None",
            "reload() -> None",
        ],
        "use_when": "Reading/writing application configuration to disk",
        "dependencies": ["YAML files in config directory"],
    },
    "secret_store": {
        "class": "SecretStore",
        "module": "src.config.secret_store",
        "purpose": "Secure storage and retrieval of sensitive values",
        "key_methods": [
            "get_secret(key: str) -> Optional[str]",
            "set_secret(key: str, value: str) -> None",
            "delete_secret(key: str) -> bool",
        ],
        "use_when": "Managing API keys, passwords, and other secrets",
        "dependencies": ["Encrypted storage backend"],
    },
}

# =============================================================================
# UTILITY INDEX (Pure Functions, Stateless Helpers)
# =============================================================================

UTILITY_INDEX: Dict[str, Dict[str, Any]] = {
    "settings": {
        "functions": [
            "get_settings() -> Settings",
            "infer_value_type(value: str) -> str",
            "infer_setting_type(name: str) -> str",
            "categorize_setting(name: str) -> str",
            "mask_secret_value(value: str, path: str) -> str",
        ],
        "module": "src.config.omegaconf_settings",
        "purpose": "Access OmegaConf settings, type inference, secret masking",
        "use_when": "Reading configuration, inferring types, displaying masked secrets",
    },
    "secrets": {
        "functions": [
            "get_auth_secret_key() -> str",
            "is_secret_key(name: str) -> bool",
            "mask_value(value: str) -> str",
            "mask_if_secret(name: str, value: str) -> str",
            "mask_dict_secrets(data: dict) -> dict",
        ],
        "module": "src.config.secrets",
        "purpose": "Secret key management and value masking",
        "use_when": "Accessing auth secrets, masking sensitive data for logs/UI",
    },
    "logging": {
        "functions": [
            "setup_logging(level: str) -> None",
            "get_logger(name: str) -> logging.Logger",
        ],
        "module": "src.utils.logging",
        "purpose": "Centralized logging configuration",
        "use_when": "Setting up logging for modules",
    },
    "version": {
        "functions": [
            "get_version() -> str",
            "get_git_commit() -> Optional[str]",
        ],
        "module": "src.utils.version",
        "purpose": "Application version and build information",
        "use_when": "Displaying version info, tracking deployments",
    },
    "tailscale_serve": {
        "functions": [
            "get_tailscale_status() -> Dict[str, Any]",
            "is_tailscale_connected() -> bool",
        ],
        "module": "src.utils.tailscale_serve",
        "purpose": "Quick Tailscale connection status checks",
        "use_when": "Checking Tailscale availability without manager overhead",
    },
}

# =============================================================================
# COMMON METHOD PATTERNS (Cross-Service)
# =============================================================================

METHOD_PATTERNS = """
Before creating new methods with these names, check if they already exist:

get_status() / get_container_status():
    - services/docker_manager.py:DockerManager.get_container_status()
    - services/tailscale_manager.py:TailscaleManager.get_container_status()
    - services/deployment_platforms.py:DockerPlatform.get_status()
    - services/deployment_platforms.py:K8sPlatform.get_status()

deploy() / deploy_service():
    - services/deployment_manager.py:DeploymentManager.deploy()
    - services/kubernetes_manager.py:KubernetesManager.deploy_service()
    - services/deployment_platforms.py:*Platform.deploy()

get_logs() / get_service_logs():
    - services/docker_manager.py:DockerManager.get_service_logs()
    - services/kubernetes_manager.py:KubernetesManager.get_pod_logs()
    - services/service_orchestrator.py:ServiceOrchestrator.get_logs()

list_*() methods:
    - services/kubernetes_manager.py:KubernetesManager.list_clusters()
    - services/kubernetes_manager.py:KubernetesManager.list_pods()
    - services/unode_manager.py:UNodeManager.list_unodes()
    - services/service_config_manager.py:ServiceConfigManager.list_service_configs()

start_* / stop_* methods:
    - services/docker_manager.py:DockerManager.start_service() / stop_service()
    - services/tailscale_manager.py:TailscaleManager.start_container() / stop_container()
    - services/service_orchestrator.py:ServiceOrchestrator.start_service() / stop_service()

RECOMMENDATION:
If creating similar functionality, either:
1. Extend existing method if same service
2. Use existing method from another service via composition
3. Create new method only if genuinely different behavior needed
"""

# =============================================================================
# LAYER ARCHITECTURE REFERENCE
# =============================================================================

LAYER_RULES = """
Follow strict layer separation:

┌─────────────┐
│   Router    │  HTTP Layer: Parse requests, call services, return responses
│             │  - Max 30 lines per endpoint
│             │  - Raise HTTPException for errors
│             │  - Use Depends() for services
│             │  - Return Pydantic models
└─────────────┘
      │
      ▼
┌─────────────┐
│   Service   │  Business Logic: Orchestrate, validate, coordinate
│             │  - Return data (not HTTP responses)
│             │  - Raise domain exceptions (ValueError, RuntimeError)
│             │  - Coordinate multiple managers/stores
│             │  - Max 800 lines per file
└─────────────┘
      │
      ▼
┌─────────────┐
│ Store/Mgr   │  Data/External: Persist data, call external APIs
│             │  - Direct DB/file/API access
│             │  - No business logic
│             │  - Return domain objects
└─────────────┘

NEVER SKIP LAYERS unless documented exception in ARCHITECTURE.md
"""

# =============================================================================
# FILE SIZE WARNINGS (Ruff Enforced)
# =============================================================================

FILE_SIZE_LIMITS = {
    "routers": {
        "max_lines": 500,
        "action": "Split by resource domain (e.g., tailscale_setup.py, tailscale_status.py)",
        "violations": ["routers/tailscale.py (1522 lines)", "routers/github_import.py (1130 lines)"],
    },
    "services": {
        "max_lines": 800,
        "action": "Extract helper services or use composition pattern",
        "violations": ["services/unode_manager.py (1670 lines)", "services/docker_manager.py (1537 lines)"],
    },
    "utils": {
        "max_lines": 300,
        "action": "Split into focused utility modules",
        "violations": ["config/yaml_parser.py (591 lines)"],
    },
}

# =============================================================================
# USAGE EXAMPLES
# =============================================================================

USAGE_EXAMPLES = """
# Example 1: Check if method exists before creating
$ grep -rn "async def get_status" src/services/
services/docker_manager.py:145:    async def get_container_status(...)
services/tailscale_manager.py:89:    async def get_container_status(...)
→ Method exists! Reuse it instead of creating new one.

# Example 2: Find which manager handles Docker
$ cat src/backend_index.py | grep -A 5 '"docker"'
→ Shows DockerManager with all available methods

# Example 3: Check layer placement
$ cat src/ARCHITECTURE.md
→ Confirms routers should NOT have business logic

# Example 4: Find utility for masking secrets
$ grep -A 3 '"secrets"' src/backend_index.py
→ Shows mask_value() in src.config.secrets
"""

# =============================================================================
# MAINTENANCE NOTES
# =============================================================================

MAINTENANCE = """
This file should be updated when:
- New managers/services are created
- Major methods are added to existing services
- Service responsibilities change significantly
- Files are split due to size violations

Update frequency: Monthly or when major features are added

Last updated: 2025-01-23 (Initial creation for backend excellence initiative)
"""

if __name__ == "__main__":
    # When run directly, print helpful summary
    print("=" * 80)
    print("BACKEND INDEX - Quick Reference")
    print("=" * 80)
    print(f"\nManagers: {len(MANAGER_INDEX)} available")
    for name, info in MANAGER_INDEX.items():
        print(f"  - {info['class']:30s} ({info['line_count']:4d} lines) - {info['purpose']}")

    print(f"\nBusiness Services: {len(SERVICE_INDEX)} available")
    for name, info in SERVICE_INDEX.items():
        print(f"  - {info['class']:30s} ({info.get('line_count', 0):4d} lines) - {info['purpose']}")

    print(f"\nUtilities: {len(UTILITY_INDEX)} available")
    for name, info in UTILITY_INDEX.items():
        print(f"  - {name:30s} - {info['purpose']}")

    print("\n" + "=" * 80)
    print("Use: grep -A 10 'manager_name' backend_index.py")
    print("     Read: BACKEND_QUICK_REF.md for detailed patterns")
    print("=" * 80)
