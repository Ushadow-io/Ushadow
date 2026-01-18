from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="EnvVarConfigItem")


@_attrs_define
class EnvVarConfigItem:
    """Configuration for a single environment variable.

    Attributes:
        name (str):
        source (str | Unset):  Default: 'literal'.
        value (None | str | Unset):
        setting_path (None | str | Unset):
        is_secret (bool | Unset):  Default: False.
    """

    name: str
    source: str | Unset = "literal"
    value: None | str | Unset = UNSET
    setting_path: None | str | Unset = UNSET
    is_secret: bool | Unset = False
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        source = self.source

        value: None | str | Unset
        if isinstance(self.value, Unset):
            value = UNSET
        else:
            value = self.value

        setting_path: None | str | Unset
        if isinstance(self.setting_path, Unset):
            setting_path = UNSET
        else:
            setting_path = self.setting_path

        is_secret = self.is_secret

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
            }
        )
        if source is not UNSET:
            field_dict["source"] = source
        if value is not UNSET:
            field_dict["value"] = value
        if setting_path is not UNSET:
            field_dict["setting_path"] = setting_path
        if is_secret is not UNSET:
            field_dict["is_secret"] = is_secret

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        name = d.pop("name")

        source = d.pop("source", UNSET)

        def _parse_value(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        value = _parse_value(d.pop("value", UNSET))

        def _parse_setting_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        setting_path = _parse_setting_path(d.pop("setting_path", UNSET))

        is_secret = d.pop("is_secret", UNSET)

        env_var_config_item = cls(
            name=name,
            source=source,
            value=value,
            setting_path=setting_path,
            is_secret=is_secret,
        )

        env_var_config_item.additional_properties = d
        return env_var_config_item

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
