from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.env_var_config_request import EnvVarConfigRequest


T = TypeVar("T", bound="EnvConfigUpdateRequest")


@_attrs_define
class EnvConfigUpdateRequest:
    """Request to update all env var configs for a service.

    Attributes:
        env_vars (list[EnvVarConfigRequest]):
    """

    env_vars: list[EnvVarConfigRequest]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        env_vars = []
        for env_vars_item_data in self.env_vars:
            env_vars_item = env_vars_item_data.to_dict()
            env_vars.append(env_vars_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "env_vars": env_vars,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.env_var_config_request import EnvVarConfigRequest

        d = dict(src_dict)
        env_vars = []
        _env_vars = d.pop("env_vars")
        for env_vars_item_data in _env_vars:
            env_vars_item = EnvVarConfigRequest.from_dict(env_vars_item_data)

            env_vars.append(env_vars_item)

        env_config_update_request = cls(
            env_vars=env_vars,
        )

        env_config_update_request.additional_properties = d
        return env_config_update_request

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
