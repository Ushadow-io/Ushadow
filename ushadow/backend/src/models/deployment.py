"""
Deployment models for service orchestration across u-nodes.

This module defines:
- ServiceDefinition: A deployable service configuration (Docker container spec)
- Deployment: An instance of a service deployed to a specific node
"""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any

from pydantic import BaseModel, Field


class DeploymentTargetType(str, Enum):
    """Type of deployment target."""
    DOCKER_UNODE = "docker_unode"     # Deploy to remote u-node via manager API
    KUBERNETES = "kubernetes"          # Deploy to Kubernetes cluster
    LOCAL_DOCKER = "local_docker"      # Deploy to local Docker (same node)


class DeploymentStatus(str, Enum):
    """Status of a deployment."""
    PENDING = "pending"        # Deployment requested but not started
    DEPLOYING = "deploying"    # Currently pulling image / starting
    RUNNING = "running"        # Container is running
    STOPPED = "stopped"        # Container stopped (manually or crashed)
    FAILED = "failed"          # Deployment failed
    REMOVING = "removing"      # Currently removing


class ServiceDefinition(BaseModel):
    """
    A deployable service definition.

    Defines the Docker container configuration that can be deployed
    to one or more u-nodes.
    """
    service_id: str = Field(..., description="Unique identifier for the service")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Description of the service")
    image: str = Field(..., description="Docker image (e.g., 'nginx:latest')")

    # Container configuration
    ports: Dict[str, int] = Field(
        default_factory=dict,
        description="Port mappings: {'container_port/tcp': host_port}"
    )
    environment: Dict[str, str] = Field(
        default_factory=dict,
        description="Environment variables"
    )
    volumes: List[str] = Field(
        default_factory=list,
        description="Volume mounts (e.g., '/host/path:/container/path')"
    )
    command: Optional[str] = Field(
        default=None,
        description="Override container command"
    )
    restart_policy: str = Field(
        default="unless-stopped",
        description="Restart policy: no, always, unless-stopped, on-failure"
    )
    network: Optional[str] = Field(
        default=None,
        description="Docker network to join"
    )

    # Health check
    health_check_path: Optional[str] = Field(
        default=None,
        description="HTTP path for health checks (e.g., '/health')"
    )
    health_check_port: Optional[int] = Field(
        default=None,
        description="Port for health checks"
    )

    # Metadata
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        use_enum_values = True


class Deployment(BaseModel):
    """
    A service deployed to a specific target.

    Represents an instance of a ServiceDefinition running on a u-node,
    Kubernetes cluster, or local Docker.
    """
    id: str = Field(..., description="Unique deployment ID")
    service_id: str = Field(..., description="Reference to ServiceDefinition")

    # Target information
    target_type: DeploymentTargetType = Field(
        default=DeploymentTargetType.DOCKER_UNODE,
        description="Type of deployment target"
    )
    unode_hostname: Optional[str] = Field(
        default=None,
        description="Target u-node hostname (for docker deployments)"
    )
    cluster_id: Optional[str] = Field(
        default=None,
        description="Target Kubernetes cluster ID (for k8s deployments)"
    )
    namespace: Optional[str] = Field(
        default="default",
        description="Kubernetes namespace (for k8s deployments)"
    )

    # Status
    status: DeploymentStatus = Field(
        default=DeploymentStatus.PENDING,
        description="Current deployment status"
    )
    container_id: Optional[str] = Field(
        default=None,
        description="Docker container ID (when deployed)"
    )
    container_name: Optional[str] = Field(
        default=None,
        description="Container name on the node"
    )

    # Timestamps
    created_at: Optional[datetime] = None
    deployed_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    last_health_check: Optional[datetime] = None

    # Health
    healthy: Optional[bool] = None
    health_message: Optional[str] = None

    # Error tracking
    error: Optional[str] = None
    retry_count: int = 0

    # The actual config used (snapshot of ServiceDefinition at deploy time)
    deployed_config: Optional[Dict[str, Any]] = None

    # Access information
    access_url: Optional[str] = Field(
        default=None,
        description="URL to access the deployed service"
    )
    exposed_port: Optional[int] = Field(
        default=None,
        description="Primary exposed port for the service"
    )

    class Config:
        use_enum_values = True


class DeployRequest(BaseModel):
    """
    Request to deploy a service to a target.

    Supports three target types:
    - docker_unode: Deploy to a remote u-node via manager API
    - kubernetes: Deploy to a Kubernetes cluster
    - local_docker: Deploy to local Docker on the same node

    Examples:
        # Deploy to a u-node
        {"service_id": "chronicle", "target_type": "docker_unode", "unode_hostname": "worker-1"}

        # Deploy to Kubernetes
        {"service_id": "chronicle", "target_type": "kubernetes", "cluster_id": "abc123", "namespace": "prod"}
    """
    service_id: str = Field(..., description="ID of the service to deploy")

    # Target type determines which target fields are required
    target_type: DeploymentTargetType = Field(
        default=DeploymentTargetType.DOCKER_UNODE,
        description="Type of deployment target"
    )

    # Docker target fields (required when target_type is docker_unode or local_docker)
    unode_hostname: Optional[str] = Field(
        default=None,
        description="Target u-node hostname (required for docker_unode, optional for local_docker)"
    )

    # Kubernetes target fields (required when target_type is kubernetes)
    cluster_id: Optional[str] = Field(
        default=None,
        description="Kubernetes cluster ID (required for kubernetes target)"
    )
    namespace: Optional[str] = Field(
        default="default",
        description="Kubernetes namespace (for kubernetes target)"
    )
    replicas: Optional[int] = Field(
        default=1,
        ge=1,
        le=100,
        description="Number of pod replicas (for kubernetes target)"
    )
    service_type: Optional[str] = Field(
        default="ClusterIP",
        description="K8s Service type: ClusterIP, NodePort, LoadBalancer"
    )
    ingress_host: Optional[str] = Field(
        default=None,
        description="Ingress hostname (enables ingress if set)"
    )


class ServiceDefinitionCreate(BaseModel):
    """Request to create a new service definition."""
    service_id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="")
    image: str = Field(..., min_length=1)
    ports: Dict[str, int] = Field(default_factory=dict)
    environment: Dict[str, str] = Field(default_factory=dict)
    volumes: List[str] = Field(default_factory=list)
    command: Optional[str] = None
    restart_policy: str = Field(default="unless-stopped")
    network: Optional[str] = None
    health_check_path: Optional[str] = None
    health_check_port: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ServiceDefinitionUpdate(BaseModel):
    """Request to update a service definition."""
    name: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    ports: Optional[Dict[str, int]] = None
    environment: Optional[Dict[str, str]] = None
    volumes: Optional[List[str]] = None
    command: Optional[str] = None
    restart_policy: Optional[str] = None
    network: Optional[str] = None
    health_check_path: Optional[str] = None
    health_check_port: Optional[int] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
