from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.instance_status import InstanceStatus
from ..types import UNSET, Unset

T = TypeVar("T", bound="InstanceSummary")


@_attrs_define
class InstanceSummary:
    """Lightweight instance info for listings.

    Attributes:
        id (str):
        template_id (str):
        name (str):
        status (InstanceStatus): Status of an instance.
        provides (None | str | Unset):
        deployment_target (None | str | Unset):
        access_url (None | str | Unset):
    """

    id: str
    template_id: str
    name: str
    status: InstanceStatus
    provides: None | str | Unset = UNSET
    deployment_target: None | str | Unset = UNSET
    access_url: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        template_id = self.template_id

        name = self.name

        status = self.status.value

        provides: None | str | Unset
        if isinstance(self.provides, Unset):
            provides = UNSET
        else:
            provides = self.provides

        deployment_target: None | str | Unset
        if isinstance(self.deployment_target, Unset):
            deployment_target = UNSET
        else:
            deployment_target = self.deployment_target

        access_url: None | str | Unset
        if isinstance(self.access_url, Unset):
            access_url = UNSET
        else:
            access_url = self.access_url

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "template_id": template_id,
                "name": name,
                "status": status,
            }
        )
        if provides is not UNSET:
            field_dict["provides"] = provides
        if deployment_target is not UNSET:
            field_dict["deployment_target"] = deployment_target
        if access_url is not UNSET:
            field_dict["access_url"] = access_url

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = d.pop("id")

        template_id = d.pop("template_id")

        name = d.pop("name")

        status = InstanceStatus(d.pop("status"))

        def _parse_provides(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        provides = _parse_provides(d.pop("provides", UNSET))

        def _parse_deployment_target(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        deployment_target = _parse_deployment_target(d.pop("deployment_target", UNSET))

        def _parse_access_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        access_url = _parse_access_url(d.pop("access_url", UNSET))

        instance_summary = cls(
            id=id,
            template_id=template_id,
            name=name,
            status=status,
            provides=provides,
            deployment_target=deployment_target,
            access_url=access_url,
        )

        instance_summary.additional_properties = d
        return instance_summary

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
