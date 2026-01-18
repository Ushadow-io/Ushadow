from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.kubernetes_cluster_create_labels import KubernetesClusterCreateLabels


T = TypeVar("T", bound="KubernetesClusterCreate")


@_attrs_define
class KubernetesClusterCreate:
    """Request to add a new Kubernetes cluster.

    Attributes:
        name (str): Human-readable cluster name
        kubeconfig (str): Base64-encoded kubeconfig file
        context (None | str | Unset): Context to use (if not specified, uses current-context)
        namespace (str | Unset): Default namespace Default: 'default'.
        labels (KubernetesClusterCreateLabels | Unset):
    """

    name: str
    kubeconfig: str
    context: None | str | Unset = UNSET
    namespace: str | Unset = "default"
    labels: KubernetesClusterCreateLabels | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        kubeconfig = self.kubeconfig

        context: None | str | Unset
        if isinstance(self.context, Unset):
            context = UNSET
        else:
            context = self.context

        namespace = self.namespace

        labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.labels, Unset):
            labels = self.labels.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
                "kubeconfig": kubeconfig,
            }
        )
        if context is not UNSET:
            field_dict["context"] = context
        if namespace is not UNSET:
            field_dict["namespace"] = namespace
        if labels is not UNSET:
            field_dict["labels"] = labels

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.kubernetes_cluster_create_labels import KubernetesClusterCreateLabels

        d = dict(src_dict)
        name = d.pop("name")

        kubeconfig = d.pop("kubeconfig")

        def _parse_context(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        context = _parse_context(d.pop("context", UNSET))

        namespace = d.pop("namespace", UNSET)

        _labels = d.pop("labels", UNSET)
        labels: KubernetesClusterCreateLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = KubernetesClusterCreateLabels.from_dict(_labels)

        kubernetes_cluster_create = cls(
            name=name,
            kubeconfig=kubeconfig,
            context=context,
            namespace=namespace,
            labels=labels,
        )

        kubernetes_cluster_create.additional_properties = d
        return kubernetes_cluster_create

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
