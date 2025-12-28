"""Kubernetes cluster and deployment models."""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


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

    # Labels for organization
    labels: Dict[str, str] = Field(default_factory=dict)

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

    # Advanced options
    annotations: Dict[str, str] = Field(default_factory=dict)
    labels: Dict[str, str] = Field(default_factory=dict)

    # Escape hatch for power users
    custom_manifest: Optional[str] = Field(
        None,
        description="Raw YAML manifest to merge with generated config"
    )


class DeploymentTarget(BaseModel):
    """Represents where a service should be deployed."""

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
