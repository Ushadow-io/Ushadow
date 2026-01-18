from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.port_conflict_info import PortConflictInfo


T = TypeVar("T", bound="PreflightCheckResponse")


@_attrs_define
class PreflightCheckResponse:
    """Response from pre-start checks.

    Attributes:
        can_start (bool):
        port_conflicts (list[PortConflictInfo] | Unset):
        message (None | str | Unset):
    """

    can_start: bool
    port_conflicts: list[PortConflictInfo] | Unset = UNSET
    message: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        can_start = self.can_start

        port_conflicts: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.port_conflicts, Unset):
            port_conflicts = []
            for port_conflicts_item_data in self.port_conflicts:
                port_conflicts_item = port_conflicts_item_data.to_dict()
                port_conflicts.append(port_conflicts_item)

        message: None | str | Unset
        if isinstance(self.message, Unset):
            message = UNSET
        else:
            message = self.message

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "can_start": can_start,
            }
        )
        if port_conflicts is not UNSET:
            field_dict["port_conflicts"] = port_conflicts
        if message is not UNSET:
            field_dict["message"] = message

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.port_conflict_info import PortConflictInfo

        d = dict(src_dict)
        can_start = d.pop("can_start")

        _port_conflicts = d.pop("port_conflicts", UNSET)
        port_conflicts: list[PortConflictInfo] | Unset = UNSET
        if _port_conflicts is not UNSET:
            port_conflicts = []
            for port_conflicts_item_data in _port_conflicts:
                port_conflicts_item = PortConflictInfo.from_dict(port_conflicts_item_data)

                port_conflicts.append(port_conflicts_item)

        def _parse_message(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        message = _parse_message(d.pop("message", UNSET))

        preflight_check_response = cls(
            can_start=can_start,
            port_conflicts=port_conflicts,
            message=message,
        )

        preflight_check_response.additional_properties = d
        return preflight_check_response

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
