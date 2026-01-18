from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="VolumeConfig")


@_attrs_define
class VolumeConfig:
    """Configuration for a volume mount.

    Attributes:
        name (str):
        container_path (str):
        is_named_volume (bool | Unset):  Default: True.
    """

    name: str
    container_path: str
    is_named_volume: bool | Unset = True
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        container_path = self.container_path

        is_named_volume = self.is_named_volume

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
                "container_path": container_path,
            }
        )
        if is_named_volume is not UNSET:
            field_dict["is_named_volume"] = is_named_volume

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        name = d.pop("name")

        container_path = d.pop("container_path")

        is_named_volume = d.pop("is_named_volume", UNSET)

        volume_config = cls(
            name=name,
            container_path=container_path,
            is_named_volume=is_named_volume,
        )

        volume_config.additional_properties = d
        return volume_config

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
