from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="WiringCreate")


@_attrs_define
class WiringCreate:
    """Request to create a wiring connection.

    Attributes:
        source_instance_id (str):
        source_capability (str):
        target_instance_id (str):
        target_capability (str):
    """

    source_instance_id: str
    source_capability: str
    target_instance_id: str
    target_capability: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        source_instance_id = self.source_instance_id

        source_capability = self.source_capability

        target_instance_id = self.target_instance_id

        target_capability = self.target_capability

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "source_instance_id": source_instance_id,
                "source_capability": source_capability,
                "target_instance_id": target_instance_id,
                "target_capability": target_capability,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        source_instance_id = d.pop("source_instance_id")

        source_capability = d.pop("source_capability")

        target_instance_id = d.pop("target_instance_id")

        target_capability = d.pop("target_capability")

        wiring_create = cls(
            source_instance_id=source_instance_id,
            source_capability=source_capability,
            target_instance_id=target_instance_id,
            target_capability=target_capability,
        )

        wiring_create.additional_properties = d
        return wiring_create

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
