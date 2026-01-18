from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="ManagerVersionsResponse")


@_attrs_define
class ManagerVersionsResponse:
    """Response with available manager versions.

    Attributes:
        versions (list[str]):
        latest (str):
        registry (str):
        image (str):
    """

    versions: list[str]
    latest: str
    registry: str
    image: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        versions = self.versions

        latest = self.latest

        registry = self.registry

        image = self.image

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "versions": versions,
                "latest": latest,
                "registry": registry,
                "image": image,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        versions = cast(list[str], d.pop("versions"))

        latest = d.pop("latest")

        registry = d.pop("registry")

        image = d.pop("image")

        manager_versions_response = cls(
            versions=versions,
            latest=latest,
            registry=registry,
            image=image,
        )

        manager_versions_response.additional_properties = d
        return manager_versions_response

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
