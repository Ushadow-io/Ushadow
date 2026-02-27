"""Kubernetes cluster management and deployment service."""

import base64
import binascii
import hashlib
import logging
import os
import secrets
import tempfile
import yaml
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from cryptography.fernet import Fernet, InvalidToken

from kubernetes import client, config
from kubernetes.client.rest import ApiException
from motor.motor_asyncio import AsyncIOMotorDatabase

from src.models.kubernetes import (
    KubernetesCluster,
    KubernetesClusterCreate,
    KubernetesClusterStatus,
    KubernetesDeploymentSpec,
)
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="K8s")


class KubernetesManager:
    """Manages Kubernetes clusters and deployments."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.clusters_collection = db.kubernetes_clusters
        # Store kubeconfigs in writable directory (configurable via env var)
        kubeconfig_dir_str = os.getenv("KUBECONFIG_DIR", "/app/data/kubeconfigs")
        self._kubeconfig_dir = Path(kubeconfig_dir_str)
        self._kubeconfig_dir.mkdir(parents=True, exist_ok=True)
        # Initialize encryption for kubeconfig files
        self._fernet = self._init_fernet()

    def _init_fernet(self) -> Fernet:
        """Initialize Fernet encryption using app secret key."""
        from src.config.secrets import get_auth_secret_key

        # Derive a 32-byte key from the app secret
        try:
            secret = get_auth_secret_key().encode()
        except ValueError:
            secret = b"default-secret-key"
        key = hashlib.sha256(secret).digest()
        fernet_key = base64.urlsafe_b64encode(key)
        return Fernet(fernet_key)

    def _encrypt_kubeconfig(self, kubeconfig_yaml: str) -> bytes:
        """Encrypt kubeconfig content for storage."""
        return self._fernet.encrypt(kubeconfig_yaml.encode())

    def _decrypt_kubeconfig(self, encrypted_data: bytes) -> str:
        """Decrypt kubeconfig content."""
        return self._fernet.decrypt(encrypted_data).decode()

    async def initialize(self):
        """Initialize indexes."""
        await self.clusters_collection.create_index("cluster_id", unique=True)
        await self.clusters_collection.create_index("context", unique=True)
        logger.info("KubernetesManager initialized")

    async def add_cluster(
        self,
        cluster_data: KubernetesClusterCreate
    ) -> Tuple[bool, Optional[KubernetesCluster], str]:
        """
        Add a new Kubernetes cluster.

        Stores the kubeconfig (encrypted) and validates cluster connectivity.
        """
        temp_kubeconfig_path = None
        try:
            # Decode kubeconfig with proper error handling
            try:
                kubeconfig_yaml = base64.b64decode(cluster_data.kubeconfig).decode('utf-8')
            except (binascii.Error, ValueError) as e:
                return False, None, f"Invalid base64 encoding in kubeconfig: {str(e)}"
            except UnicodeDecodeError as e:
                return False, None, f"Kubeconfig is not valid UTF-8 text: {str(e)}"

            # Generate cluster ID
            cluster_id = secrets.token_hex(8)

            # Validate YAML syntax before proceeding
            try:
                yaml.safe_load(kubeconfig_yaml)
            except yaml.YAMLError as e:
                error_msg = "Invalid YAML in kubeconfig"
                logger.error(f"YAML validation failed: {e}")

                # Try to provide helpful context about the error location
                if hasattr(e, 'problem_mark'):
                    mark = e.problem_mark
                    error_msg += f" at line {mark.line + 1}, column {mark.column + 1}"

                # Add specific problem description
                if hasattr(e, 'problem'):
                    error_msg += f": {e.problem}"

                # Add helpful tips for common issues
                error_details = str(e).lower()
                if "tab" in error_details or "\\t" in error_details:
                    error_msg += ". Tip: Replace tab characters with spaces (YAML doesn't allow tabs)"
                elif ":" in error_details or "colon" in error_details:
                    error_msg += ". Tip: Check that all keys have colons (key: value)"
                elif "indent" in error_details:
                    error_msg += ". Tip: Ensure consistent indentation (use 2 spaces)"

                return False, None, error_msg

            # Write to temp file for validation (kubernetes client needs a file)
            temp_kubeconfig_path = self._kubeconfig_dir / f".tmp_{cluster_id}.yaml"
            temp_kubeconfig_path.write_text(kubeconfig_yaml)
            # Set restrictive permissions on temp file
            os.chmod(temp_kubeconfig_path, 0o600)

            # Load config and extract info
            try:
                kube_config = config.load_kube_config(
                    config_file=str(temp_kubeconfig_path),
                    context=cluster_data.context
                )
            except config.ConfigException as e:
                return False, None, f"Invalid kubeconfig format: {str(e)}"

            # Get cluster info
            api_client = client.ApiClient()
            v1 = client.CoreV1Api(api_client)
            version_api = client.VersionApi(api_client)

            try:
                # Test connection and get cluster info
                version_info = version_api.get_code()
                nodes = v1.list_node()

                # Extract context info from kubeconfig
                contexts, active_context = config.list_kube_config_contexts(
                    config_file=str(temp_kubeconfig_path)
                )
                context_to_use = cluster_data.context or active_context['name']
                context_details = next(c for c in contexts if c['name'] == context_to_use)
                server = context_details['context']['cluster']

                # Encrypt and save kubeconfig permanently
                encrypted_path = self._kubeconfig_dir / f"{cluster_id}.enc"
                encrypted_data = self._encrypt_kubeconfig(kubeconfig_yaml)
                encrypted_path.write_bytes(encrypted_data)
                os.chmod(encrypted_path, 0o600)

                cluster = KubernetesCluster(
                    cluster_id=cluster_id,
                    name=cluster_data.name,
                    context=context_to_use,
                    server=server,
                    status=KubernetesClusterStatus.CONNECTED,
                    version=version_info.git_version,
                    node_count=len(nodes.items),
                    namespace=cluster_data.namespace,
                    labels=cluster_data.labels,
                )

                # Store in database
                await self.clusters_collection.insert_one(cluster.model_dump())

                logger.info(f"Added K8s cluster: {cluster.name} ({cluster.cluster_id})")
                return True, cluster, ""

            except ApiException as e:
                # Clean up encrypted file if it was created
                encrypted_path = self._kubeconfig_dir / f"{cluster_id}.enc"
                if encrypted_path.exists():
                    encrypted_path.unlink()
                return False, None, f"Cannot connect to cluster: {e.reason}"

        except Exception as e:
            logger.error(f"Error adding K8s cluster: {e}")
            return False, None, str(e)

        finally:
            # Always clean up temp file
            if temp_kubeconfig_path and temp_kubeconfig_path.exists():
                temp_kubeconfig_path.unlink()

    async def list_clusters(self) -> List[KubernetesCluster]:
        """List all registered Kubernetes clusters."""
        clusters = []
        async for doc in self.clusters_collection.find():
            clusters.append(KubernetesCluster(**doc))
        return clusters

    async def get_cluster(self, cluster_id: str) -> Optional[KubernetesCluster]:
        """Get a specific cluster by ID."""
        doc = await self.clusters_collection.find_one({"cluster_id": cluster_id})
        if doc:
            return KubernetesCluster(**doc)
        return None

    async def list_nodes(self, cluster_id: str) -> List["KubernetesNode"]:
        """
        List all nodes in a Kubernetes cluster.

        Args:
            cluster_id: The cluster ID

        Returns:
            List of KubernetesNode objects

        Raises:
            ValueError: If cluster not found or API call fails
        """
        from src.models.kubernetes import KubernetesNode

        # Verify cluster exists
        cluster = await self.get_cluster(cluster_id)
        if not cluster:
            raise ValueError(f"Cluster not found: {cluster_id}")

        try:
            core_api, _ = self._get_kube_client(cluster_id)

            # List all nodes
            nodes_list = core_api.list_node()

            k8s_nodes = []
            for node in nodes_list.items:
                # Extract node status
                conditions = node.status.conditions or []
                ready = False
                status = "Unknown"
                for condition in conditions:
                    if condition.type == "Ready":
                        ready = condition.status == "True"
                        status = "Ready" if ready else "NotReady"
                        break

                # Extract node roles from labels
                labels = node.metadata.labels or {}
                roles = []
                if "node-role.kubernetes.io/control-plane" in labels or "node-role.kubernetes.io/master" in labels:
                    roles.append("control-plane")
                if not roles or "node-role.kubernetes.io/worker" in labels:
                    roles.append("worker")

                # Extract addresses
                addresses = node.status.addresses or []
                internal_ip = None
                external_ip = None
                hostname = None
                for addr in addresses:
                    if addr.type == "InternalIP":
                        internal_ip = addr.address
                    elif addr.type == "ExternalIP":
                        external_ip = addr.address
                    elif addr.type == "Hostname":
                        hostname = addr.address

                # Extract node info
                node_info = node.status.node_info
                kubelet_version = node_info.kubelet_version if node_info else None
                os_image = node_info.os_image if node_info else None
                kernel_version = node_info.kernel_version if node_info else None
                container_runtime = node_info.container_runtime_version if node_info else None

                # Extract capacity and allocatable
                capacity = node.status.capacity or {}
                allocatable = node.status.allocatable or {}

                # Extract taints
                taints = []
                for taint in (node.spec.taints or []):
                    taints.append({
                        "key": taint.key,
                        "value": taint.value or "",
                        "effect": taint.effect
                    })

                # Parse GPU extended resources
                gpu_nvidia_raw = capacity.get("nvidia.com/gpu")
                gpu_amd_raw = capacity.get("amd.com/gpu")
                gpu_capacity_nvidia = int(gpu_nvidia_raw) if gpu_nvidia_raw else None
                gpu_capacity_amd = int(gpu_amd_raw) if gpu_amd_raw else None

                k8s_node = KubernetesNode(
                    name=node.metadata.name,
                    cluster_id=cluster_id,
                    status=status,
                    ready=ready,
                    kubelet_version=kubelet_version,
                    os_image=os_image,
                    kernel_version=kernel_version,
                    container_runtime=container_runtime,
                    cpu_capacity=capacity.get("cpu"),
                    memory_capacity=capacity.get("memory"),
                    cpu_allocatable=allocatable.get("cpu"),
                    memory_allocatable=allocatable.get("memory"),
                    gpu_capacity_nvidia=gpu_capacity_nvidia,
                    gpu_capacity_amd=gpu_capacity_amd,
                    roles=roles,
                    internal_ip=internal_ip,
                    external_ip=external_ip,
                    hostname=hostname,
                    taints=taints,
                    labels=labels
                )
                k8s_nodes.append(k8s_node)

            logger.info(f"Listed {len(k8s_nodes)} nodes for cluster {cluster_id}")
            return k8s_nodes

        except Exception as e:
            logger.error(f"Error listing nodes for cluster {cluster_id}: {e}")
            raise ValueError(f"Failed to list nodes: {e}")

    async def update_cluster_infra_scan(
        self,
        cluster_id: str,
        namespace: str,
        scan_results: Dict[str, Dict]
    ) -> bool:
        """
        Update cached infrastructure scan results for a cluster namespace.

        Args:
            cluster_id: The cluster ID
            namespace: The namespace that was scanned
            scan_results: The scan results from scan_cluster_for_infra_services

        Returns:
            True if update was successful
        """
        try:
            result = await self.clusters_collection.update_one(
                {"cluster_id": cluster_id},
                {"$set": {f"infra_scans.{namespace}": scan_results}}
            )
            return result.modified_count > 0 or result.matched_count > 0
        except Exception as e:
            logger.error(f"Error updating cluster infra scan: {e}")
            return False

    async def delete_cluster_infra_scan(
        self,
        cluster_id: str,
        namespace: str
    ) -> bool:
        """
        Delete cached infrastructure scan for a specific namespace.

        Args:
            cluster_id: The cluster ID
            namespace: The namespace scan to delete

        Returns:
            True if deletion was successful
        """
        try:
            result = await self.clusters_collection.update_one(
                {"cluster_id": cluster_id},
                {"$unset": {f"infra_scans.{namespace}": ""}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error deleting cluster infra scan: {e}")
            return False

    async def update_cluster(
        self,
        cluster_id: str,
        updates: Dict[str, Any]
    ) -> Optional[KubernetesCluster]:
        """Update cluster configuration fields."""
        try:
            # Validate cluster exists
            cluster = await self.get_cluster(cluster_id)
            if not cluster:
                return None

            # Update MongoDB document
            result = await self.clusters_collection.update_one(
                {"cluster_id": cluster_id},
                {"$set": updates}
            )

            if result.modified_count == 0 and result.matched_count == 0:
                return None

            # Return updated cluster
            return await self.get_cluster(cluster_id)
        except Exception as e:
            logger.error(f"Error updating cluster: {e}")
            return None

    async def remove_cluster(self, cluster_id: str) -> bool:
        """Remove a cluster and its kubeconfig."""
        # Delete encrypted kubeconfig file
        encrypted_path = self._kubeconfig_dir / f"{cluster_id}.enc"
        if encrypted_path.exists():
            encrypted_path.unlink()

        # Also clean up legacy unencrypted file if it exists
        legacy_path = self._kubeconfig_dir / f"{cluster_id}.yaml"
        if legacy_path.exists():
            legacy_path.unlink()

        # Delete from database
        result = await self.clusters_collection.delete_one({"cluster_id": cluster_id})
        return result.deleted_count > 0

    def _get_kube_client(self, cluster_id: str) -> Tuple[client.CoreV1Api, client.AppsV1Api]:
        """Get Kubernetes API clients for a cluster."""
        encrypted_path = self._kubeconfig_dir / f"{cluster_id}.enc"
        legacy_path = self._kubeconfig_dir / f"{cluster_id}.yaml"

        # Try encrypted file first, fall back to legacy unencrypted
        if encrypted_path.exists():
            try:
                encrypted_data = encrypted_path.read_bytes()
                kubeconfig_yaml = self._decrypt_kubeconfig(encrypted_data)

                # Write to temp file for kubernetes client
                temp_path = self._kubeconfig_dir / f".tmp_{cluster_id}.yaml"
                temp_path.write_text(kubeconfig_yaml)
                os.chmod(temp_path, 0o600)

                try:
                    config.load_kube_config(config_file=str(temp_path))
                    return client.CoreV1Api(), client.AppsV1Api()
                finally:
                    # Clean up temp file
                    if temp_path.exists():
                        temp_path.unlink()

            except InvalidToken:
                raise ValueError(f"Failed to decrypt kubeconfig for cluster {cluster_id}")

        elif legacy_path.exists():
            # Support legacy unencrypted files
            logger.warning(f"Using unencrypted kubeconfig for cluster {cluster_id}")
            config.load_kube_config(config_file=str(legacy_path))
            return client.CoreV1Api(), client.AppsV1Api()

        else:
            raise FileNotFoundError(f"Kubeconfig not found for cluster {cluster_id}")

    async def run_kubectl_command(self, cluster_id: str, command: str) -> str:
        """
        Run kubectl command for a cluster.

        Args:
            cluster_id: The cluster ID
            command: kubectl command (without 'kubectl' prefix)

        Returns:
            Command output as string

        Raises:
            Exception: If command fails
        """
        import subprocess

        encrypted_path = self._kubeconfig_dir / f"{cluster_id}.enc"
        legacy_path = self._kubeconfig_dir / f"{cluster_id}.yaml"

        # Get kubeconfig path
        temp_path = None
        try:
            # Try encrypted file first
            if encrypted_path.exists():
                encrypted_data = encrypted_path.read_bytes()
                kubeconfig_yaml = self._decrypt_kubeconfig(encrypted_data)

                # Write to temp file
                temp_path = self._kubeconfig_dir / f".tmp_kubectl_{cluster_id}.yaml"
                temp_path.write_text(kubeconfig_yaml)
                os.chmod(temp_path, 0o600)
                kubeconfig_file = str(temp_path)

            elif legacy_path.exists():
                kubeconfig_file = str(legacy_path)
            else:
                raise FileNotFoundError(f"Kubeconfig not found for cluster {cluster_id}")

            # Run kubectl command
            cmd = f"kubectl --kubeconfig={kubeconfig_file} {command}"
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                check=True
            )

            return result.stdout

        except subprocess.CalledProcessError as e:
            logger.error(f"kubectl command failed: {e.stderr}")
            raise Exception(f"kubectl command failed: {e.stderr}")
        finally:
            # Clean up temp file
            if temp_path and temp_path.exists():
                temp_path.unlink()

    def _resolve_image_variables(self, image: str, environment: Dict[str, str]) -> str:
        """
        Resolve environment variables in Docker image names.

        Handles Docker Compose variable syntax like:
        - ${VAR}
        - ${VAR:-default}
        - ${VAR-default}

        Args:
            image: Image name possibly containing variables
            environment: Environment variables to use for resolution

        Returns:
            Resolved image name
        """
        import re

        def replace_var(match):
            var_expr = match.group(1)

            # Handle ${VAR:-default} or ${VAR-default}
            if ":-" in var_expr:
                var_name, default = var_expr.split(":-", 1)
            elif "-" in var_expr and not var_expr.startswith("-"):
                var_name, default = var_expr.split("-", 1)
            else:
                var_name = var_expr
                default = ""

            # Look up in environment, fall back to OS env, then default
            value = environment.get(var_name) or os.environ.get(var_name) or default
            return value

        # Replace ${...} patterns
        resolved = re.sub(r'\$\{([^}]+)\}', replace_var, image)
        return resolved

    async def compile_service_to_k8s(
        self,
        service_def: Dict,
        namespace: str = "default",
        k8s_spec: Optional[KubernetesDeploymentSpec] = None
    ) -> Dict[str, Dict]:
        """
        Compile a ServiceDefinition into Kubernetes manifests.

        Matches your friend-lite pattern:
        - Separate ConfigMap for non-sensitive env vars
        - Separate Secret for sensitive env vars (keys, passwords, tokens)
        - Deployment with envFrom referencing both
        - Service (NodePort by default for easy access)
        - Optional Ingress

        Returns dict with keys: deployment, service, config_map, secret, ingress
        """
        service_id = service_def.get("service_id", "unknown")
        name = service_def.get("name", service_id).lower().replace(" ", "-")
        image = service_def.get("image", "")
        environment = service_def.get("environment", {})
        ports = service_def.get("ports", [])
        volumes = service_def.get("volumes", [])

        # Resolve any environment variables in the image name
        image = self._resolve_image_variables(image, environment)

        # Sanitize service_id for use as Kubernetes label value
        # K8s labels can only contain alphanumeric, '-', '_', '.'
        # Replace colons and other invalid chars with hyphens
        safe_service_id = service_id.replace(":", "-").replace("/", "-")

        # Use provided spec or defaults
        spec = k8s_spec or KubernetesDeploymentSpec()

        # Parse ports (Docker format: "8080:8080" or "8080")
        # Support multiple ports with unique names
        container_ports = []
        if ports:
            for idx, port in enumerate(ports):
                port_str = str(port)
                # Skip if port is None or empty
                if not port_str or port_str.lower() in ('none', ''):
                    continue

                try:
                    if ":" in port_str:
                        _, port_num = port_str.split(":", 1)
                        port_num = int(port_num)
                    else:
                        port_num = int(port_str)

                    # Generate unique port name (http, http-2, http-3, etc.)
                    port_name = "http" if idx == 0 else f"http-{idx + 1}"
                    container_ports.append({
                        "name": port_name,
                        "port": port_num
                    })
                except (ValueError, TypeError) as e:
                    logger.warning(f"Invalid port format '{port_str}', skipping: {e}")

        # Default to port 8000 if no valid ports found
        if not container_ports:
            container_ports = [{"name": "http", "port": 8000}]

        # Separate sensitive from non-sensitive env vars
        # Pattern: anything with SECRET, KEY, PASSWORD, TOKEN in name
        sensitive_patterns = ('SECRET', 'KEY', 'PASSWORD', 'TOKEN', 'PASS')
        config_data = {}
        secret_data = {}

        for key, value in environment.items():
            if any(pattern in key.upper() for pattern in sensitive_patterns):
                # Base64 encode for Secret
                import base64
                secret_data[key] = base64.b64encode(value.encode()).decode()
            else:
                config_data[key] = str(value)

        # Parse volumes - every Docker volume becomes a PVC.
        # Bind-mount volumes are seeded from local paths on deploy.
        # Volumes can be:
        #   - Named volumes: "volume_name:/container/path" (create service-scoped PVC)
        #   - Bind mounts: "/host/path:/container/path:ro" or "${VAR}/path:/container/path"
        #     - Well-known shared volumes (config, compose) use fixed PVC names
        #     - Other bind mounts use service-scoped PVC names
        volume_mounts = []    # Volume mounts for container
        k8s_volumes = []      # Volume definitions for pod
        pvcs_to_create = []   # {claim_name, volume_name, storage} PVCs to create
        volumes_to_seed = []  # {source_path, pvc_claim_name} bind-mounts to seed on deploy

        for volume_def in volumes:
            if not isinstance(volume_def, str):
                continue
            parts = volume_def.split(":")
            if len(parts) < 2:
                continue

            source, dest = parts[0], parts[1]
            is_readonly = len(parts) > 2 and 'ro' in parts[2]

            # Resolve environment variables in source path
            import os
            source = os.path.expandvars(source)

            # Named volume: simple name without "/" or "." (e.g., "chronicle_audio")
            from pathlib import Path
            source_path = Path(source)
            is_named_volume = not source.startswith(('/', '.')) and '/' not in source

            if is_named_volume:
                # Named volume → service-scoped PVC
                volume_name = source.replace("_", "-").replace(".", "-")
                claim_name = f"{name}-{volume_name}"
                storage = "10Gi"
            else:
                # Bind mount → PVC with seeding
                # Well-known shared volumes use fixed claim names so all services share them.
                # Other bind mounts get service-scoped names derived from destination path.
                dest_lower = dest.lower()
                if "config" in dest_lower:
                    # All services share one config PVC (e.g., ../config:/app/config:ro)
                    volume_name = "ushadow-config"
                    claim_name = "ushadow-config"
                    storage = "1Gi"
                elif "compose" in dest_lower or dest.rstrip("/") == "/compose":
                    # Compose files shared PVC
                    volume_name = "ushadow-compose"
                    claim_name = "ushadow-compose"
                    storage = "1Gi"
                else:
                    # Service-specific bind mount: derive name from destination
                    dest_name = dest.strip("/").replace("/", "-").replace("_", "-").replace(".", "-") or "data"
                    volume_name = dest_name
                    claim_name = f"{name}-{dest_name}"
                    storage = "10Gi"

                # Track for seeding if source exists locally
                if source_path.exists():
                    volumes_to_seed.append({
                        "source_path": str(source_path.resolve()),
                        "pvc_claim_name": claim_name,
                    })

            # Add PVC manifest (skip if already added for shared volumes)
            if not any(p["claim_name"] == claim_name for p in pvcs_to_create):
                pvcs_to_create.append({
                    "claim_name": claim_name,
                    "volume_name": volume_name,
                    "storage": storage,
                })

            # Add pod volume reference (skip if already added for shared volumes)
            if not any(v.get("name") == volume_name for v in k8s_volumes):
                k8s_volumes.append({
                    "name": volume_name,
                    "persistentVolumeClaim": {
                        "claimName": claim_name,
                    },
                })

            volume_mounts.append({
                "name": volume_name,
                "mountPath": dest,
                "readOnly": is_readonly,
            })
            logger.info(f"Volume {source!r} → PVC {claim_name!r} mounted at {dest!r}")

        # Generate manifests matching friend-lite pattern
        labels = {
            "app.kubernetes.io/name": name,
            "app.kubernetes.io/instance": safe_service_id,
            "app.kubernetes.io/managed-by": "ushadow",
            **spec.labels
        }

        manifests = {}

        # ConfigMap (if non-sensitive vars exist)
        if config_data:
            manifests["config_map"] = {
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {
                    "name": f"{name}-config",
                    "namespace": namespace,
                    "labels": labels
                },
                "data": config_data
            }

        # Secret (if sensitive vars exist)
        if secret_data:
            manifests["secret"] = {
                "apiVersion": "v1",
                "kind": "Secret",
                "type": "Opaque",
                "metadata": {
                    "name": f"{name}-secrets",
                    "namespace": namespace,
                    "labels": labels
                },
                "data": secret_data
            }

        # TODO: Add deployment-config.yaml volume mount once ConfigMap generation is deployed
        # Temporarily disabled - requires full implementation in get_or_create_envmap
        # if config_data:
        #     # Add volume for deployment config
        #     if not any(v.get("name") == "deployment-config" for v in k8s_volumes):
        #         k8s_volumes.append({
        #             "name": "deployment-config",
        #             "configMap": {
        #                 "name": f"{name}-config",
        #                 "items": [{
        #                     "key": "deployment-config.yaml",
        #                     "path": "deployment-config.yaml"
        #                 }]
        #             }
        #         })
        #         logger.info(f"Added deployment-config volume from {name}-config ConfigMap")
        #
        #     # Add volume mount for deployment config
        #     if not any(m.get("name") == "deployment-config" for m in volume_mounts):
        #         volume_mounts.append({
        #             "name": "deployment-config",
        #             "mountPath": "/app/config/deployment-config.yaml",
        #             "subPath": "deployment-config.yaml",
        #             "readOnly": True
        #         })
        #         logger.info("Added deployment-config.yaml volume mount at /app/config/deployment-config.yaml")

        # Debug: Log volumes before creating deployment
        logger.info(f"Final k8s_volumes list ({len(k8s_volumes)} volumes):")
        for idx, vol in enumerate(k8s_volumes):
            logger.info(f"  [{idx}] {vol}")
        logger.info(f"Final volume_mounts list ({len(volume_mounts)} mounts):")
        for idx, mount in enumerate(volume_mounts):
            logger.info(f"  [{idx}] name={mount['name']}, mountPath={mount['mountPath']}")

        # PersistentVolumeClaims for all volumes
        for pvc_info in pvcs_to_create:
            claim_name = pvc_info["claim_name"]
            volume_name = pvc_info["volume_name"]
            logger.info(f"Creating PVC manifest: {claim_name!r}")
            manifests[f"pvc_{volume_name}"] = {
                "apiVersion": "v1",
                "kind": "PersistentVolumeClaim",
                "metadata": {
                    "name": claim_name,
                    "namespace": namespace,
                    "labels": labels,
                },
                "spec": {
                    "accessModes": ["ReadWriteOnce"],
                    "resources": {
                        "requests": {
                            "storage": pvc_info["storage"],
                        }
                    },
                },
            }

        # Seed metadata: bind-mount volumes that need populating on deploy
        if volumes_to_seed:
            manifests["_volumes_to_seed"] = volumes_to_seed

        # Deployment
        manifests["deployment"] = {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {
                "name": name,
                "namespace": namespace,
                "labels": labels
            },
            "spec": {
                "replicas": spec.replicas,
                "selector": {
                    "matchLabels": {
                        "app.kubernetes.io/name": name,
                        "app.kubernetes.io/instance": safe_service_id
                    }
                },
                "template": {
                    "metadata": {
                        "labels": {
                            "app.kubernetes.io/name": name,
                            "app.kubernetes.io/instance": safe_service_id
                        },
                        "annotations": spec.annotations
                    },
                    "spec": {
                        # Use ClusterFirst for K8s service DNS resolution
                        "dnsPolicy": spec.dns_policy or "ClusterFirst",
                        # Fix ndots:5 breaking uv/Rust DNS while keeping ClusterFirst
                        # See: docs/IPV6_DNS_FIX.md for why ndots:1 is needed for uv
                        "dnsConfig": {
                            "options": [
                                {"name": "ndots", "value": "1"}
                            ]
                        },
                        "containers": [{
                            "name": name,
                            "image": image,
                            "imagePullPolicy": "Always",
                            "ports": [
                                {
                                    "name": port_info["name"],
                                    "containerPort": port_info["port"],
                                    "protocol": "TCP"
                                }
                                for port_info in container_ports
                            ],
                            # Use envFrom like friend-lite pattern
                            **({"envFrom": [
                                *([{"configMapRef": {"name": f"{name}-config"}}] if config_data else []),
                                *([{"secretRef": {"name": f"{name}-secrets"}}] if secret_data else [])
                            ]} if (config_data or secret_data) else {}),
                            # Only add health probes if health_check_path is provided
                            **({
                                "livenessProbe": {
                                    "httpGet": {
                                        "path": spec.health_check_path or "/health",
                                        "port": "http"
                                    },
                                    "initialDelaySeconds": 30,
                                    "periodSeconds": 60,
                                    "failureThreshold": 3
                                },
                                "readinessProbe": {
                                    "httpGet": {
                                        "path": spec.health_check_path or "/health",
                                        "port": "http"
                                    },
                                    "initialDelaySeconds": 10,
                                    "periodSeconds": 30,
                                    "failureThreshold": 3
                                }
                            } if spec.health_check_path is not None else {}),
                            **({"resources": spec.resources} if spec.resources else {
                                "resources": {
                                    "limits": {"cpu": "500m", "memory": "512Mi"},
                                    "requests": {"cpu": "100m", "memory": "128Mi"}
                                }
                            }),
                            # Add volumeMounts if any volumes are defined
                            **({"volumeMounts": volume_mounts} if volume_mounts else {})
                        }],
                        # Add volumes to pod spec if any are defined
                        **({"volumes": k8s_volumes} if k8s_volumes else {})
                    }
                }
            }
        }

        # Service (NodePort by default, matching friend-lite pattern)
        # Create service ports for each container port
        service_ports = [
            {
                "port": port_info["port"],
                "targetPort": port_info["name"],
                "protocol": "TCP",
                "name": port_info["name"]
            }
            for port_info in container_ports
        ]

        manifests["service"] = {
            "apiVersion": "v1",
            "kind": "Service",
            "metadata": {
                "name": name,
                "namespace": namespace,
                "labels": labels
            },
            "spec": {
                "type": spec.service_type,
                "ports": service_ports,
                "selector": {
                    "app.kubernetes.io/name": name,
                    "app.kubernetes.io/instance": safe_service_id
                }
            }
        }

        # Ingress (if specified in k8s_spec)
        if spec.ingress and spec.ingress.get("enabled"):
            # Match friend-lite ingress annotations
            ingress_annotations = {
                "nginx.ingress.kubernetes.io/ssl-redirect": "false",
                "nginx.ingress.kubernetes.io/proxy-body-size": "50m",
                "nginx.ingress.kubernetes.io/cors-allow-origin": "*",
                "nginx.ingress.kubernetes.io/enable-cors": "true",
                **spec.annotations
            }

            manifests["ingress"] = {
                "apiVersion": "networking.k8s.io/v1",
                "kind": "Ingress",
                "metadata": {
                    "name": name,
                    "namespace": namespace,
                    "labels": labels,
                    "annotations": ingress_annotations
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
                                        "port": {"number": container_ports[0]["port"]}
                                    }
                                }
                            }]
                        }
                    }]
                }
            }

        return manifests

    async def ensure_namespace_exists(
        self,
        cluster_id: str,
        namespace: str
    ) -> bool:
        """
        Ensure a namespace exists in the cluster, creating it if necessary.

        Returns True if namespace exists or was created successfully.
        """
        import asyncio

        try:
            logger.info(f"Getting K8s client for cluster {cluster_id}...")
            core_api, _ = self._get_kube_client(cluster_id)
            logger.info(f"K8s client obtained successfully")

            # Check if namespace exists (run in executor to avoid blocking)
            try:
                logger.info(f"Checking if namespace {namespace} exists...")
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    core_api.read_namespace,
                    namespace
                )
                logger.info(f"Namespace {namespace} already exists")
                return True
            except ApiException as e:
                logger.info(f"Namespace check failed with status {e.status}: {e.reason}")
                if e.status == 404:
                    # Namespace doesn't exist, create it
                    logger.info(f"Namespace {namespace} not found, creating...")
                    namespace_manifest = {
                        "apiVersion": "v1",
                        "kind": "Namespace",
                        "metadata": {
                            "name": namespace,
                            "labels": {
                                "app.kubernetes.io/managed-by": "ushadow"
                            }
                        }
                    }
                    await asyncio.get_event_loop().run_in_executor(
                        None,
                        core_api.create_namespace,
                        namespace_manifest
                    )
                    logger.info(f"Created namespace {namespace}")
                    return True
                else:
                    # Some other error occurred
                    logger.error(f"API error checking namespace: status={e.status}, reason={e.reason}")
                    raise

        except ApiException as e:
            logger.error(f"K8s API exception in ensure_namespace_exists: {e}")
            logger.error(f"Status: {e.status}, Reason: {e.reason}")
            if hasattr(e, 'body'):
                logger.error(f"Body: {e.body}")
            raise
        except Exception as e:
            logger.error(f"Error ensuring namespace exists: {type(e).__name__}: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise

    async def scan_cluster_for_infra_services(
        self,
        cluster_id: str,
        namespace: str = "ushadow"
    ) -> Dict[str, Dict]:
        """
        Scan a Kubernetes cluster for running infrastructure services.

        Looks for common infra services: mongo, redis, postgres, qdrant, neo4j.
        Scans across multiple common namespaces (default, kube-system, infra, target namespace).
        Returns dict mapping service_name -> {found: bool, endpoints: [], type: str, namespace: str}
        """
        try:
            core_api, _ = self._get_kube_client(cluster_id)

            # Infrastructure services we look for
            infra_services = {
                "mongo": {"names": ["mongo", "mongodb"], "port": 27017},
                "redis": {"names": ["redis"], "port": 6379},
                "postgres": {"names": ["postgres", "postgresql"], "port": 5432},
                "qdrant": {"names": ["qdrant"], "port": 6333},
                "neo4j": {"names": ["neo4j"], "port": 7687},
                "keycloak": {"names": ["keycloak"], "port": 8080}
            }

            # Common namespaces where infrastructure might be deployed
            # Check target namespace first, then common infra namespaces
            namespaces_to_scan = [namespace, "default", "kube-system", "infra", "infrastructure"]
            # Remove duplicates while preserving order
            namespaces_to_scan = list(dict.fromkeys(namespaces_to_scan))

            results = {}

            # Scan each namespace for infrastructure services
            for ns in namespaces_to_scan:
                try:
                    services = core_api.list_namespaced_service(namespace=ns)
                except ApiException:
                    # Namespace might not exist, skip it
                    continue

                # Check each infra service
                for infra_name, config in infra_services.items():
                    # Skip if we already found this service in a previous namespace
                    if results.get(infra_name, {}).get("found"):
                        continue

                    for svc in services.items:
                        svc_name_lower = svc.metadata.name.lower()

                        # Match by name patterns
                        if any(pattern in svc_name_lower for pattern in config["names"]):
                            # Found it! Extract connection info
                            endpoints = []
                            ports = [p.port for p in svc.spec.ports]

                            # Build connection strings using the actual namespace where service was found
                            for port in ports:
                                if svc.spec.type == "ClusterIP":
                                    endpoints.append(f"{svc.metadata.name}.{ns}.svc.cluster.local:{port}")
                                elif svc.spec.type == "NodePort":
                                    endpoints.append(f"<node-ip>:{port}")
                                elif svc.spec.type == "LoadBalancer":
                                    if svc.status.load_balancer.ingress:
                                        lb_ip = svc.status.load_balancer.ingress[0].ip
                                        endpoints.append(f"{lb_ip}:{port}")

                            results[infra_name] = {
                                "found": True,
                                "endpoints": endpoints,
                                "type": infra_name,
                                "namespace": ns,  # Track which namespace it was found in
                                "default_port": config["port"]
                            }
                            break  # Found this service, move to next infra type

            # Fill in "not found" for any missing services
            for infra_name in infra_services.keys():
                if infra_name not in results:
                    results[infra_name] = {
                        "found": False,
                        "endpoints": [],
                        "type": infra_name,
                        "namespace": None,
                        "default_port": infra_services[infra_name]["port"]
                    }

            return results

        except Exception as e:
            logger.error(f"Error scanning cluster for infra services: {e}")
            return {name: {"found": False, "endpoints": [], "type": name, "error": str(e)}
                    for name in ["mongo", "redis", "postgres", "qdrant", "neo4j"]}

    async def list_pods(self, cluster_id: str, namespace: str = "ushadow") -> List[Dict[str, Any]]:
        """
        List all pods in a namespace.

        Returns list of pods with name, status, restarts, age, and labels.
        """
        try:
            core_api, _ = self._get_kube_client(cluster_id)
            pods_list = core_api.list_namespaced_pod(namespace=namespace)

            pods = []
            for pod in pods_list.items:
                # Get pod status
                status = "Unknown"
                restarts = 0
                if pod.status.container_statuses:
                    # Count total restarts
                    restarts = sum(cs.restart_count for cs in pod.status.container_statuses)

                    # Determine overall status
                    if pod.status.phase == "Running":
                        all_ready = all(cs.ready for cs in pod.status.container_statuses)
                        status = "Running" if all_ready else "Starting"
                    else:
                        status = pod.status.phase

                    # Check for specific error states
                    for cs in pod.status.container_statuses:
                        if cs.state.waiting:
                            status = cs.state.waiting.reason or "Waiting"
                        elif cs.state.terminated:
                            status = cs.state.terminated.reason or "Terminated"
                else:
                    status = pod.status.phase or "Pending"

                # Calculate age
                age = ""
                if pod.metadata.creation_timestamp:
                    from datetime import datetime, timezone
                    age_seconds = (datetime.now(timezone.utc) - pod.metadata.creation_timestamp).total_seconds()
                    if age_seconds < 60:
                        age = f"{int(age_seconds)}s"
                    elif age_seconds < 3600:
                        age = f"{int(age_seconds / 60)}m"
                    elif age_seconds < 86400:
                        age = f"{int(age_seconds / 3600)}h"
                    else:
                        age = f"{int(age_seconds / 86400)}d"

                pods.append({
                    "name": pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                    "status": status,
                    "restarts": restarts,
                    "age": age,
                    "labels": pod.metadata.labels or {},
                    "node": pod.spec.node_name or "N/A"
                })

            return pods

        except ApiException as e:
            logger.error(f"Failed to list pods: {e}")
            raise Exception(f"Failed to list pods: {e.reason}")
        except Exception as e:
            logger.error(f"Error listing pods: {e}")
            raise

    async def get_pod_logs(
        self,
        cluster_id: str,
        pod_name: str,
        namespace: str = "ushadow",
        previous: bool = False,
        tail_lines: int = 100
    ) -> str:
        """
        Get logs from a pod.

        Args:
            cluster_id: The cluster ID
            pod_name: Name of the pod
            namespace: Kubernetes namespace
            previous: Get logs from previous (crashed) container
            tail_lines: Number of lines to return from end of logs

        Returns:
            Pod logs as a string
        """
        try:
            core_api, _ = self._get_kube_client(cluster_id)

            logs = core_api.read_namespaced_pod_log(
                name=pod_name,
                namespace=namespace,
                previous=previous,
                tail_lines=tail_lines
            )

            return logs

        except ApiException as e:
            if e.status == 404:
                raise Exception(f"Pod '{pod_name}' not found in namespace '{namespace}'")
            elif e.status == 400:
                # Pod might not have started yet or logs not available
                raise Exception(f"Logs not available for pod '{pod_name}': {e.reason}")
            else:
                logger.error(f"Failed to get pod logs: {e}")
                raise Exception(f"Failed to get pod logs: {e.reason}")
        except Exception as e:
            logger.error(f"Error getting pod logs: {e}")
            raise

    async def get_pod_events(
        self,
        cluster_id: str,
        pod_name: str,
        namespace: str = "ushadow"
    ) -> List[Dict[str, Any]]:
        """
        Get events for a specific pod.

        This is useful for debugging why a pod won't start.
        Shows events like ImagePullBackOff, CrashLoopBackOff, etc.

        Returns:
            List of events with type, reason, message, and timestamp
        """
        try:
            core_api, _ = self._get_kube_client(cluster_id)

            # Get events for this pod
            field_selector = f"involvedObject.name={pod_name},involvedObject.namespace={namespace}"
            events_list = core_api.list_namespaced_event(
                namespace=namespace,
                field_selector=field_selector
            )

            events = []
            for event in events_list.items:
                events.append({
                    "type": event.type,  # Normal, Warning, Error
                    "reason": event.reason,  # BackOff, Failed, Pulled, etc.
                    "message": event.message,
                    "count": event.count,
                    "first_timestamp": event.first_timestamp.isoformat() if event.first_timestamp else None,
                    "last_timestamp": event.last_timestamp.isoformat() if event.last_timestamp else None,
                })

            # Sort by last timestamp, most recent first
            events.sort(key=lambda e: e["last_timestamp"] or "", reverse=True)

            return events

        except ApiException as e:
            logger.error(f"Failed to get pod events: {e}")
            raise Exception(f"Failed to get pod events: {e.reason}")
        except Exception as e:
            logger.error(f"Error getting pod events: {e}")
            raise

    def _generate_deployment_config_yaml(self, env_vars: Dict[str, str]) -> str:
        """
        Generate deployment-specific config.yaml from environment variables.

        This creates an OmegaConf-compatible YAML config that maps env vars
        to structured settings, allowing each deployment to have independent config.

        Args:
            env_vars: Environment variables from deployment

        Returns:
            YAML string with deployment configuration
        """
        import yaml

        config = {
            "# Deployment-specific configuration": None,
            "# Auto-generated from environment variables": None,
        }

        # Map Keycloak env vars to config structure
        keycloak_config = {}
        if 'KEYCLOAK_ENABLED' in env_vars:
            keycloak_config['enabled'] = env_vars['KEYCLOAK_ENABLED'].lower() in ('true', '1', 'yes')
        if 'KEYCLOAK_PUBLIC_URL' in env_vars:
            keycloak_config['public_url'] = env_vars['KEYCLOAK_PUBLIC_URL']
        if 'KEYCLOAK_URL' in env_vars:
            keycloak_config['url'] = env_vars['KEYCLOAK_URL']
        if 'KEYCLOAK_REALM' in env_vars:
            keycloak_config['realm'] = env_vars['KEYCLOAK_REALM']
        if 'KEYCLOAK_FRONTEND_CLIENT_ID' in env_vars:
            keycloak_config['frontend_client_id'] = env_vars['KEYCLOAK_FRONTEND_CLIENT_ID']
        if 'KEYCLOAK_BACKEND_CLIENT_ID' in env_vars:
            keycloak_config['backend_client_id'] = env_vars['KEYCLOAK_BACKEND_CLIENT_ID']
        if 'KEYCLOAK_ADMIN_USER' in env_vars:
            keycloak_config['admin_user'] = env_vars['KEYCLOAK_ADMIN_USER']

        if keycloak_config:
            config['keycloak'] = keycloak_config

        # Map MongoDB env vars to config structure
        mongodb_config = {}
        if 'MONGODB_HOST' in env_vars:
            mongodb_config['host'] = env_vars['MONGODB_HOST']
        if 'MONGODB_PORT' in env_vars:
            mongodb_config['port'] = int(env_vars['MONGODB_PORT'])
        if 'MONGODB_DATABASE' in env_vars:
            mongodb_config['database'] = env_vars['MONGODB_DATABASE']

        if mongodb_config:
            if 'infrastructure' not in config:
                config['infrastructure'] = {}
            config['infrastructure']['mongodb'] = mongodb_config

        # Add other common configs as needed
        if 'COMPOSE_PROJECT_NAME' in env_vars:
            if 'environment' not in config:
                config['environment'] = {}
            config['environment']['name'] = env_vars['COMPOSE_PROJECT_NAME']

        # Generate YAML with comments
        yaml_str = yaml.dump(config, default_flow_style=False, sort_keys=False)
        return yaml_str

    async def get_or_create_envmap(
        self,
        cluster_id: str,
        namespace: str,
        service_name: str,
        env_vars: Dict[str, str]
    ) -> Tuple[str, str]:
        """
        Get or create ConfigMap and Secret for service environment variables.

        Separates sensitive (keys, passwords) from non-sensitive values.
        Also generates deployment-specific config.yaml for OmegaConf.
        Returns tuple of (configmap_name, secret_name).
        """
        try:
            # Ensure namespace exists first
            await self.ensure_namespace_exists(cluster_id, namespace)

            core_api, _ = self._get_kube_client(cluster_id)

            # Separate sensitive from non-sensitive
            sensitive_patterns = ('SECRET', 'KEY', 'PASSWORD', 'TOKEN', 'PASS', 'CREDENTIALS')
            config_data = {}
            secret_data = {}

            for key, value in env_vars.items():
                if any(pattern in key.upper() for pattern in sensitive_patterns):
                    # Base64 encode for Secret
                    import base64
                    secret_data[key] = base64.b64encode(str(value).encode()).decode()
                else:
                    config_data[key] = str(value)

            # Generate deployment config YAML from env vars
            deployment_config_yaml = self._generate_deployment_config_yaml(env_vars)
            config_data['deployment-config.yaml'] = deployment_config_yaml
            logger.info(f"Generated deployment config for {service_name}")

            configmap_name = f"{service_name}-config"
            secret_name = f"{service_name}-secrets"

            # Create or update ConfigMap
            if config_data:
                configmap = {
                    "apiVersion": "v1",
                    "kind": "ConfigMap",
                    "metadata": {
                        "name": configmap_name,
                        "namespace": namespace,
                        "labels": {
                            "app.kubernetes.io/name": service_name,
                            "app.kubernetes.io/managed-by": "ushadow"
                        }
                    },
                    "data": config_data
                }

                try:
                    core_api.create_namespaced_config_map(namespace=namespace, body=configmap)
                    logger.info(f"Created ConfigMap {configmap_name}")
                except ApiException as e:
                    if e.status == 409:  # Already exists
                        core_api.patch_namespaced_config_map(
                            name=configmap_name,
                            namespace=namespace,
                            body=configmap
                        )
                        logger.info(f"Updated ConfigMap {configmap_name}")
                    else:
                        raise

            # Create or update Secret
            if secret_data:
                secret = {
                    "apiVersion": "v1",
                    "kind": "Secret",
                    "type": "Opaque",
                    "metadata": {
                        "name": secret_name,
                        "namespace": namespace,
                        "labels": {
                            "app.kubernetes.io/name": service_name,
                            "app.kubernetes.io/managed-by": "ushadow"
                        }
                    },
                    "data": secret_data
                }

                try:
                    core_api.create_namespaced_secret(namespace=namespace, body=secret)
                    logger.info(f"Created Secret {secret_name}")
                except ApiException as e:
                    if e.status == 409:
                        core_api.patch_namespaced_secret(
                            name=secret_name,
                            namespace=namespace,
                            body=secret
                        )
                        logger.info(f"Updated Secret {secret_name}")
                    else:
                        raise

            return configmap_name if config_data else "", secret_name if secret_data else ""

        except Exception as e:
            logger.error(f"Error creating envmap: {e}")
            raise

    async def _seed_pvc_from_path(
        self,
        cluster_id: str,
        namespace: str,
        pvc_claim_name: str,
        source_path: str,
        skip_if_not_empty: bool = True,
    ) -> bool:
        """
        Seed a PVC with files from a local path using a temporary Kubernetes pod.

        Creates a busybox pod that mounts the PVC, streams file content via the
        Kubernetes exec API using base64 encoding, then deletes the pod. Requires
        only the Kubernetes Python SDK — no kubectl needed.

        Args:
            cluster_id: Kubernetes cluster ID
            namespace: Target namespace
            pvc_claim_name: Name of the PVC to seed
            source_path: Local file or directory to copy into the PVC root
            skip_if_not_empty: Skip seeding if the PVC already has files

        Returns True if seeding succeeded (or was skipped because PVC has content).
        """
        import asyncio
        import base64

        source = Path(source_path)
        if not source.exists():
            logger.warning(f"Seed source {source_path!r} does not exist, skipping PVC {pvc_claim_name!r}")
            return False

        # Collect files relative to source root
        files_to_copy: Dict[str, bytes] = {}
        if source.is_file():
            files_to_copy[source.name] = source.read_bytes()
        else:
            for f in source.rglob("*"):
                if f.is_file():
                    rel = str(f.relative_to(source))
                    try:
                        files_to_copy[rel] = f.read_bytes()
                    except Exception as exc:
                        logger.warning(f"Could not read {f}: {exc}")

        if not files_to_copy:
            logger.info(f"No files in {source_path!r}, nothing to seed into PVC {pvc_claim_name!r}")
            return True

        logger.info(f"Seeding PVC {pvc_claim_name!r} with {len(files_to_copy)} files from {source_path!r}")

        pod_name = f"seed-{pvc_claim_name[:18]}-{secrets.token_hex(4)}"
        core_api, _ = self._get_kube_client(cluster_id)

        seed_pod = {
            "apiVersion": "v1",
            "kind": "Pod",
            "metadata": {
                "name": pod_name,
                "namespace": namespace,
                "labels": {
                    "app.kubernetes.io/managed-by": "ushadow",
                    "ushadow/role": "pvc-seeder",
                },
            },
            "spec": {
                "restartPolicy": "Never",
                "containers": [{
                    "name": "seeder",
                    "image": "busybox:1.36",
                    "command": ["sh", "-c", "sleep 600"],
                    "volumeMounts": [{"name": "pvc", "mountPath": "/seed-data"}],
                }],
                "volumes": [{
                    "name": "pvc",
                    "persistentVolumeClaim": {"claimName": pvc_claim_name},
                }],
            },
        }

        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(
                None,
                lambda: core_api.create_namespaced_pod(namespace=namespace, body=seed_pod),
            )
            logger.info(f"Created seeder pod {pod_name!r} for PVC {pvc_claim_name!r}")

            # Wait up to 120s for the pod to be Running
            for _ in range(120):
                pod = await loop.run_in_executor(
                    None,
                    lambda: core_api.read_namespaced_pod(name=pod_name, namespace=namespace),
                )
                phase = pod.status.phase
                if phase == "Running":
                    break
                if phase in ("Failed", "Unknown"):
                    raise RuntimeError(f"Seeder pod {pod_name!r} entered phase {phase!r}")
                await asyncio.sleep(1)
            else:
                raise RuntimeError(f"Seeder pod {pod_name!r} did not become Running within 120s")

            from kubernetes.stream import stream as k8s_stream

            # Optionally check if PVC already has content
            if skip_if_not_empty:
                check = await loop.run_in_executor(
                    None,
                    lambda: k8s_stream(
                        core_api.connect_get_namespaced_pod_exec,
                        pod_name, namespace,
                        command=["sh", "-c", "ls /seed-data | wc -l"],
                        stderr=True, stdin=False, stdout=True, tty=False,
                    ),
                )
                if check and check.strip() != "0":
                    logger.info(f"PVC {pvc_claim_name!r} already has content, skipping seed")
                    return True

            # Copy files via base64 encoding to avoid shell escaping issues
            for rel_path, content in files_to_copy.items():
                dest_path = f"/seed-data/{rel_path}"
                dest_dir = str(Path(dest_path).parent)

                await loop.run_in_executor(
                    None,
                    lambda d=dest_dir: k8s_stream(
                        core_api.connect_get_namespaced_pod_exec,
                        pod_name, namespace,
                        command=["mkdir", "-p", d],
                        stderr=True, stdin=False, stdout=True, tty=False,
                    ),
                )

                # base64 only uses [A-Za-z0-9+/=] — safe inside single-quoted shell strings
                encoded = base64.b64encode(content).decode()
                # Split into 32KB chunks to stay within exec argument limits
                chunks = [encoded[i:i + 32768] for i in range(0, len(encoded), 32768)]
                # First chunk: create file; subsequent chunks: append
                cmd = f"printf '%s' '{chunks[0]}' | base64 -d > {dest_path}"
                for chunk in chunks[1:]:
                    cmd += f" && printf '%s' '{chunk}' | base64 -d >> {dest_path}"

                await loop.run_in_executor(
                    None,
                    lambda c=cmd: k8s_stream(
                        core_api.connect_get_namespaced_pod_exec,
                        pod_name, namespace,
                        command=["sh", "-c", c],
                        stderr=True, stdin=False, stdout=True, tty=False,
                    ),
                )
                logger.debug(f"Seeded {rel_path!r} ({len(content)} bytes) into PVC {pvc_claim_name!r}")

            logger.info(f"Seeded {len(files_to_copy)} files into PVC {pvc_claim_name!r}")
            return True

        except Exception as exc:
            logger.error(f"Failed to seed PVC {pvc_claim_name!r}: {exc}")
            return False
        finally:
            try:
                await loop.run_in_executor(
                    None,
                    lambda: core_api.delete_namespaced_pod(
                        name=pod_name,
                        namespace=namespace,
                        body=client.V1DeleteOptions(grace_period_seconds=0),
                    ),
                )
                logger.info(f"Deleted seeder pod {pod_name!r}")
            except Exception as cleanup_exc:
                logger.warning(f"Failed to delete seeder pod {pod_name!r}: {cleanup_exc}")

    async def deploy_to_kubernetes(
        self,
        cluster_id: str,
        service_def: Dict,
        namespace: str = "default",
        k8s_spec: Optional[KubernetesDeploymentSpec] = None
    ) -> Tuple[bool, str]:
        """
        Deploy a service to a Kubernetes cluster.

        Compiles the service definition to K8s manifests and applies them.
        """
        try:
            service_name = service_def.get("name", "unknown")
            logger.info(f"Starting deployment of {service_name} to cluster {cluster_id}, namespace {namespace}")
            logger.info(f"Service definition: image={service_def.get('image')}, ports={service_def.get('ports')}")

            # Ensure namespace exists first
            logger.info(f"Ensuring namespace {namespace} exists...")
            import asyncio
            try:
                await asyncio.wait_for(
                    self.ensure_namespace_exists(cluster_id, namespace),
                    timeout=15.0  # 15 second timeout for namespace check
                )
                logger.info(f"Namespace {namespace} ready")
            except asyncio.TimeoutError:
                raise Exception(
                    f"Timeout connecting to Kubernetes cluster. "
                    f"The cluster may be unreachable. Check network connectivity and kubeconfig."
                )

            # Compile manifests
            logger.info(f"Compiling K8s manifests for {service_name}...")
            manifests = await self.compile_service_to_k8s(service_def, namespace, k8s_spec)
            logger.info(f"Manifests compiled successfully")

            # Log generated manifests for debugging
            logger.info(f"Generated manifests for {service_name}:")
            for manifest_type, manifest in manifests.items():
                logger.debug(f"{manifest_type}:\n{yaml.dump(manifest, default_flow_style=False)}")

            # Optionally save manifests to disk for debugging
            manifest_dir = Path("/tmp/k8s-manifests") / cluster_id / namespace
            manifest_dir.mkdir(parents=True, exist_ok=True)
            for manifest_type, manifest in manifests.items():
                if manifest_type.startswith("_"):
                    continue  # Skip internal metadata keys
                manifest_file = manifest_dir / f"{service_name}-{manifest_type}.yaml"
                with open(manifest_file, 'w') as f:
                    yaml.dump(manifest, f, default_flow_style=False)
            logger.info(f"Manifests saved to {manifest_dir}")

            # Get API clients
            core_api, apps_api = self._get_kube_client(cluster_id)
            networking_api = client.NetworkingV1Api()

            # Apply ConfigMap
            if "config_map" in manifests:
                try:
                    core_api.create_namespaced_config_map(
                        namespace=namespace,
                        body=manifests["config_map"]
                    )
                except ApiException as e:
                    if e.status == 409:  # Already exists, update it
                        name = manifests["config_map"]["metadata"]["name"]
                        core_api.patch_namespaced_config_map(
                            name=name,
                            namespace=namespace,
                            body=manifests["config_map"]
                        )
                    else:
                        raise

            # Apply Secret
            if "secret" in manifests:
                try:
                    core_api.create_namespaced_secret(
                        namespace=namespace,
                        body=manifests["secret"]
                    )
                except ApiException as e:
                    if e.status == 409:
                        name = manifests["secret"]["metadata"]["name"]
                        core_api.patch_namespaced_secret(
                            name=name,
                            namespace=namespace,
                            body=manifests["secret"]
                        )
                    else:
                        raise

            # Apply PersistentVolumeClaims (must exist before Deployment references them)
            for manifest_key, manifest in manifests.items():
                if manifest_key.startswith("pvc_"):
                    pvc_name = manifest["metadata"]["name"]
                    try:
                        core_api.create_namespaced_persistent_volume_claim(
                            namespace=namespace,
                            body=manifest
                        )
                        logger.info(f"Created PVC {pvc_name} in {namespace}")
                    except ApiException as e:
                        if e.status == 409:  # Already exists
                            logger.info(f"PVC {pvc_name} already exists in {namespace}")
                        else:
                            raise

            # Seed bind-mount volumes with local files (skip if PVC already has content)
            for seed_info in manifests.get("_volumes_to_seed", []):
                await self._seed_pvc_from_path(
                    cluster_id=cluster_id,
                    namespace=namespace,
                    pvc_claim_name=seed_info["pvc_claim_name"],
                    source_path=seed_info["source_path"],
                    skip_if_not_empty=True,
                )

            # Apply Deployment
            deployment_name = manifests["deployment"]["metadata"]["name"]
            deployment_volumes = manifests["deployment"]["spec"]["template"]["spec"].get("volumes", [])
            logger.info(f"Deployment manifest volumes ({len(deployment_volumes)} volumes):")
            for idx, vol in enumerate(deployment_volumes):
                logger.info(f"  manifest[{idx}] = {vol}")
            try:
                apps_api.create_namespaced_deployment(
                    namespace=namespace,
                    body=manifests["deployment"]
                )
                logger.info(f"Created deployment {deployment_name} in {namespace}")
            except ApiException as e:
                if e.status == 409:
                    logger.info(f"Deployment exists, will replace (not patch) to avoid volume merge issues")
                    # Delete and recreate to avoid merge issues with volumes
                    apps_api.delete_namespaced_deployment(
                        name=deployment_name,
                        namespace=namespace
                    )
                    logger.info(f"Deleted existing deployment {deployment_name}")
                    apps_api.create_namespaced_deployment(
                        namespace=namespace,
                        body=manifests["deployment"]
                    )
                    logger.info(f"Recreated deployment {deployment_name} in {namespace}")
                else:
                    raise

            # Apply Service
            service_name = manifests["service"]["metadata"]["name"]
            try:
                core_api.create_namespaced_service(
                    namespace=namespace,
                    body=manifests["service"]
                )
                logger.info(f"Created service {service_name} in {namespace}")
            except ApiException as e:
                if e.status == 409:
                    core_api.patch_namespaced_service(
                        name=service_name,
                        namespace=namespace,
                        body=manifests["service"]
                    )
                    logger.info(f"Updated service {service_name} in {namespace}")
                else:
                    raise

            # Apply Ingress (if present)
            if "ingress" in manifests:
                ingress_name = manifests["ingress"]["metadata"]["name"]
                try:
                    networking_api.create_namespaced_ingress(
                        namespace=namespace,
                        body=manifests["ingress"]
                    )
                    logger.info(f"Created ingress {ingress_name} in {namespace}")
                except ApiException as e:
                    if e.status == 409:
                        networking_api.patch_namespaced_ingress(
                            name=ingress_name,
                            namespace=namespace,
                            body=manifests["ingress"]
                        )
                        logger.info(f"Updated ingress {ingress_name} in {namespace}")
                    else:
                        raise

            # Log success and return details
            deployed_resources = []
            if "config_map" in manifests:
                deployed_resources.append(f"ConfigMap/{manifests['config_map']['metadata']['name']}")
            if "secret" in manifests:
                deployed_resources.append(f"Secret/{manifests['secret']['metadata']['name']}")
            deployed_resources.append(f"Deployment/{deployment_name}")
            deployed_resources.append(f"Service/{service_name}")
            if "ingress" in manifests:
                deployed_resources.append(f"Ingress/{manifests['ingress']['metadata']['name']}")

            result_msg = f"Successfully deployed {deployment_name} to {namespace}. Resources: {', '.join(deployed_resources)}"
            logger.info(result_msg)
            return True, result_msg

        except ApiException as e:
            logger.error(f"K8s API error during deployment: {e}")
            logger.error(f"Response body: {e.body if hasattr(e, 'body') else 'N/A'}")

            # Extract detailed error message from K8s response
            error_detail = e.reason
            if hasattr(e, 'body') and e.body:
                try:
                    import json
                    body = json.loads(e.body)
                    if 'message' in body:
                        error_detail = body['message']
                    # Also extract specific causes if present
                    if 'details' in body and 'causes' in body['details']:
                        causes = body['details']['causes']
                        cause_msgs = [f"{c.get('field', 'unknown')}: {c.get('message', 'unknown')}" for c in causes]
                        error_detail = f"{body.get('message', e.reason)} | Causes: {'; '.join(cause_msgs)}"
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass  # Keep original error_detail

            logger.error(f"K8s deployment error detail: {error_detail}")
            return False, f"Deployment failed: {error_detail}"
        except Exception as e:
            logger.error(f"Error deploying to K8s: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False, str(e)


# Singleton instance
_kubernetes_manager: Optional[KubernetesManager] = None


async def init_kubernetes_manager(db) -> KubernetesManager:
    """Initialize the global KubernetesManager."""
    global _kubernetes_manager
    _kubernetes_manager = KubernetesManager(db)
    await _kubernetes_manager.initialize()
    return _kubernetes_manager


async def get_kubernetes_manager() -> KubernetesManager:
    """Get the global KubernetesManager instance."""
    global _kubernetes_manager
    if _kubernetes_manager is None:
        raise RuntimeError("KubernetesManager not initialized. Call init_kubernetes_manager first.")
    return _kubernetes_manager
