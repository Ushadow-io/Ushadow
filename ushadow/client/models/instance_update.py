from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.instance_update_config_type_0 import InstanceUpdateConfigType0


T = TypeVar("T", bound="InstanceUpdate")


@_attrs_define
class InstanceUpdate:
    """Request to update an instance.

    Attributes:
        name (None | str | Unset):
        description (None | str | Unset):
        config (InstanceUpdateConfigType0 | None | Unset):
        deployment_target (None | str | Unset):
    """

    name: None | str | Unset = UNSET
    description: None | str | Unset = UNSET
    config: InstanceUpdateConfigType0 | None | Unset = UNSET
    deployment_target: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.instance_update_config_type_0 import InstanceUpdateConfigType0

        name: None | str | Unset
        if isinstance(self.name, Unset):
            name = UNSET
        else:
            name = self.name

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        config: dict[str, Any] | None | Unset
        if isinstance(self.config, Unset):
            config = UNSET
        elif isinstance(self.config, InstanceUpdateConfigType0):
            config = self.config.to_dict()
        else:
            config = self.config

        deployment_target: None | str | Unset
        if isinstance(self.deployment_target, Unset):
            deployment_target = UNSET
        else:
            deployment_target = self.deployment_target

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if name is not UNSET:
            field_dict["name"] = name
        if description is not UNSET:
            field_dict["description"] = description
        if config is not UNSET:
            field_dict["config"] = config
        if deployment_target is not UNSET:
            field_dict["deployment_target"] = deployment_target

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.instance_update_config_type_0 import InstanceUpdateConfigType0

        d = dict(src_dict)

        def _parse_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        name = _parse_name(d.pop("name", UNSET))

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        def _parse_config(data: object) -> InstanceUpdateConfigType0 | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                config_type_0 = InstanceUpdateConfigType0.from_dict(data)

                return config_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(InstanceUpdateConfigType0 | None | Unset, data)

        config = _parse_config(d.pop("config", UNSET))

        def _parse_deployment_target(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        deployment_target = _parse_deployment_target(d.pop("deployment_target", UNSET))

        instance_update = cls(
            name=name,
            description=description,
            config=config,
            deployment_target=deployment_target,
        )

        instance_update.additional_properties = d
        return instance_update

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
