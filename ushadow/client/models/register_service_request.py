from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.register_service_request_metadata_type_0 import RegisterServiceRequestMetadataType0
    from ..models.service_endpoint_request import ServiceEndpointRequest


T = TypeVar("T", bound="RegisterServiceRequest")


@_attrs_define
class RegisterServiceRequest:
    """Request to register a dynamic service.

    Attributes:
        service_name (str): Unique service name
        description (str | Unset):  Default: ''.
        service_type (str | Unset):  Default: 'application'.
        endpoints (list[ServiceEndpointRequest] | Unset):
        user_controllable (bool | Unset):  Default: True.
        compose_file (None | str | Unset):
        metadata (None | RegisterServiceRequestMetadataType0 | Unset):
    """

    service_name: str
    description: str | Unset = ""
    service_type: str | Unset = "application"
    endpoints: list[ServiceEndpointRequest] | Unset = UNSET
    user_controllable: bool | Unset = True
    compose_file: None | str | Unset = UNSET
    metadata: None | RegisterServiceRequestMetadataType0 | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.register_service_request_metadata_type_0 import RegisterServiceRequestMetadataType0

        service_name = self.service_name

        description = self.description

        service_type = self.service_type

        endpoints: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.endpoints, Unset):
            endpoints = []
            for endpoints_item_data in self.endpoints:
                endpoints_item = endpoints_item_data.to_dict()
                endpoints.append(endpoints_item)

        user_controllable = self.user_controllable

        compose_file: None | str | Unset
        if isinstance(self.compose_file, Unset):
            compose_file = UNSET
        else:
            compose_file = self.compose_file

        metadata: dict[str, Any] | None | Unset
        if isinstance(self.metadata, Unset):
            metadata = UNSET
        elif isinstance(self.metadata, RegisterServiceRequestMetadataType0):
            metadata = self.metadata.to_dict()
        else:
            metadata = self.metadata

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "service_name": service_name,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if service_type is not UNSET:
            field_dict["service_type"] = service_type
        if endpoints is not UNSET:
            field_dict["endpoints"] = endpoints
        if user_controllable is not UNSET:
            field_dict["user_controllable"] = user_controllable
        if compose_file is not UNSET:
            field_dict["compose_file"] = compose_file
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.register_service_request_metadata_type_0 import RegisterServiceRequestMetadataType0
        from ..models.service_endpoint_request import ServiceEndpointRequest

        d = dict(src_dict)
        service_name = d.pop("service_name")

        description = d.pop("description", UNSET)

        service_type = d.pop("service_type", UNSET)

        _endpoints = d.pop("endpoints", UNSET)
        endpoints: list[ServiceEndpointRequest] | Unset = UNSET
        if _endpoints is not UNSET:
            endpoints = []
            for endpoints_item_data in _endpoints:
                endpoints_item = ServiceEndpointRequest.from_dict(endpoints_item_data)

                endpoints.append(endpoints_item)

        user_controllable = d.pop("user_controllable", UNSET)

        def _parse_compose_file(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        compose_file = _parse_compose_file(d.pop("compose_file", UNSET))

        def _parse_metadata(data: object) -> None | RegisterServiceRequestMetadataType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                metadata_type_0 = RegisterServiceRequestMetadataType0.from_dict(data)

                return metadata_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | RegisterServiceRequestMetadataType0 | Unset, data)

        metadata = _parse_metadata(d.pop("metadata", UNSET))

        register_service_request = cls(
            service_name=service_name,
            description=description,
            service_type=service_type,
            endpoints=endpoints,
            user_controllable=user_controllable,
            compose_file=compose_file,
            metadata=metadata,
        )

        register_service_request.additional_properties = d
        return register_service_request

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
