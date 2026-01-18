from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ShadowHeaderConfig")


@_attrs_define
class ShadowHeaderConfig:
    """Configuration for shadow header routing.

    Attributes:
        enabled (bool | Unset):  Default: True.
        header_name (str | Unset): Header name for service identification Default: 'X-Shadow-Service'.
        header_value (None | str | Unset): Header value (defaults to service name)
        route_path (None | str | Unset): Tailscale Serve route path (e.g., /myservice)
    """

    enabled: bool | Unset = True
    header_name: str | Unset = "X-Shadow-Service"
    header_value: None | str | Unset = UNSET
    route_path: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        enabled = self.enabled

        header_name = self.header_name

        header_value: None | str | Unset
        if isinstance(self.header_value, Unset):
            header_value = UNSET
        else:
            header_value = self.header_value

        route_path: None | str | Unset
        if isinstance(self.route_path, Unset):
            route_path = UNSET
        else:
            route_path = self.route_path

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if enabled is not UNSET:
            field_dict["enabled"] = enabled
        if header_name is not UNSET:
            field_dict["header_name"] = header_name
        if header_value is not UNSET:
            field_dict["header_value"] = header_value
        if route_path is not UNSET:
            field_dict["route_path"] = route_path

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        enabled = d.pop("enabled", UNSET)

        header_name = d.pop("header_name", UNSET)

        def _parse_header_value(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        header_value = _parse_header_value(d.pop("header_value", UNSET))

        def _parse_route_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        route_path = _parse_route_path(d.pop("route_path", UNSET))

        shadow_header_config = cls(
            enabled=enabled,
            header_name=header_name,
            header_value=header_value,
            route_path=route_path,
        )

        shadow_header_config.additional_properties = d
        return shadow_header_config

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
