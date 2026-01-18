from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.capability_requirement import CapabilityRequirement
    from ..models.service_info import ServiceInfo


T = TypeVar("T", bound="QuickstartResponse")


@_attrs_define
class QuickstartResponse:
    """Response for quickstart wizard - aggregated capability requirements.

    Attributes:
        required_capabilities (list[CapabilityRequirement]):
        services (list[ServiceInfo]):
        all_configured (bool):
    """

    required_capabilities: list[CapabilityRequirement]
    services: list[ServiceInfo]
    all_configured: bool
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        required_capabilities = []
        for required_capabilities_item_data in self.required_capabilities:
            required_capabilities_item = required_capabilities_item_data.to_dict()
            required_capabilities.append(required_capabilities_item)

        services = []
        for services_item_data in self.services:
            services_item = services_item_data.to_dict()
            services.append(services_item)

        all_configured = self.all_configured

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "required_capabilities": required_capabilities,
                "services": services,
                "all_configured": all_configured,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.capability_requirement import CapabilityRequirement
        from ..models.service_info import ServiceInfo

        d = dict(src_dict)
        required_capabilities = []
        _required_capabilities = d.pop("required_capabilities")
        for required_capabilities_item_data in _required_capabilities:
            required_capabilities_item = CapabilityRequirement.from_dict(required_capabilities_item_data)

            required_capabilities.append(required_capabilities_item)

        services = []
        _services = d.pop("services")
        for services_item_data in _services:
            services_item = ServiceInfo.from_dict(services_item_data)

            services.append(services_item)

        all_configured = d.pop("all_configured")

        quickstart_response = cls(
            required_capabilities=required_capabilities,
            services=services,
            all_configured=all_configured,
        )

        quickstart_response.additional_properties = d
        return quickstart_response

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
