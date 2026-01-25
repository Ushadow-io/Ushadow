"""Kubernetes cluster and deployment models."""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field, computed_field


class KubernetesClusterStatus(str, Enum):
    """Status of a Kubernetes cluster connection."""
    CONNECTED = "connected"
    UNREACHABLE = "unreachable"
    UNAUTHORIZED = "unauthorized"
    ERROR = "error"


class KubernetesCluster(BaseModel):
    """Represents a Kubernetes cluster that Ushadow can deploy to."""

    cluster_id: str = Field(..., description="Unique identifier for this cluster")
    name: str = Field(..., description="Human-readable cluster name")
    context: str = Field(..., description="Kubeconfig context name")
    server: str = Field(..., description="K8s API server URL")
    status: KubernetesClusterStatus = KubernetesClusterStatus.UNREACHABLE

    # Metadata
    version: Optional[str] = Field(None, description="Kubernetes version")
    node_count: Optional[int] = Field(None, description="Number of nodes in cluster")
    namespace: str = Field("default", description="Default namespace for deployments")

    # Infrastructure scan results (cached per namespace)
    infra_scans: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Cached infrastructure scan results per namespace. Key: namespace, Value: scan results"
    )

    # Labels for organization
    labels: Dict[str, str] = Field(default_factory=dict)

    @computed_field
    @property
    def deployment_target_id(self) -> str:
        """
        Get unified deployment target ID.

        Format: {name}.k8s.{environment}
        Example: "my-cluster.k8s.purple"
        """
        from src.utils.deployment_targets import make_deployment_target_id
        # Use name (human-readable) as identifier for k8s clusters
        return make_deployment_target_id(self.name, "k8s")

    class Config:
        json_schema_extra = {
            "example": {
                "cluster_id": "prod-us-west",
                "name": "Production US West",
                "context": "gke_myproject_us-west1_prod-cluster",
                "server": "https://35.233.123.45",
                "status": "connected",
                "version": "1.28.3",
                "node_count": 5,
                "namespace": "ushadow-prod",
                "labels": {"env": "production", "region": "us-west"}
            }
        }


class KubernetesNode(BaseModel):
    """Represents a node in a Kubernetes cluster."""

    name: str = Field(..., description="Node name")
    cluster_id: str = Field(..., description="Parent cluster ID")

    # Node status
    status: str = Field(..., description="Node status: Ready, NotReady, Unknown")
    ready: bool = Field(False, description="Whether node is ready")

    # Node info
    kubelet_version: Optional[str] = Field(None, description="Kubelet version")
    os_image: Optional[str] = Field(None, description="OS image")
    kernel_version: Optional[str] = Field(None, description="Kernel version")
    container_runtime: Optional[str] = Field(None, description="Container runtime")

    # Capacity and allocatable resources
    cpu_capacity: Optional[str] = Field(None, description="Total CPU capacity")
    memory_capacity: Optional[str] = Field(None, description="Total memory capacity")
    cpu_allocatable: Optional[str] = Field(None, description="Allocatable CPU")
    memory_allocatable: Optional[str] = Field(None, description="Allocatable memory")

    # Node roles
    roles: List[str] = Field(default_factory=list, description="Node roles: control-plane, worker")

    # Addresses
    internal_ip: Optional[str] = Field(None, description="Internal IP address")
    external_ip: Optional[str] = Field(None, description="External IP address")
    hostname: Optional[str] = Field(None, description="Hostname")

    # Taints and labels
    taints: List[Dict[str, str]] = Field(default_factory=list, description="Node taints")
    labels: Dict[str, str] = Field(default_factory=dict, description="Node labels")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "node-1",
                "cluster_id": "prod-us-west",
                "status": "Ready",
                "ready": True,
                "kubelet_version": "v1.28.3",
                "os_image": "Ubuntu 22.04 LTS",
                "container_runtime": "containerd://1.7.2",
                "cpu_capacity": "4",
                "memory_capacity": "16Gi",
                "cpu_allocatable": "3.5",
                "memory_allocatable": "14Gi",
                "roles": ["worker"],
                "internal_ip": "10.0.1.5",
                "labels": {"node.kubernetes.io/instance-type": "n2-standard-4"}
            }
        }


class KubernetesClusterCreate(BaseModel):
    """Request to add a new Kubernetes cluster."""

    name: str = Field(..., description="Human-readable cluster name")
    kubeconfig: str = Field(..., description="Base64-encoded kubeconfig file")
    context: Optional[str] = Field(None, description="Context to use (if not specified, uses current-context)")
    namespace: str = Field("default", description="Default namespace")
    labels: Dict[str, str] = Field(default_factory=dict)


class KubernetesDeploymentSpec(BaseModel):
    """Kubernetes-specific deployment configuration."""

    # Basic K8s options
    replicas: int = Field(1, ge=1, le=100, description="Number of pod replicas")
    namespace: str = Field("default", description="Kubernetes namespace")

    # Resource constraints
    resources: Optional[Dict[str, Any]] = Field(
        None,
        description="Resource requests/limits",
        json_schema_extra={
            "example": {
                "requests": {"cpu": "100m", "memory": "128Mi"},
                "limits": {"cpu": "500m", "memory": "512Mi"}
            }
        }
    )

    # Networking
    service_type: str = Field("ClusterIP", description="K8s Service type: ClusterIP, NodePort, LoadBalancer")
    ingress: Optional[Dict[str, Any]] = Field(
        None,
        description="Ingress configuration",
        json_schema_extra={
            "example": {
                "enabled": True,
                "host": "api.example.com",
                "path": "/",
                "tls": True
            }
        }
    )

    # Health checks
    health_check_path: Optional[str] = Field(
        None,
        description="HTTP path for liveness/readiness probes. Set to None to disable health checks. Default: /health"
    )

    # DNS configuration
    dns_policy: Optional[str] = Field(
        None,
        description="DNS policy for pod (ClusterFirst, Default, ClusterFirstWithHostNet, None). Default: ClusterFirst"
    )

    # Advanced options
    annotations: Dict[str, str] = Field(default_factory=dict)
    labels: Dict[str, str] = Field(default_factory=dict)

    # Escape hatch for power users
    custom_manifest: Optional[str] = Field(
        None,
        description="Raw YAML manifest to merge with generated config"
    )


class DeploymentTarget_not_used(BaseModel):
    """Represents where a service should be deployed. NOT IN USE - for future hybrid deployments."""

    type: str = Field(..., description="Target type: 'docker' or 'kubernetes'")
    id: str = Field(..., description="Target identifier (hostname or cluster_id)")

    # K8s-specific fields (only used when type='kubernetes')
    namespace: Optional[str] = Field(None, description="K8s namespace")
    kubernetes_spec: Optional[KubernetesDeploymentSpec] = Field(
        None,
        description="K8s-specific deployment options"
    )

    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "type": "docker",
                    "id": "worker-node-1"
                },
                {
                    "type": "kubernetes",
                    "id": "prod-us-west",
                    "namespace": "ushadow-prod",
                    "kubernetes_spec": {
                        "replicas": 3,
                        "resources": {
                            "requests": {"cpu": "100m", "memory": "128Mi"}
                        }
                    }
                }
            ]
        }
