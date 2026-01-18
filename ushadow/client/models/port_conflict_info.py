from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="PortConflictInfo")


@_attrs_define
class PortConflictInfo:
    """Information about a port conflict.

    Attributes:
        port (int):
        used_by (str):
        suggested_port (int):
        env_var (None | str | Unset):
    """

    port: int
    used_by: str
    suggested_port: int
    env_var: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        port = self.port

        used_by = self.used_by

        suggested_port = self.suggested_port

        env_var: None | str | Unset
        if isinstance(self.env_var, Unset):
            env_var = UNSET
        else:
            env_var = self.env_var

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "port": port,
                "used_by": used_by,
                "suggested_port": suggested_port,
            }
        )
        if env_var is not UNSET:
            field_dict["env_var"] = env_var

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        port = d.pop("port")

        used_by = d.pop("used_by")

        suggested_port = d.pop("suggested_port")

        def _parse_env_var(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        env_var = _parse_env_var(d.pop("env_var", UNSET))

        port_conflict_info = cls(
            port=port,
            used_by=used_by,
            suggested_port=suggested_port,
            env_var=env_var,
        )

        port_conflict_info.additional_properties = d
        return port_conflict_info

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
