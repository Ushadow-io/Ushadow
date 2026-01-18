from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.kubernetes_cluster_status import KubernetesClusterStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.kubernetes_cluster_labels import KubernetesClusterLabels


T = TypeVar("T", bound="KubernetesCluster")


@_attrs_define
class KubernetesCluster:
    """Represents a Kubernetes cluster that Ushadow can deploy to.

    Example:
        {'cluster_id': 'prod-us-west', 'context': 'gke_myproject_us-west1_prod-cluster', 'labels': {'env': 'production',
            'region': 'us-west'}, 'name': 'Production US West', 'namespace': 'ushadow-prod', 'node_count': 5, 'server':
            'https://35.233.123.45', 'status': 'connected', 'version': '1.28.3'}

    Attributes:
        cluster_id (str): Unique identifier for this cluster
        name (str): Human-readable cluster name
        context (str): Kubeconfig context name
        server (str): K8s API server URL
        status (KubernetesClusterStatus | Unset): Status of a Kubernetes cluster connection.
        version (None | str | Unset): Kubernetes version
        node_count (int | None | Unset): Number of nodes in cluster
        namespace (str | Unset): Default namespace for deployments Default: 'default'.
        labels (KubernetesClusterLabels | Unset):
    """

    cluster_id: str
    name: str
    context: str
    server: str
    status: KubernetesClusterStatus | Unset = UNSET
    version: None | str | Unset = UNSET
    node_count: int | None | Unset = UNSET
    namespace: str | Unset = "default"
    labels: KubernetesClusterLabels | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        cluster_id = self.cluster_id

        name = self.name

        context = self.context

        server = self.server

        status: str | Unset = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value

        version: None | str | Unset
        if isinstance(self.version, Unset):
            version = UNSET
        else:
            version = self.version

        node_count: int | None | Unset
        if isinstance(self.node_count, Unset):
            node_count = UNSET
        else:
            node_count = self.node_count

        namespace = self.namespace

        labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.labels, Unset):
            labels = self.labels.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "cluster_id": cluster_id,
                "name": name,
                "context": context,
                "server": server,
            }
        )
        if status is not UNSET:
            field_dict["status"] = status
        if version is not UNSET:
            field_dict["version"] = version
        if node_count is not UNSET:
            field_dict["node_count"] = node_count
        if namespace is not UNSET:
            field_dict["namespace"] = namespace
        if labels is not UNSET:
            field_dict["labels"] = labels

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.kubernetes_cluster_labels import KubernetesClusterLabels

        d = dict(src_dict)
        cluster_id = d.pop("cluster_id")

        name = d.pop("name")

        context = d.pop("context")

        server = d.pop("server")

        _status = d.pop("status", UNSET)
        status: KubernetesClusterStatus | Unset
        if isinstance(_status, Unset):
            status = UNSET
        else:
            status = KubernetesClusterStatus(_status)

        def _parse_version(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        version = _parse_version(d.pop("version", UNSET))

        def _parse_node_count(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        node_count = _parse_node_count(d.pop("node_count", UNSET))

        namespace = d.pop("namespace", UNSET)

        _labels = d.pop("labels", UNSET)
        labels: KubernetesClusterLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = KubernetesClusterLabels.from_dict(_labels)

        kubernetes_cluster = cls(
            cluster_id=cluster_id,
            name=name,
            context=context,
            server=server,
            status=status,
            version=version,
            node_count=node_count,
            namespace=namespace,
            labels=labels,
        )

        kubernetes_cluster.additional_properties = d
        return kubernetes_cluster

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
