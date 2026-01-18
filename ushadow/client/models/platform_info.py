from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.platform_info_os_type import PlatformInfoOsType
from ..types import UNSET, Unset

T = TypeVar("T", bound="PlatformInfo")


@_attrs_define
class PlatformInfo:
    """Platform detection information

    Attributes:
        os_type (PlatformInfoOsType):
        os_version (str):
        architecture (str):
        is_docker (bool):
        tailscale_installed (bool | Unset):  Default: False.
    """

    os_type: PlatformInfoOsType
    os_version: str
    architecture: str
    is_docker: bool
    tailscale_installed: bool | Unset = False
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        os_type = self.os_type.value

        os_version = self.os_version

        architecture = self.architecture

        is_docker = self.is_docker

        tailscale_installed = self.tailscale_installed

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "os_type": os_type,
                "os_version": os_version,
                "architecture": architecture,
                "is_docker": is_docker,
            }
        )
        if tailscale_installed is not UNSET:
            field_dict["tailscale_installed"] = tailscale_installed

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        os_type = PlatformInfoOsType(d.pop("os_type"))

        os_version = d.pop("os_version")

        architecture = d.pop("architecture")

        is_docker = d.pop("is_docker")

        tailscale_installed = d.pop("tailscale_installed", UNSET)

        platform_info = cls(
            os_type=os_type,
            os_version=os_version,
            architecture=architecture,
            is_docker=is_docker,
            tailscale_installed=tailscale_installed,
        )

        platform_info.additional_properties = d
        return platform_info

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
