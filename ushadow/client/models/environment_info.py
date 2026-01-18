from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="EnvironmentInfo")


@_attrs_define
class EnvironmentInfo:
    """Current environment information

    Attributes:
        name (str):
        tailscale_hostname (str):
        tailscale_container_name (str):
        tailscale_volume_name (str):
    """

    name: str
    tailscale_hostname: str
    tailscale_container_name: str
    tailscale_volume_name: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        tailscale_hostname = self.tailscale_hostname

        tailscale_container_name = self.tailscale_container_name

        tailscale_volume_name = self.tailscale_volume_name

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
                "tailscale_hostname": tailscale_hostname,
                "tailscale_container_name": tailscale_container_name,
                "tailscale_volume_name": tailscale_volume_name,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        name = d.pop("name")

        tailscale_hostname = d.pop("tailscale_hostname")

        tailscale_container_name = d.pop("tailscale_container_name")

        tailscale_volume_name = d.pop("tailscale_volume_name")

        environment_info = cls(
            name=name,
            tailscale_hostname=tailscale_hostname,
            tailscale_container_name=tailscale_container_name,
            tailscale_volume_name=tailscale_volume_name,
        )

        environment_info.additional_properties = d
        return environment_info

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
