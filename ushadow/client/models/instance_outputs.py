from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.instance_outputs_capability_values import InstanceOutputsCapabilityValues
    from ..models.instance_outputs_env_vars import InstanceOutputsEnvVars


T = TypeVar("T", bound="InstanceOutputs")


@_attrs_define
class InstanceOutputs:
    """Outputs from an instance after deployment.

    Attributes:
        access_url (None | str | Unset): URL to access the service
        env_vars (InstanceOutputsEnvVars | Unset): Resolved environment variables
        capability_values (InstanceOutputsCapabilityValues | Unset): Values for the capability this instance provides
    """

    access_url: None | str | Unset = UNSET
    env_vars: InstanceOutputsEnvVars | Unset = UNSET
    capability_values: InstanceOutputsCapabilityValues | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        access_url: None | str | Unset
        if isinstance(self.access_url, Unset):
            access_url = UNSET
        else:
            access_url = self.access_url

        env_vars: dict[str, Any] | Unset = UNSET
        if not isinstance(self.env_vars, Unset):
            env_vars = self.env_vars.to_dict()

        capability_values: dict[str, Any] | Unset = UNSET
        if not isinstance(self.capability_values, Unset):
            capability_values = self.capability_values.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if access_url is not UNSET:
            field_dict["access_url"] = access_url
        if env_vars is not UNSET:
            field_dict["env_vars"] = env_vars
        if capability_values is not UNSET:
            field_dict["capability_values"] = capability_values

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.instance_outputs_capability_values import InstanceOutputsCapabilityValues
        from ..models.instance_outputs_env_vars import InstanceOutputsEnvVars

        d = dict(src_dict)

        def _parse_access_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        access_url = _parse_access_url(d.pop("access_url", UNSET))

        _env_vars = d.pop("env_vars", UNSET)
        env_vars: InstanceOutputsEnvVars | Unset
        if isinstance(_env_vars, Unset):
            env_vars = UNSET
        else:
            env_vars = InstanceOutputsEnvVars.from_dict(_env_vars)

        _capability_values = d.pop("capability_values", UNSET)
        capability_values: InstanceOutputsCapabilityValues | Unset
        if isinstance(_capability_values, Unset):
            capability_values = UNSET
        else:
            capability_values = InstanceOutputsCapabilityValues.from_dict(_capability_values)

        instance_outputs = cls(
            access_url=access_url,
            env_vars=env_vars,
            capability_values=capability_values,
        )

        instance_outputs.additional_properties = d
        return instance_outputs

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
