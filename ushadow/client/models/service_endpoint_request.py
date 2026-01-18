from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ServiceEndpointRequest")


@_attrs_define
class ServiceEndpointRequest:
    """Service endpoint information.

    Attributes:
        url (str):
        integration_type (str | Unset):  Default: 'rest'.
        health_check_path (None | str | Unset):
        requires_auth (bool | Unset):  Default: False.
        auth_type (None | str | Unset):
    """

    url: str
    integration_type: str | Unset = "rest"
    health_check_path: None | str | Unset = UNSET
    requires_auth: bool | Unset = False
    auth_type: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        url = self.url

        integration_type = self.integration_type

        health_check_path: None | str | Unset
        if isinstance(self.health_check_path, Unset):
            health_check_path = UNSET
        else:
            health_check_path = self.health_check_path

        requires_auth = self.requires_auth

        auth_type: None | str | Unset
        if isinstance(self.auth_type, Unset):
            auth_type = UNSET
        else:
            auth_type = self.auth_type

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "url": url,
            }
        )
        if integration_type is not UNSET:
            field_dict["integration_type"] = integration_type
        if health_check_path is not UNSET:
            field_dict["health_check_path"] = health_check_path
        if requires_auth is not UNSET:
            field_dict["requires_auth"] = requires_auth
        if auth_type is not UNSET:
            field_dict["auth_type"] = auth_type

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        url = d.pop("url")

        integration_type = d.pop("integration_type", UNSET)

        def _parse_health_check_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        health_check_path = _parse_health_check_path(d.pop("health_check_path", UNSET))

        requires_auth = d.pop("requires_auth", UNSET)

        def _parse_auth_type(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        auth_type = _parse_auth_type(d.pop("auth_type", UNSET))

        service_endpoint_request = cls(
            url=url,
            integration_type=integration_type,
            health_check_path=health_check_path,
            requires_auth=requires_auth,
            auth_type=auth_type,
        )

        service_endpoint_request.additional_properties = d
        return service_endpoint_request

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
