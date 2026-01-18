from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.missing_key import MissingKey


T = TypeVar("T", bound="CapabilityRequirement")


@_attrs_define
class CapabilityRequirement:
    """A capability requirement with provider info.

    Attributes:
        id (str):
        selected_provider (None | str | Unset):
        provider_name (None | str | Unset):
        provider_mode (None | str | Unset):
        configured (bool | Unset):  Default: False.
        missing_keys (list[MissingKey] | Unset):
        error (None | str | Unset):
    """

    id: str
    selected_provider: None | str | Unset = UNSET
    provider_name: None | str | Unset = UNSET
    provider_mode: None | str | Unset = UNSET
    configured: bool | Unset = False
    missing_keys: list[MissingKey] | Unset = UNSET
    error: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        selected_provider: None | str | Unset
        if isinstance(self.selected_provider, Unset):
            selected_provider = UNSET
        else:
            selected_provider = self.selected_provider

        provider_name: None | str | Unset
        if isinstance(self.provider_name, Unset):
            provider_name = UNSET
        else:
            provider_name = self.provider_name

        provider_mode: None | str | Unset
        if isinstance(self.provider_mode, Unset):
            provider_mode = UNSET
        else:
            provider_mode = self.provider_mode

        configured = self.configured

        missing_keys: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.missing_keys, Unset):
            missing_keys = []
            for missing_keys_item_data in self.missing_keys:
                missing_keys_item = missing_keys_item_data.to_dict()
                missing_keys.append(missing_keys_item)

        error: None | str | Unset
        if isinstance(self.error, Unset):
            error = UNSET
        else:
            error = self.error

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
            }
        )
        if selected_provider is not UNSET:
            field_dict["selected_provider"] = selected_provider
        if provider_name is not UNSET:
            field_dict["provider_name"] = provider_name
        if provider_mode is not UNSET:
            field_dict["provider_mode"] = provider_mode
        if configured is not UNSET:
            field_dict["configured"] = configured
        if missing_keys is not UNSET:
            field_dict["missing_keys"] = missing_keys
        if error is not UNSET:
            field_dict["error"] = error

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.missing_key import MissingKey

        d = dict(src_dict)
        id = d.pop("id")

        def _parse_selected_provider(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        selected_provider = _parse_selected_provider(d.pop("selected_provider", UNSET))

        def _parse_provider_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        provider_name = _parse_provider_name(d.pop("provider_name", UNSET))

        def _parse_provider_mode(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        provider_mode = _parse_provider_mode(d.pop("provider_mode", UNSET))

        configured = d.pop("configured", UNSET)

        _missing_keys = d.pop("missing_keys", UNSET)
        missing_keys: list[MissingKey] | Unset = UNSET
        if _missing_keys is not UNSET:
            missing_keys = []
            for missing_keys_item_data in _missing_keys:
                missing_keys_item = MissingKey.from_dict(missing_keys_item_data)

                missing_keys.append(missing_keys_item)

        def _parse_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        error = _parse_error(d.pop("error", UNSET))

        capability_requirement = cls(
            id=id,
            selected_provider=selected_provider,
            provider_name=provider_name,
            provider_mode=provider_mode,
            configured=configured,
            missing_keys=missing_keys,
            error=error,
        )

        capability_requirement.additional_properties = d
        return capability_requirement

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
