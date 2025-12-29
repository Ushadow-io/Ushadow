"""Kubernetes cluster management and deployment service."""

import base64
import binascii
import hashlib
import logging
import os
import secrets
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

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

logger = logging.getLogger(__name__)


class KubernetesManager:
    """Manages Kubernetes clusters and deployments."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.clusters_collection = db.kubernetes_clusters
        self._kubeconfig_dir = Path("/config/kubeconfigs")
        self._kubeconfig_dir.mkdir(parents=True, exist_ok=True)
        # Initialize encryption for kubeconfig files
        self._fernet = self._init_fernet()

    def _init_fernet(self) -> Fernet:
        """Initialize Fernet encryption using app secret key."""
        from src.config.settings import get_settings
        settings = get_settings()

        # Derive a 32-byte key from the app secret
        secret = settings.AUTH_SECRET_KEY.encode() if settings.AUTH_SECRET_KEY else b"default-secret-key"
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

            # Write to temp file for validation (kubernetes client needs a file)
            temp_kubeconfig_path = self._kubeconfig_dir / f".tmp_{cluster_id}.yaml"
            temp_kubeconfig_path.write_text(kubeconfig_yaml)
            # Set restrictive permissions on temp file
            os.chmod(temp_kubeconfig_path, 0o600)

            # Load config and extract info
            kube_config = config.load_kube_config(
                config_file=str(temp_kubeconfig_path),
                context=cluster_data.context
            )

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

        # Use provided spec or defaults
        spec = k8s_spec or KubernetesDeploymentSpec()

        # Parse ports (Docker format: "8080:8080" or "8080")
        container_port = 8000  # default
        if ports:
            port_str = ports[0]
            if ":" in port_str:
                _, container_port = port_str.split(":")
                container_port = int(container_port)
            else:
                container_port = int(port_str)

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

        # Generate manifests matching friend-lite pattern
        labels = {
            "app.kubernetes.io/name": name,
            "app.kubernetes.io/instance": service_id,
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
                        "app.kubernetes.io/instance": service_id
                    }
                },
                "template": {
                    "metadata": {
                        "labels": {
                            "app.kubernetes.io/name": name,
                            "app.kubernetes.io/instance": service_id
                        },
                        "annotations": spec.annotations
                    },
                    "spec": {
                        "containers": [{
                            "name": name,
                            "image": image,
                            "imagePullPolicy": "Always",
                            "ports": [{
                                "name": "http",
                                "containerPort": container_port,
                                "protocol": "TCP"
                            }],
                            # Use envFrom like friend-lite pattern
                            **({"envFrom": [
                                *([{"configMapRef": {"name": f"{name}-config"}}] if config_data else []),
                                *([{"secretRef": {"name": f"{name}-secrets"}}] if secret_data else [])
                            ]} if (config_data or secret_data) else {}),
                            "livenessProbe": {
                                "httpGet": {
                                    "path": "/health",
                                    "port": "http"
                                },
                                "initialDelaySeconds": 30,
                                "periodSeconds": 60
                            },
                            "readinessProbe": {
                                "httpGet": {
                                    "path": "/health",
                                    "port": "http"
                                },
                                "initialDelaySeconds": 10,
                                "periodSeconds": 30
                            },
                            **({"resources": spec.resources} if spec.resources else {
                                "resources": {
                                    "limits": {"cpu": "500m", "memory": "512Mi"},
                                    "requests": {"cpu": "100m", "memory": "128Mi"}
                                }
                            })
                        }]
                    }
                }
            }
        }

        # Service (NodePort by default, matching friend-lite pattern)
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
                "ports": [{
                    "port": container_port,
                    "targetPort": "http",
                    "protocol": "TCP",
                    "name": "http"
                }],
                "selector": {
                    "app.kubernetes.io/name": name,
                    "app.kubernetes.io/instance": service_id
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
                                        "port": {"number": container_port}
                                    }
                                }
                            }]
                        }
                    }]
                }
            }

        return manifests

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
            # Compile manifests
            manifests = await self.compile_service_to_k8s(service_def, namespace, k8s_spec)

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

            # Apply Deployment
            deployment_name = manifests["deployment"]["metadata"]["name"]
            try:
                apps_api.create_namespaced_deployment(
                    namespace=namespace,
                    body=manifests["deployment"]
                )
                logger.info(f"Created deployment {deployment_name} in {namespace}")
            except ApiException as e:
                if e.status == 409:
                    apps_api.patch_namespaced_deployment(
                        name=deployment_name,
                        namespace=namespace,
                        body=manifests["deployment"]
                    )
                    logger.info(f"Updated deployment {deployment_name} in {namespace}")
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

            return True, f"Deployed to {namespace}/{deployment_name}"

        except ApiException as e:
            logger.error(f"K8s API error during deployment: {e}")
            return False, f"Deployment failed: {e.reason}"
        except Exception as e:
            logger.error(f"Error deploying to K8s: {e}")
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
