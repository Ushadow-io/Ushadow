from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ProviderQuery")


@_attrs_define
class ProviderQuery:
    """
    Attributes:
        capability (None | str | Unset):
        mode (None | str | Unset):
        configured (bool | None | Unset):
    """

    capability: None | str | Unset = UNSET
    mode: None | str | Unset = UNSET
    configured: bool | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        capability: None | str | Unset
        if isinstance(self.capability, Unset):
            capability = UNSET
        else:
            capability = self.capability

        mode: None | str | Unset
        if isinstance(self.mode, Unset):
            mode = UNSET
        else:
            mode = self.mode

        configured: bool | None | Unset
        if isinstance(self.configured, Unset):
            configured = UNSET
        else:
            configured = self.configured

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if capability is not UNSET:
            field_dict["capability"] = capability
        if mode is not UNSET:
            field_dict["mode"] = mode
        if configured is not UNSET:
            field_dict["configured"] = configured

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_capability(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        capability = _parse_capability(d.pop("capability", UNSET))

        def _parse_mode(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        mode = _parse_mode(d.pop("mode", UNSET))

        def _parse_configured(data: object) -> bool | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(bool | None | Unset, data)

        configured = _parse_configured(d.pop("configured", UNSET))

        provider_query = cls(
            capability=capability,
            mode=mode,
            configured=configured,
        )

        provider_query.additional_properties = d
        return provider_query

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
