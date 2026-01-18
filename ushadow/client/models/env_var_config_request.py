from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="EnvVarConfigRequest")


@_attrs_define
class EnvVarConfigRequest:
    """Request to configure an environment variable.

    Attributes:
        name (str):
        source (str):
        setting_path (None | str | Unset):
        new_setting_path (None | str | Unset):
        value (None | str | Unset):
    """

    name: str
    source: str
    setting_path: None | str | Unset = UNSET
    new_setting_path: None | str | Unset = UNSET
    value: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        source = self.source

        setting_path: None | str | Unset
        if isinstance(self.setting_path, Unset):
            setting_path = UNSET
        else:
            setting_path = self.setting_path

        new_setting_path: None | str | Unset
        if isinstance(self.new_setting_path, Unset):
            new_setting_path = UNSET
        else:
            new_setting_path = self.new_setting_path

        value: None | str | Unset
        if isinstance(self.value, Unset):
            value = UNSET
        else:
            value = self.value

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
                "source": source,
            }
        )
        if setting_path is not UNSET:
            field_dict["setting_path"] = setting_path
        if new_setting_path is not UNSET:
            field_dict["new_setting_path"] = new_setting_path
        if value is not UNSET:
            field_dict["value"] = value

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        name = d.pop("name")

        source = d.pop("source")

        def _parse_setting_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        setting_path = _parse_setting_path(d.pop("setting_path", UNSET))

        def _parse_new_setting_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        new_setting_path = _parse_new_setting_path(d.pop("new_setting_path", UNSET))

        def _parse_value(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        value = _parse_value(d.pop("value", UNSET))

        env_var_config_request = cls(
            name=name,
            source=source,
            setting_path=setting_path,
            new_setting_path=new_setting_path,
            value=value,
        )

        env_var_config_request.additional_properties = d
        return env_var_config_request

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
