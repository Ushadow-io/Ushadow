from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="DockerHubImageInfo")


@_attrs_define
class DockerHubImageInfo:
    """Parsed Docker Hub URL information.

    Attributes:
        namespace (str):
        repository (str):
        tag (str | Unset):  Default: 'latest'.
    """

    namespace: str
    repository: str
    tag: str | Unset = "latest"
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        namespace = self.namespace

        repository = self.repository

        tag = self.tag

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "namespace": namespace,
                "repository": repository,
            }
        )
        if tag is not UNSET:
            field_dict["tag"] = tag

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        namespace = d.pop("namespace")

        repository = d.pop("repository")

        tag = d.pop("tag", UNSET)

        docker_hub_image_info = cls(
            namespace=namespace,
            repository=repository,
            tag=tag,
        )

        docker_hub_image_info.additional_properties = d
        return docker_hub_image_info

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
