from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="UpgradeRequest")


@_attrs_define
class UpgradeRequest:
    """Request to upgrade a u-node's manager.

    Attributes:
        version (str | Unset):  Default: 'latest'.
        registry (str | Unset):  Default: 'ghcr.io/ushadow-io'.
    """

    version: str | Unset = "latest"
    registry: str | Unset = "ghcr.io/ushadow-io"
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        version = self.version

        registry = self.registry

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if version is not UNSET:
            field_dict["version"] = version
        if registry is not UNSET:
            field_dict["registry"] = registry

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        version = d.pop("version", UNSET)

        registry = d.pop("registry", UNSET)

        upgrade_request = cls(
            version=version,
            registry=registry,
        )

        upgrade_request.additional_properties = d
        return upgrade_request

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
