"""Compile service definitions into Kubernetes manifests (pure transformation, no I/O)."""

import base64
import os
import re
import yaml
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from src.models.kubernetes import KubernetesDeploymentSpec
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="K8s")


class KubernetesManifestBuilder:
    """
    Stateless compiler: service definition dict → Kubernetes manifest dicts.

    No database access, no cluster API calls, no filesystem writes.
    All methods are pure transformations.
    """

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    async def compile_service_to_k8s(
        self,
        service_def: Dict,
        namespace: str = "default",
        k8s_spec: Optional[KubernetesDeploymentSpec] = None,
    ) -> Dict[str, Dict]:
        """
        Compile a service definition into Kubernetes manifests.

        Pattern (matches friend-lite):
        - ConfigMap  — non-sensitive env vars
        - Secret     — sensitive env vars (KEY, SECRET, PASSWORD, TOKEN, PASS)
        - Deployment — references ConfigMap/Secret via envFrom
        - Service    — NodePort by default
        - Ingress    — optional, when k8s_spec.ingress.enabled is True
        - PVC(s)     — one per Docker volume
        - _volumes_to_seed — internal metadata for bind-mounts that need seeding

        Returns:
            Dict keyed by manifest type. Internal metadata keys are prefixed "_".
        """
        service_id = service_def.get("service_id", "unknown")
        name = service_def.get("name", service_id).lower().replace(" ", "-")
        image = service_def.get("image", "")
        environment = service_def.get("environment", {})
        ports = service_def.get("ports", [])
        volumes = service_def.get("volumes", [])
        command = service_def.get("command")

        image = self._resolve_image_variables(image, environment)

        # K8s labels only allow alphanumeric, '-', '_', '.'
        safe_service_id = service_id.replace(":", "-").replace("/", "-")

        spec = k8s_spec or KubernetesDeploymentSpec()

        container_ports = self._parse_ports(ports)
        config_data, secret_data = self._split_env_vars(environment)
        k8s_volumes, volume_mounts, pvcs_to_create, volumes_to_seed = self._parse_volumes(name, volumes)

        labels = {
            "app.kubernetes.io/name": name,
            "app.kubernetes.io/instance": safe_service_id,
            "app.kubernetes.io/managed-by": "ushadow",
            **spec.labels,
        }

        manifests: Dict[str, Any] = {}

        if config_data:
            manifests["config_map"] = self._config_map(name, namespace, labels, config_data)

        if secret_data:
            manifests["secret"] = self._secret(name, namespace, labels, secret_data)

        # Debug logging
        logger.info(f"Final k8s_volumes list ({len(k8s_volumes)} volumes):")
        for idx, vol in enumerate(k8s_volumes):
            logger.info(f"  [{idx}] {vol}")
        logger.info(f"Final volume_mounts list ({len(volume_mounts)} mounts):")
        for idx, mount in enumerate(volume_mounts):
            logger.info(f"  [{idx}] name={mount['name']}, mountPath={mount['mountPath']}")

        for pvc_info in pvcs_to_create:
            manifests[f"pvc_{pvc_info['volume_name']}"] = self._pvc(
                pvc_info["claim_name"], pvc_info["volume_name"], pvc_info["storage"],
                namespace, labels,
            )

        if volumes_to_seed:
            manifests["_volumes_to_seed"] = volumes_to_seed

        manifests["deployment"] = self._deployment(
            name, namespace, image, spec, safe_service_id, labels,
            container_ports, config_data, secret_data, k8s_volumes, volume_mounts,
            command=command,
        )
        manifests["service"] = self._service(name, namespace, labels, spec, container_ports)

        if spec.ingress and spec.ingress.get("enabled"):
            manifests["ingress"] = self._ingress(name, namespace, labels, spec, container_ports)

        return manifests

    def generate_deployment_config_yaml(self, env_vars: Dict[str, str]) -> str:
        """
        Generate an OmegaConf-compatible deployment-config.yaml from env vars.

        Maps well-known env var names (KEYCLOAK_*, MONGODB_*) to structured YAML.
        """
        cfg: Dict[str, Any] = {}

        keycloak_config: Dict[str, Any] = {}
        keycloak_map = {
            "KEYCLOAK_ENABLED": ("enabled", lambda v: v.lower() in ("true", "1", "yes")),
            "KEYCLOAK_PUBLIC_URL": ("public_url", str),
            "KEYCLOAK_URL": ("url", str),
            "KEYCLOAK_REALM": ("realm", str),
            "KEYCLOAK_FRONTEND_CLIENT_ID": ("frontend_client_id", str),
            "KEYCLOAK_BACKEND_CLIENT_ID": ("backend_client_id", str),
            "KEYCLOAK_ADMIN_USER": ("admin_user", str),
        }
        for env_key, (cfg_key, cast) in keycloak_map.items():
            if env_key in env_vars:
                keycloak_config[cfg_key] = cast(env_vars[env_key])
        if keycloak_config:
            cfg["keycloak"] = keycloak_config

        mongodb_config: Dict[str, Any] = {}
        if "MONGODB_HOST" in env_vars:
            mongodb_config["host"] = env_vars["MONGODB_HOST"]
        if "MONGODB_PORT" in env_vars:
            mongodb_config["port"] = int(env_vars["MONGODB_PORT"])
        if "MONGODB_DATABASE" in env_vars:
            mongodb_config["database"] = env_vars["MONGODB_DATABASE"]
        if mongodb_config:
            cfg.setdefault("infrastructure", {})["mongodb"] = mongodb_config

        if "COMPOSE_PROJECT_NAME" in env_vars:
            cfg.setdefault("environment", {})["name"] = env_vars["COMPOSE_PROJECT_NAME"]

        return yaml.dump(cfg, default_flow_style=False, sort_keys=False)

    # -------------------------------------------------------------------------
    # Private helpers — parsing
    # -------------------------------------------------------------------------

    def _resolve_image_variables(self, image: str, environment: Dict[str, str]) -> str:
        """Expand ${VAR}, ${VAR:-default}, ${VAR-default} in Docker image names."""

        def replace_var(match: re.Match) -> str:
            var_expr = match.group(1)
            if ":-" in var_expr:
                var_name, default = var_expr.split(":-", 1)
            elif "-" in var_expr and not var_expr.startswith("-"):
                var_name, default = var_expr.split("-", 1)
            else:
                var_name, default = var_expr, ""
            return environment.get(var_name) or os.environ.get(var_name) or default

        return re.sub(r"\$\{([^}]+)\}", replace_var, image)

    def _parse_ports(self, ports: List) -> List[Dict]:
        """Parse Docker-style port strings into [{name, port}] dicts."""
        container_ports = []
        for idx, port in enumerate(ports):
            port_str = str(port)
            if not port_str or port_str.lower() in ("none", ""):
                continue
            try:
                port_num = int(port_str.split(":")[-1]) if ":" in port_str else int(port_str)
                port_name = "http" if idx == 0 else f"http-{idx + 1}"
                container_ports.append({"name": port_name, "port": port_num})
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid port format '{port_str}', skipping: {e}")
        return container_ports or [{"name": "http", "port": 8000}]

    def _split_env_vars(self, environment: Dict[str, str]):
        """Split environment vars into (config_data, secret_data) by sensitivity."""
        sensitive_patterns = ("SECRET", "KEY", "PASSWORD", "TOKEN", "PASS")
        config_data: Dict[str, str] = {}
        secret_data: Dict[str, str] = {}
        for key, value in environment.items():
            if any(p in key.upper() for p in sensitive_patterns):
                secret_data[key] = base64.b64encode(value.encode()).decode()
            else:
                config_data[key] = str(value)
        return config_data, secret_data

    def _parse_volumes(self, service_name: str, volumes: List):
        """
        Parse Docker Compose volume definitions into k8s volume/mount/PVC/seed structures.

        Returns:
            (k8s_volumes, volume_mounts, pvcs_to_create, volumes_to_seed)
        """
        volume_mounts: List[Dict] = []
        k8s_volumes: List[Dict] = []
        pvcs_to_create: List[Dict] = []
        volumes_to_seed: List[Dict] = []

        for volume_def in volumes:
            if not isinstance(volume_def, str):
                continue
            parts = volume_def.split(":")
            if len(parts) < 2:
                continue

            source, dest = parts[0], parts[1]
            is_readonly = len(parts) > 2 and "ro" in parts[2]

            source = os.path.expandvars(source)
            source_path = Path(source)
            is_named_volume = not source.startswith(("/", ".")) and "/" not in source

            if is_named_volume:
                volume_name = source.replace("_", "-").replace(".", "-")
                claim_name = f"{service_name}-{volume_name}"
                storage = "10Gi"
            else:
                dest_lower = dest.lower()
                if "config" in dest_lower:
                    volume_name = "ushadow-config"
                    claim_name = "ushadow-config"
                    storage = "1Gi"
                elif "compose" in dest_lower or dest.rstrip("/") == "/compose":
                    volume_name = "ushadow-compose"
                    claim_name = "ushadow-compose"
                    storage = "1Gi"
                else:
                    dest_name = (
                        dest.strip("/").replace("/", "-").replace("_", "-").replace(".", "-")
                        or "data"
                    )
                    volume_name = dest_name
                    claim_name = f"{service_name}-{dest_name}"
                    storage = "10Gi"

                if source_path.exists():
                    volumes_to_seed.append({
                        "source_path": str(source_path.resolve()),
                        "pvc_claim_name": claim_name,
                    })

            if not any(p["claim_name"] == claim_name for p in pvcs_to_create):
                pvcs_to_create.append({
                    "claim_name": claim_name,
                    "volume_name": volume_name,
                    "storage": storage,
                })

            if not any(v.get("name") == volume_name for v in k8s_volumes):
                k8s_volumes.append({
                    "name": volume_name,
                    "persistentVolumeClaim": {"claimName": claim_name},
                })

            volume_mounts.append({
                "name": volume_name,
                "mountPath": dest,
                "readOnly": is_readonly,
            })
            logger.info(f"Volume {source!r} → PVC {claim_name!r} mounted at {dest!r}")

        return k8s_volumes, volume_mounts, pvcs_to_create, volumes_to_seed

    # -------------------------------------------------------------------------
    # Private helpers — manifest builders
    # -------------------------------------------------------------------------

    def _config_map(self, name: str, namespace: str, labels: Dict, data: Dict) -> Dict:
        return {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {"name": f"{name}-config", "namespace": namespace, "labels": labels},
            "data": data,
        }

    def _secret(self, name: str, namespace: str, labels: Dict, data: Dict) -> Dict:
        return {
            "apiVersion": "v1",
            "kind": "Secret",
            "type": "Opaque",
            "metadata": {"name": f"{name}-secrets", "namespace": namespace, "labels": labels},
            "data": data,
        }

    def _pvc(
        self,
        claim_name: str,
        volume_name: str,
        storage: str,
        namespace: str,
        labels: Dict,
    ) -> Dict:
        return {
            "apiVersion": "v1",
            "kind": "PersistentVolumeClaim",
            "metadata": {"name": claim_name, "namespace": namespace, "labels": labels},
            "spec": {
                "accessModes": ["ReadWriteOnce"],
                "resources": {"requests": {"storage": storage}},
            },
        }

    def _deployment(
        self,
        name: str,
        namespace: str,
        image: str,
        spec: KubernetesDeploymentSpec,
        safe_service_id: str,
        labels: Dict,
        container_ports: List[Dict],
        config_data: Dict,
        secret_data: Dict,
        k8s_volumes: List[Dict],
        volume_mounts: List[Dict],
        command: Optional[Union[str, List[str]]] = None,
    ) -> Dict:
        container: Dict[str, Any] = {
            "name": name,
            "image": image,
            "imagePullPolicy": "Always",
            "ports": [
                {"name": p["name"], "containerPort": p["port"], "protocol": "TCP"}
                for p in container_ports
            ],
        }

        if command is not None:
            if isinstance(command, str):
                import shlex
                container["command"] = shlex.split(command)
            else:
                container["command"] = list(command)

        if config_data or secret_data:
            container["envFrom"] = [
                *([ {"configMapRef": {"name": f"{name}-config"}}] if config_data else []),
                *([ {"secretRef":    {"name": f"{name}-secrets"}}] if secret_data else []),
            ]

        if spec.health_check_path is not None:
            probe = {
                "httpGet": {"path": spec.health_check_path or "/health", "port": "http"},
                "failureThreshold": 3,
            }
            container["livenessProbe"] = {**probe, "initialDelaySeconds": 30, "periodSeconds": 60}
            container["readinessProbe"] = {**probe, "initialDelaySeconds": 10, "periodSeconds": 30}

        container["resources"] = spec.resources or {
            "limits": {"cpu": "500m", "memory": "512Mi"},
            "requests": {"cpu": "100m", "memory": "128Mi"},
        }

        if volume_mounts:
            container["volumeMounts"] = volume_mounts

        pod_spec: Dict[str, Any] = {
            "dnsPolicy": spec.dns_policy or "ClusterFirst",
            "dnsConfig": {"options": [{"name": "ndots", "value": "1"}]},
            "containers": [container],
        }
        if k8s_volumes:
            pod_spec["volumes"] = k8s_volumes

        selector_labels = {
            "app.kubernetes.io/name": name,
            "app.kubernetes.io/instance": safe_service_id,
        }

        return {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": name, "namespace": namespace, "labels": labels},
            "spec": {
                "replicas": spec.replicas,
                "selector": {"matchLabels": selector_labels},
                "template": {
                    "metadata": {"labels": selector_labels, "annotations": spec.annotations},
                    "spec": pod_spec,
                },
            },
        }

    def _service(
        self,
        name: str,
        namespace: str,
        labels: Dict,
        spec: KubernetesDeploymentSpec,
        container_ports: List[Dict],
    ) -> Dict:
        return {
            "apiVersion": "v1",
            "kind": "Service",
            "metadata": {"name": name, "namespace": namespace, "labels": labels},
            "spec": {
                "type": spec.service_type,
                "ports": [
                    {"port": p["port"], "targetPort": p["name"], "protocol": "TCP", "name": p["name"]}
                    for p in container_ports
                ],
                "selector": {
                    "app.kubernetes.io/name": name,
                    "app.kubernetes.io/instance": labels["app.kubernetes.io/instance"],
                },
            },
        }

    def _ingress(
        self,
        name: str,
        namespace: str,
        labels: Dict,
        spec: KubernetesDeploymentSpec,
        container_ports: List[Dict],
    ) -> Dict:
        ingress_annotations = {
            "nginx.ingress.kubernetes.io/ssl-redirect": "false",
            "nginx.ingress.kubernetes.io/proxy-body-size": "50m",
            "nginx.ingress.kubernetes.io/cors-allow-origin": "*",
            "nginx.ingress.kubernetes.io/enable-cors": "true",
            **spec.annotations,
        }
        return {
            "apiVersion": "networking.k8s.io/v1",
            "kind": "Ingress",
            "metadata": {
                "name": name,
                "namespace": namespace,
                "labels": labels,
                "annotations": ingress_annotations,
            },
            "spec": {
                "ingressClassName": "nginx",
                "rules": [{
                    "host": spec.ingress.get("host", f"{name}.local"),
                    "http": {
                        "paths": [{
                            "path": spec.ingress.get("path", "/"),
                            "pathType": "Prefix",
                            "backend": {
                                "service": {
                                    "name": name,
                                    "port": {"number": container_ports[0]["port"]},
                                }
                            },
                        }]
                    },
                }],
            },
        }
