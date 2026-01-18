from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.service_ports import ServicePorts


T = TypeVar("T", bound="Service")


@_attrs_define
class Service:
    """
    Attributes:
        service_name (str | Unset):
        status (str | Unset):
        health (str | Unset):
        description (str | Unset):
        ports (ServicePorts | Unset):
    """

    service_name: str | Unset = UNSET
    status: str | Unset = UNSET
    health: str | Unset = UNSET
    description: str | Unset = UNSET
    ports: ServicePorts | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        service_name = self.service_name

        status = self.status

        health = self.health

        description = self.description

        ports: dict[str, Any] | Unset = UNSET
        if not isinstance(self.ports, Unset):
            ports = self.ports.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if service_name is not UNSET:
            field_dict["service_name"] = service_name
        if status is not UNSET:
            field_dict["status"] = status
        if health is not UNSET:
            field_dict["health"] = health
        if description is not UNSET:
            field_dict["description"] = description
        if ports is not UNSET:
            field_dict["ports"] = ports

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.service_ports import ServicePorts

        d = dict(src_dict)
        service_name = d.pop("service_name", UNSET)

        status = d.pop("status", UNSET)

        health = d.pop("health", UNSET)

        description = d.pop("description", UNSET)

        _ports = d.pop("ports", UNSET)
        ports: ServicePorts | Unset
        if isinstance(_ports, Unset):
            ports = UNSET
        else:
            ports = ServicePorts.from_dict(_ports)

        service = cls(
            service_name=service_name,
            status=status,
            health=health,
            description=description,
            ports=ports,
        )

        service.additional_properties = d
        return service

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
