from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="Wiring")


@_attrs_define
class Wiring:
    """Connects an instance output to an instance input.

    When wired, the source instance's output values override
    the target instance's input configuration for that capability.

        Attributes:
            id (str): Unique wiring identifier
            source_instance_id (str): Instance providing the capability
            source_capability (str): Capability being provided (e.g., 'llm', 'memory')
            target_instance_id (str): Instance consuming the capability
            target_capability (str): Capability slot being filled
            created_at (datetime.datetime | None | Unset):
            created_by (None | str | Unset):
    """

    id: str
    source_instance_id: str
    source_capability: str
    target_instance_id: str
    target_capability: str
    created_at: datetime.datetime | None | Unset = UNSET
    created_by: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        source_instance_id = self.source_instance_id

        source_capability = self.source_capability

        target_instance_id = self.target_instance_id

        target_capability = self.target_capability

        created_at: None | str | Unset
        if isinstance(self.created_at, Unset):
            created_at = UNSET
        elif isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        created_by: None | str | Unset
        if isinstance(self.created_by, Unset):
            created_by = UNSET
        else:
            created_by = self.created_by

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "source_instance_id": source_instance_id,
                "source_capability": source_capability,
                "target_instance_id": target_instance_id,
                "target_capability": target_capability,
            }
        )
        if created_at is not UNSET:
            field_dict["created_at"] = created_at
        if created_by is not UNSET:
            field_dict["created_by"] = created_by

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = d.pop("id")

        source_instance_id = d.pop("source_instance_id")

        source_capability = d.pop("source_capability")

        target_instance_id = d.pop("target_instance_id")

        target_capability = d.pop("target_capability")

        def _parse_created_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_type_0 = isoparse(data)

                return created_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        created_at = _parse_created_at(d.pop("created_at", UNSET))

        def _parse_created_by(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        created_by = _parse_created_by(d.pop("created_by", UNSET))

        wiring = cls(
            id=id,
            source_instance_id=source_instance_id,
            source_capability=source_capability,
            target_instance_id=target_instance_id,
            target_capability=target_capability,
            created_at=created_at,
            created_by=created_by,
        )

        wiring.additional_properties = d
        return wiring

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
