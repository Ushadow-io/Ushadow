"""Deploy target model - represents a specific deployment destination."""

from typing import Dict, Any, Optional, Literal
from pydantic import BaseModel, Field

from src.utils.deployment_targets import parse_deployment_target_id


class DeployTarget(BaseModel):
    """
    Represents a specific deployment destination.

    This is the "WHERE" - a concrete place to deploy services.
    Provides a standardized interface regardless of platform type (docker/k8s).

    Examples:
        - DeployTarget(id="ushadow-purple.unode.purple", type="docker", ...)
        - DeployTarget(id="anubis.k8s.purple", type="k8s", ...)
    """

    # Core identity fields (always present)
    id: str = Field(..., description="Deployment target ID: {identifier}.{type}.{environment}")
    type: Literal["docker", "k8s"] = Field(..., description="Platform type")
    name: str = Field(..., description="Human-readable name")
    identifier: str = Field(..., description="Hostname (docker) or cluster_id (k8s)")
    environment: str = Field(..., description="Environment name (e.g., 'purple', 'production')")

    # Status and health
    status: str = Field(..., description="Status: online/offline/healthy/unknown")

    # Platform-specific fields (optional)
    namespace: Optional[str] = Field(None, description="K8s namespace (k8s only)")
    infrastructure: Optional[Dict[str, Any]] = Field(None, description="Infrastructure scan data (k8s only)")

    # Common metadata
    provider: Optional[str] = Field(None, description="Provider: local/remote/eks/gke/aks")
    region: Optional[str] = Field(None, description="Region or location")
    is_leader: Optional[bool] = Field(None, description="Is this the leader node (docker only)")

    # Raw data for advanced use cases
    raw_metadata: Dict[str, Any] = Field(..., description="Original UNode or KubernetesCluster data")

    @classmethod
    async def from_id(cls, target_id: str) -> "DeployTarget":
        """
        Factory method to create DeployTarget from ID.

        Parses the ID, fetches the corresponding unode or cluster,
        and returns a DeployTarget instance.

        Args:
            target_id: Deployment target ID (e.g., "anubis.k8s.purple")

        Returns:
            DeployTarget instance with metadata populated

        Raises:
            ValueError: If target not found or ID format invalid
        """
        from src.services.unode_manager import get_unode_manager
        from src.services.kubernetes_manager import get_kubernetes_manager

        # Parse the ID
        target_info = parse_deployment_target_id(target_id)
        identifier = target_info["identifier"]
        target_type = target_info["type"]

        # Fetch metadata based on type
        if target_type == "k8s":
            k8s_manager = get_kubernetes_manager()
            clusters = await k8s_manager.list_clusters()
            cluster = next((c for c in clusters if c.name == identifier), None)

            if not cluster:
                raise ValueError(f"Kubernetes cluster not found: {identifier}")

            return cls(
                id=target_id,
                type="k8s",
                metadata=cluster.model_dump()
            )
        else:  # docker/unode
            unode_manager = get_unode_manager()
            unode = await unode_manager.get_unode(identifier)

            if not unode:
                raise ValueError(f"UNode not found: {identifier}")

            return cls(
                id=target_id,
                type="docker",
                metadata=unode.model_dump()
            )

    def get_identifier(self) -> str:
        """Extract the identifier part from the target ID."""
        return parse_deployment_target_id(self.id)["identifier"]

    def get_environment(self) -> str:
        """Extract the environment part from the target ID."""
        return parse_deployment_target_id(self.id)["environment"]
