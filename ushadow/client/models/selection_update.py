from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.selection_update_selected_providers_type_0 import SelectionUpdateSelectedProvidersType0


T = TypeVar("T", bound="SelectionUpdate")


@_attrs_define
class SelectionUpdate:
    """
    Attributes:
        wizard_mode (None | str | Unset):
        selected_providers (None | SelectionUpdateSelectedProvidersType0 | Unset):
    """

    wizard_mode: None | str | Unset = UNSET
    selected_providers: None | SelectionUpdateSelectedProvidersType0 | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.selection_update_selected_providers_type_0 import SelectionUpdateSelectedProvidersType0

        wizard_mode: None | str | Unset
        if isinstance(self.wizard_mode, Unset):
            wizard_mode = UNSET
        else:
            wizard_mode = self.wizard_mode

        selected_providers: dict[str, Any] | None | Unset
        if isinstance(self.selected_providers, Unset):
            selected_providers = UNSET
        elif isinstance(self.selected_providers, SelectionUpdateSelectedProvidersType0):
            selected_providers = self.selected_providers.to_dict()
        else:
            selected_providers = self.selected_providers

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if wizard_mode is not UNSET:
            field_dict["wizard_mode"] = wizard_mode
        if selected_providers is not UNSET:
            field_dict["selected_providers"] = selected_providers

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.selection_update_selected_providers_type_0 import SelectionUpdateSelectedProvidersType0

        d = dict(src_dict)

        def _parse_wizard_mode(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        wizard_mode = _parse_wizard_mode(d.pop("wizard_mode", UNSET))

        def _parse_selected_providers(data: object) -> None | SelectionUpdateSelectedProvidersType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                selected_providers_type_0 = SelectionUpdateSelectedProvidersType0.from_dict(data)

                return selected_providers_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | SelectionUpdateSelectedProvidersType0 | Unset, data)

        selected_providers = _parse_selected_providers(d.pop("selected_providers", UNSET))

        selection_update = cls(
            wizard_mode=wizard_mode,
            selected_providers=selected_providers,
        )

        selection_update.additional_properties = d
        return selection_update

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
