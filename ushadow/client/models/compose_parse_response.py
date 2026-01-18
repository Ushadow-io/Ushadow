from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.compose_service_info import ComposeServiceInfo


T = TypeVar("T", bound="ComposeParseResponse")


@_attrs_define
class ComposeParseResponse:
    """Response from parsing a docker-compose file.

    Attributes:
        success (bool):
        compose_path (str):
        services (list[ComposeServiceInfo] | Unset):
        networks (list[str] | Unset):
        volumes (list[str] | Unset):
        message (None | str | Unset):
        error (None | str | Unset):
    """

    success: bool
    compose_path: str
    services: list[ComposeServiceInfo] | Unset = UNSET
    networks: list[str] | Unset = UNSET
    volumes: list[str] | Unset = UNSET
    message: None | str | Unset = UNSET
    error: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        success = self.success

        compose_path = self.compose_path

        services: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.services, Unset):
            services = []
            for services_item_data in self.services:
                services_item = services_item_data.to_dict()
                services.append(services_item)

        networks: list[str] | Unset = UNSET
        if not isinstance(self.networks, Unset):
            networks = self.networks

        volumes: list[str] | Unset = UNSET
        if not isinstance(self.volumes, Unset):
            volumes = self.volumes

        message: None | str | Unset
        if isinstance(self.message, Unset):
            message = UNSET
        else:
            message = self.message

        error: None | str | Unset
        if isinstance(self.error, Unset):
            error = UNSET
        else:
            error = self.error

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "compose_path": compose_path,
            }
        )
        if services is not UNSET:
            field_dict["services"] = services
        if networks is not UNSET:
            field_dict["networks"] = networks
        if volumes is not UNSET:
            field_dict["volumes"] = volumes
        if message is not UNSET:
            field_dict["message"] = message
        if error is not UNSET:
            field_dict["error"] = error

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.compose_service_info import ComposeServiceInfo

        d = dict(src_dict)
        success = d.pop("success")

        compose_path = d.pop("compose_path")

        _services = d.pop("services", UNSET)
        services: list[ComposeServiceInfo] | Unset = UNSET
        if _services is not UNSET:
            services = []
            for services_item_data in _services:
                services_item = ComposeServiceInfo.from_dict(services_item_data)

                services.append(services_item)

        networks = cast(list[str], d.pop("networks", UNSET))

        volumes = cast(list[str], d.pop("volumes", UNSET))

        def _parse_message(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        message = _parse_message(d.pop("message", UNSET))

        def _parse_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        error = _parse_error(d.pop("error", UNSET))

        compose_parse_response = cls(
            success=success,
            compose_path=compose_path,
            services=services,
            networks=networks,
            volumes=volumes,
            message=message,
            error=error,
        )

        compose_parse_response.additional_properties = d
        return compose_parse_response

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
