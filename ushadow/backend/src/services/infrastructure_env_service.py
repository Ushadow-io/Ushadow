"""Infrastructure environment variable resolution service.

Provides composited env var resolution for any deploy target, merging
three layers (lowest → highest priority):
  1. Compose defaults from docker-compose.infra.yml  (source='default')
  2. Scan results from cluster.infra_scans            (source='infrastructure', locked=True)
  3. Manual overrides from settings store             (source='override', locked=False)

Used by:
- GET /api/deployments/targets/{id}/infrastructure-env-vars endpoint
- settings.py _load_infrastructure_overrides (for service deployment resolution)
"""

import logging
import re
from typing import Any, Dict, List, TYPE_CHECKING

if TYPE_CHECKING:
    from src.models.deploy_target import DeployTarget

logger = logging.getLogger(__name__)

_SECRET_PATTERNS = re.compile(r"KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL", re.IGNORECASE)
_COMPOSE_SUBSTITUTION = re.compile(r"\$\{[^}]+\}")


def _is_secret(name: str) -> bool:
    return bool(_SECRET_PATTERNS.search(name))


def _sanitize_compose_default(value: str) -> str:
    """Strip Docker Compose ${VAR:-default} substitutions, keeping only the literal part."""
    # Replace ${VAR:-default} with the default part, ${VAR} with empty string
    def _replace(m: re.Match) -> str:
        inner = m.group(0)[2:-1]  # strip ${ and }
        if ":-" in inner:
            return inner.split(":-", 1)[1]
        if "-" in inner:
            return inner.split("-", 1)[1]
        return ""
    return _COMPOSE_SUBSTITUTION.sub(_replace, value)


async def resolve_infrastructure_env_vars(
    target: "DeployTarget",
    settings_store,
) -> List[Dict[str, Any]]:
    """
    Resolve infrastructure env vars with source attribution.

    Args:
        target: DeployTarget (k8s or docker)
        settings_store: SettingsStore instance for reading manual overrides

    Returns:
        List of dicts: {name, value, source, locked, is_secret}
        - source='default': value from docker-compose.infra.yml defaults
        - source='infrastructure': value from cluster infrastructure scan (locked)
        - source='override': value from user-saved manual override
        - is_secret: True if value should be masked in the UI
        - value: already masked (••••) if is_secret=True
    """
    from src.services.compose_registry import get_compose_registry
    from src.config.infrastructure_registry import get_infrastructure_registry

    def _entry(name: str, raw_value: str, source: str, locked: bool) -> Dict[str, Any]:
        secret = _is_secret(name)
        if secret and raw_value:
            visible = min(3, len(raw_value))
            display = "•" * min(len(raw_value) - visible, 17) + raw_value[-visible:]
        else:
            display = raw_value
        return {"name": name, "value": display, "source": source, "locked": locked, "is_secret": secret}

    # Track each var: name → {name, value, source, locked, is_secret}
    result: Dict[str, Dict[str, Any]] = {}

    # Layer 1: Compose defaults from docker-compose.infra.yml
    # Sanitize Docker Compose ${VAR:-default} syntax so OmegaConf won't choke if saved.
    compose_registry = get_compose_registry()
    for service in compose_registry.get_services():
        if "infra" not in str(service.compose_file):
            continue
        for env_var in service.required_env_vars + service.optional_env_vars:
            if env_var.has_default and env_var.default_value:
                clean = _sanitize_compose_default(env_var.default_value)
                result[env_var.name] = _entry(env_var.name, clean, "default", False)

    # Layer 2: Scan results from infra_scans (K8s only)
    if target.type == "k8s":
        raw_infra_scans = target.raw_metadata.get("infra_scans") or {}
        registry = get_infrastructure_registry()

        for namespace_scan in raw_infra_scans.values():
            for service_type, service_info in namespace_scan.items():
                if not isinstance(service_info, dict) or not service_info.get("found"):
                    continue
                endpoints = service_info.get("endpoints", [])
                if not endpoints:
                    continue

                endpoint = endpoints[0]
                host, port = endpoint.rsplit(":", 1) if ":" in endpoint else (endpoint, "")
                url = registry.build_url(service_type, endpoint) or f"http://{endpoint}"

                infra_svc = registry.get_service(service_type)
                env_var_names = infra_svc.env_vars if infra_svc else []

                for env_var_name in env_var_names:
                    var_upper = env_var_name.upper()
                    if "HOST" in var_upper and "HOSTNAME" not in var_upper:
                        value = host
                    elif "PORT" in var_upper:
                        value = port
                    elif "URL" in var_upper or "URI" in var_upper:
                        value = url
                    else:
                        continue  # DATABASE, AUTH_SOURCE, USER, PASSWORD — keep compose defaults

                    # Only update if we have a compose default for this var (ensures it's a known var)
                    if env_var_name in result:
                        result[env_var_name] = _entry(env_var_name, value, "infrastructure", True)

    # Layer 3: Manual overrides from settings store
    # Key: cluster name (stable across re-additions) rather than volatile cluster_id hex
    if target.type == "k8s":
        cluster_name = target.name
        overrides: Dict[str, str] = await settings_store.get(f"infrastructure.overrides.{cluster_name}") or {}
        logger.debug(f"[infra-overrides] cluster_name={cluster_name!r}, found {len(overrides)} override keys")
        for name, value in overrides.items():
            if value:
                result[name] = _entry(name, value, "override", False)

    return list(result.values())
