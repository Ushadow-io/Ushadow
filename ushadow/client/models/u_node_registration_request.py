from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.u_node_capabilities import UNodeCapabilities


T = TypeVar("T", bound="UNodeRegistrationRequest")


@_attrs_define
class UNodeRegistrationRequest:
    """Request to register a u-node.

    Attributes:
        token (str):
        hostname (str):
        tailscale_ip (str):
        platform (str | Unset):  Default: 'unknown'.
        manager_version (str | Unset):  Default: '0.1.0'.
        capabilities (None | UNodeCapabilities | Unset):
    """

    token: str
    hostname: str
    tailscale_ip: str
    platform: str | Unset = "unknown"
    manager_version: str | Unset = "0.1.0"
    capabilities: None | UNodeCapabilities | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.u_node_capabilities import UNodeCapabilities

        token = self.token

        hostname = self.hostname

        tailscale_ip = self.tailscale_ip

        platform = self.platform

        manager_version = self.manager_version

        capabilities: dict[str, Any] | None | Unset
        if isinstance(self.capabilities, Unset):
            capabilities = UNSET
        elif isinstance(self.capabilities, UNodeCapabilities):
            capabilities = self.capabilities.to_dict()
        else:
            capabilities = self.capabilities

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "token": token,
                "hostname": hostname,
                "tailscale_ip": tailscale_ip,
            }
        )
        if platform is not UNSET:
            field_dict["platform"] = platform
        if manager_version is not UNSET:
            field_dict["manager_version"] = manager_version
        if capabilities is not UNSET:
            field_dict["capabilities"] = capabilities

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.u_node_capabilities import UNodeCapabilities

        d = dict(src_dict)
        token = d.pop("token")

        hostname = d.pop("hostname")

        tailscale_ip = d.pop("tailscale_ip")

        platform = d.pop("platform", UNSET)

        manager_version = d.pop("manager_version", UNSET)

        def _parse_capabilities(data: object) -> None | UNodeCapabilities | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                capabilities_type_0 = UNodeCapabilities.from_dict(data)

                return capabilities_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | UNodeCapabilities | Unset, data)

        capabilities = _parse_capabilities(d.pop("capabilities", UNSET))

        u_node_registration_request = cls(
            token=token,
            hostname=hostname,
            tailscale_ip=tailscale_ip,
            platform=platform,
            manager_version=manager_version,
            capabilities=capabilities,
        )

        u_node_registration_request.additional_properties = d
        return u_node_registration_request

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
