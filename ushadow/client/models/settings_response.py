from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="SettingsResponse")


@_attrs_define
class SettingsResponse:
    """Settings response model - infrastructure settings.

    Attributes:
        env_name (str):
        mongodb_database (str):
    """

    env_name: str
    mongodb_database: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        env_name = self.env_name

        mongodb_database = self.mongodb_database

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "env_name": env_name,
                "mongodb_database": mongodb_database,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        env_name = d.pop("env_name")

        mongodb_database = d.pop("mongodb_database")

        settings_response = cls(
            env_name=env_name,
            mongodb_database=mongodb_database,
        )

        settings_response.additional_properties = d
        return settings_response

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
