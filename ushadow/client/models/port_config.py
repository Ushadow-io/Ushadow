from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="PortConfig")


@_attrs_define
class PortConfig:
    """Configuration for a port mapping.

    Attributes:
        host_port (int):
        container_port (int):
        protocol (str | Unset):  Default: 'tcp'.
    """

    host_port: int
    container_port: int
    protocol: str | Unset = "tcp"
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        host_port = self.host_port

        container_port = self.container_port

        protocol = self.protocol

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "host_port": host_port,
                "container_port": container_port,
            }
        )
        if protocol is not UNSET:
            field_dict["protocol"] = protocol

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        host_port = d.pop("host_port")

        container_port = d.pop("container_port")

        protocol = d.pop("protocol", UNSET)

        port_config = cls(
            host_port=host_port,
            container_port=container_port,
            protocol=protocol,
        )

        port_config.additional_properties = d
        return port_config

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
