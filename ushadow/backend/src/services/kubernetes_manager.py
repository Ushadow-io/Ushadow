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

        # Parse volumes - separate config files from persistent volumes
        # Volumes can be:
        #   - Bind mounts: "/host/path:/container/path:ro" or "${VAR}/path:/container/path"
        #   - Named volumes: "volume_name:/container/path" (creates PVC)
        config_files = {}  # Files to include in ConfigMap
        volume_mounts = []  # Volume mounts for container
        k8s_volumes = []  # Volume definitions for pod
        pvcs_to_create = []  # PVCs to create as manifests

        for volume_def in volumes:
            if isinstance(volume_def, str):
                # Parse "source:dest" or "source:dest:options" format
                parts = volume_def.split(":")
                if len(parts) >= 2:
                    source, dest = parts[0], parts[1]
                    is_readonly = len(parts) > 2 and 'ro' in parts[2]

                    # Resolve environment variables in source path
                    import os
                    source = os.path.expandvars(source)

                    # Detect volume type:
                    # - Named volume: simple name without "/" or "." prefix (e.g., "ushadow-config")
                    # - Path-based: starts with "/" or "." or contains "/" (e.g., "/config", "./data", "host/path")
                    is_named_volume = not source.startswith(('/', '.')) and '/' not in source

                    # Check if source is a file (for config files) or directory (for data volumes)
                    from pathlib import Path
                    source_path = Path(source)

                    if source_path.is_file():
                        # Config file - add to ConfigMap
                        try:
                            with open(source_path, 'r') as f:
                                file_content = f.read()
                            file_name = source_path.name
                            config_files[file_name] = file_content
                            logger.info(f"Adding config file {file_name} to ConfigMap (source: {source})")

                            # Add volume mount for this file
                            volume_mounts.append({
                                "name": "config-files",
                                "mountPath": dest,
                                "subPath": file_name,
                                "readOnly": is_readonly
                            })
                        except Exception as e:
                            logger.warning(f"Could not read config file {source}: {e}")

                    elif is_named_volume:
                        # Named volume - create PVC for persistent storage
                        # Sanitize volume name: replace dots, underscores with hyphens (K8s requirement)
                        volume_name = source.replace("_", "-").replace(".", "-")

                        # Special case: compose volume should use ConfigMap (automatically generated)
                        if source in ("ushadow-compose", "compose") or dest == "/compose":
                            # Use the compose-files ConfigMap that was automatically generated
                            if not any(v.get("name") == "compose-files" for v in k8s_volumes):
                                k8s_volumes.append({
                                    "name": "compose-files",
                                    "configMap": {
                                        "name": "compose-files"
                                    }
                                })
                                logger.info(f"Using compose-files ConfigMap for {dest}")

                            # Add volume mount for compose files
                            volume_mounts.append({
                                "name": "compose-files",
                                "mountPath": dest,
                                "readOnly": True
                            })
                            continue  # Skip PVC creation for compose

                        # Special case: config volume should use ConfigMap (automatically generated)
                        if source in ("ushadow-config", "config") or dest == "/config":
                            # Use the config-files ConfigMap that was automatically generated
                            if not any(v.get("name") == "config-files" for v in k8s_volumes):
                                k8s_volumes.append({
                                    "name": "config-files",
                                    "configMap": {
                                        "name": "config-files"
                                    }
                                })
                                logger.info(f"Using config-files ConfigMap for {dest}")

                            # Add volume mount for config files
                            volume_mounts.append({
                                "name": "config-files",
                                "mountPath": dest,
                                "readOnly": True
                            })
                            continue  # Skip PVC creation for config

                        # Only add PVC if not already added
                        if not any(v.get("name") == volume_name for v in k8s_volumes):
                            # Add PVC to list for manifest creation
                            pvcs_to_create.append({
                                "name": volume_name,
                                "storage": "10Gi"  # Default size, could be configurable
                            })

                            # Add PVC reference to pod volumes
                            k8s_volumes.append({
                                "name": volume_name,
                                "persistentVolumeClaim": {
                                    "claimName": f"{name}-{volume_name}"
                                }
                            })

                        volume_mounts.append({
                            "name": volume_name,
                            "mountPath": dest,
                            "readOnly": is_readonly
                        })
                        logger.info(f"Adding PVC volume {volume_name} mounted at {dest}")

                    elif source_path.is_dir() or not source_path.exists():
                        # Directory or non-existent path - use emptyDir (non-persistent scratch)
                        # Note: Named volumes are handled above and create PVCs
                        # Sanitize volume name: replace dots, underscores with hyphens (K8s requirement)
                        raw_name = source_path.name if source_path.name else "data"
                        volume_name = raw_name.replace("_", "-").replace(".", "-")

                        if not any(v.get("name") == volume_name for v in k8s_volumes):
                            k8s_volumes.append({
                                "name": volume_name,
                                "emptyDir": {}
                            })

                        volume_mounts.append({
                            "name": volume_name,
                            "mountPath": dest,
                            "readOnly": is_readonly
                        })
                        logger.info(f"Adding emptyDir volume {volume_name} mounted at {dest}")

        # Add config-files volume if we have config files
        if config_files:
            k8s_volumes.append({
                "name": "config-files",
                "configMap": {
                    "name": f"{name}-files"
                }
            })

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

        # ConfigMap for config files (separate from env var ConfigMap)
        if config_files:
            manifests["config_files_map"] = {
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {
                    "name": f"{name}-files",
                    "namespace": namespace,
                    "labels": labels
                },
                "data": config_files
            }

        # Debug: Log volumes before creating deployment
        logger.info(f"Final k8s_volumes list ({len(k8s_volumes)} volumes):")
        for idx, vol in enumerate(k8s_volumes):
            logger.info(f"  [{idx}] {vol}")
        logger.info(f"Final volume_mounts list ({len(volume_mounts)} mounts):")
        for idx, mount in enumerate(volume_mounts):
            logger.info(f"  [{idx}] name={mount['name']}, mountPath={mount['mountPath']}")

        # PersistentVolumeClaims for named volumes
        for i, pvc_info in enumerate(pvcs_to_create):
            pvc_name = pvc_info["name"]
            logger.info(f"Creating PVC manifest for: {pvc_name} (claim name: {name}-{pvc_name})")
            manifests[f"pvc_{pvc_name}"] = {
                "apiVersion": "v1",
                "kind": "PersistentVolumeClaim",
                "metadata": {
                    "name": f"{name}-{pvc_name}",
                    "namespace": namespace,
                    "labels": labels
                },
                "spec": {
                    "accessModes": ["ReadWriteOnce"],
                    "resources": {
                        "requests": {
                            "storage": pvc_info["storage"]
                        }
                    }
                }
            }

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

    async def _ensure_config_configmap(
        self,
        cluster_id: str,
        namespace: str = "ushadow"
    ) -> bool:
        """
        Ensure the config-files ConfigMap exists in the cluster.

        This ConfigMap contains configuration files from the config/ directory,
        including config.defaults.yaml with default_services configuration.

        Returns True if ConfigMap was created/updated successfully.
        """
        try:
            logger.info(f"Ensuring config-files ConfigMap exists in namespace {namespace}")

            # Find config directory (handles both container and development paths)
            config_dir = Path("/config") if Path("/config").exists() else Path("config")
            if not config_dir.exists():
                logger.warning(f"Config directory not found at {config_dir}, skipping ConfigMap creation")
                return False

            # Collect all config files
            config_data = {}

            # Add YAML files (config.defaults.yaml, config.yaml, etc.)
            for pattern in ["*.yaml", "*.yml"]:
                for file_path in config_dir.glob(pattern):
                    if file_path.is_file():
                        try:
                            content = file_path.read_text()
                            config_data[file_path.name] = content
                            logger.debug(f"Added {file_path.name} to ConfigMap ({len(content)} bytes)")
                        except Exception as e:
                            logger.warning(f"Failed to read {file_path}: {e}")

            if not config_data:
                logger.warning("No config files found to add to ConfigMap")
                return False

            logger.info(f"Collected {len(config_data)} config files for ConfigMap (total size: {sum(len(v) for v in config_data.values())} bytes)")

            # Create ConfigMap manifest
            configmap = {
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {
                    "name": "config-files",
                    "namespace": namespace,
                    "labels": {
                        "app": "ushadow",
                        "component": "backend"
                    }
                },
                "data": config_data
            }

            # Get API client
            core_api, _ = self._get_kube_client(cluster_id)

            # Try to create or update the ConfigMap
            try:
                core_api.create_namespaced_config_map(
                    namespace=namespace,
                    body=configmap
                )
                logger.info(f"✅ Created config-files ConfigMap in namespace {namespace}")
                return True
            except ApiException as e:
                if e.status == 409:  # Already exists, update it
                    core_api.patch_namespaced_config_map(
                        name="config-files",
                        namespace=namespace,
                        body=configmap
                    )
                    logger.info(f"✅ Updated config-files ConfigMap in namespace {namespace}")
                    return True
                else:
                    raise

        except Exception as e:
            logger.error(f"Failed to ensure config-files ConfigMap: {e}")
            # Don't fail the deployment, just log the error
            return False

    async def _ensure_compose_configmap(
        self,
        cluster_id: str,
        namespace: str = "ushadow"
    ) -> bool:
        """
        Ensure the compose-files ConfigMap exists in the cluster.

        This ConfigMap contains all compose files from the compose/ directory,
        which are needed by ushadow-backend for service management.

        Returns True if ConfigMap was created/updated successfully.
        """
        try:
            logger.info(f"Ensuring compose-files ConfigMap exists in namespace {namespace}")

            # Find compose directory (handles both container and development paths)
            compose_dir = Path("/compose") if Path("/compose").exists() else Path("compose")
            if not compose_dir.exists():
                logger.warning(f"Compose directory not found at {compose_dir}, skipping ConfigMap creation")
                return False

            # Collect all compose files
            compose_data = {}

            # Add YAML files
            for pattern in ["*.yaml", "*.yml", "*.md"]:
                for file_path in compose_dir.glob(pattern):
                    if file_path.is_file():
                        try:
                            content = file_path.read_text()
                            compose_data[file_path.name] = content
                            logger.debug(f"Added {file_path.name} to ConfigMap ({len(content)} bytes)")
                        except Exception as e:
                            logger.warning(f"Failed to read {file_path}: {e}")

            # Add scripts directory if exists
            scripts_dir = compose_dir / "scripts"
            if scripts_dir.exists():
                for script_path in scripts_dir.iterdir():
                    if script_path.is_file():
                        try:
                            content = script_path.read_text()
                            # Prefix with "script-" to avoid conflicts
                            compose_data[f"script-{script_path.name}"] = content
                            logger.debug(f"Added script {script_path.name} to ConfigMap")
                        except Exception as e:
                            logger.warning(f"Failed to read script {script_path}: {e}")

            if not compose_data:
                logger.warning("No compose files found to add to ConfigMap")
                return False

            logger.info(f"Collected {len(compose_data)} files for ConfigMap (total size: {sum(len(v) for v in compose_data.values())} bytes)")

            # Create ConfigMap manifest
            configmap = {
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {
                    "name": "compose-files",
                    "namespace": namespace,
                    "labels": {
                        "app": "ushadow",
                        "component": "backend"
                    }
                },
                "data": compose_data
            }

            # Get API client
            core_api, _ = self._get_kube_client(cluster_id)

            # Try to create or update the ConfigMap
            try:
                core_api.create_namespaced_config_map(
                    namespace=namespace,
                    body=configmap
                )
                logger.info(f"✅ Created compose-files ConfigMap in namespace {namespace}")
                return True
            except ApiException as e:
                if e.status == 409:  # Already exists, update it
                    core_api.patch_namespaced_config_map(
                        name="compose-files",
                        namespace=namespace,
                        body=configmap
                    )
                    logger.info(f"✅ Updated compose-files ConfigMap in namespace {namespace}")
                    return True
                else:
                    raise

        except Exception as e:
            logger.error(f"Failed to ensure compose-files ConfigMap: {e}")
            # Don't fail the deployment, just log the error
            return False

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

            # For ushadow-backend, ensure compose-files and config-files ConfigMaps exist
            if "ushadow-backend" in service_name.lower() or "backend" in service_def.get("service_id", ""):
                logger.info("Detected ushadow-backend deployment, ensuring ConfigMaps...")
                await self._ensure_compose_configmap(cluster_id, namespace)
                await self._ensure_config_configmap(cluster_id, namespace)

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

            # Apply ConfigMap for config files
            if "config_files_map" in manifests:
                try:
                    core_api.create_namespaced_config_map(
                        namespace=namespace,
                        body=manifests["config_files_map"]
                    )
                    logger.info(f"Created ConfigMap for config files")
                except ApiException as e:
                    if e.status == 409:  # Already exists, update it
                        name = manifests["config_files_map"]["metadata"]["name"]
                        core_api.patch_namespaced_config_map(
                            name=name,
                            namespace=namespace,
                            body=manifests["config_files_map"]
                        )
                        logger.info(f"Updated ConfigMap for config files")
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
            if "config_files_map" in manifests:
                deployed_resources.append(f"ConfigMap/{manifests['config_files_map']['metadata']['name']}")
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
