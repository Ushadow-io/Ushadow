from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ImportServiceResponse")


@_attrs_define
class ImportServiceResponse:
    """Response from importing a service.

    Attributes:
        success (bool):
        message (str):
        service_id (None | str | Unset):
        service_name (None | str | Unset):
        compose_file_path (None | str | Unset):
    """

    success: bool
    message: str
    service_id: None | str | Unset = UNSET
    service_name: None | str | Unset = UNSET
    compose_file_path: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        success = self.success

        message = self.message

        service_id: None | str | Unset
        if isinstance(self.service_id, Unset):
            service_id = UNSET
        else:
            service_id = self.service_id

        service_name: None | str | Unset
        if isinstance(self.service_name, Unset):
            service_name = UNSET
        else:
            service_name = self.service_name

        compose_file_path: None | str | Unset
        if isinstance(self.compose_file_path, Unset):
            compose_file_path = UNSET
        else:
            compose_file_path = self.compose_file_path

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "message": message,
            }
        )
        if service_id is not UNSET:
            field_dict["service_id"] = service_id
        if service_name is not UNSET:
            field_dict["service_name"] = service_name
        if compose_file_path is not UNSET:
            field_dict["compose_file_path"] = compose_file_path

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        success = d.pop("success")

        message = d.pop("message")

        def _parse_service_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        service_id = _parse_service_id(d.pop("service_id", UNSET))

        def _parse_service_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        service_name = _parse_service_name(d.pop("service_name", UNSET))

        def _parse_compose_file_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        compose_file_path = _parse_compose_file_path(d.pop("compose_file_path", UNSET))

        import_service_response = cls(
            success=success,
            message=message,
            service_id=service_id,
            service_name=service_name,
            compose_file_path=compose_file_path,
        )

        import_service_response.additional_properties = d
        return import_service_response

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
