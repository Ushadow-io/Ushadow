from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ComposeEnvVarInfo")


@_attrs_define
class ComposeEnvVarInfo:
    """Environment variable extracted from compose file.

    Attributes:
        name (str):
        has_default (bool | Unset):  Default: False.
        default_value (None | str | Unset):
        is_required (bool | Unset):  Default: True.
        description (None | str | Unset):
    """

    name: str
    has_default: bool | Unset = False
    default_value: None | str | Unset = UNSET
    is_required: bool | Unset = True
    description: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        has_default = self.has_default

        default_value: None | str | Unset
        if isinstance(self.default_value, Unset):
            default_value = UNSET
        else:
            default_value = self.default_value

        is_required = self.is_required

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
            }
        )
        if has_default is not UNSET:
            field_dict["has_default"] = has_default
        if default_value is not UNSET:
            field_dict["default_value"] = default_value
        if is_required is not UNSET:
            field_dict["is_required"] = is_required
        if description is not UNSET:
            field_dict["description"] = description

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        name = d.pop("name")

        has_default = d.pop("has_default", UNSET)

        def _parse_default_value(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        default_value = _parse_default_value(d.pop("default_value", UNSET))

        is_required = d.pop("is_required", UNSET)

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        compose_env_var_info = cls(
            name=name,
            has_default=has_default,
            default_value=default_value,
            is_required=is_required,
            description=description,
        )

        compose_env_var_info.additional_properties = d
        return compose_env_var_info

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
