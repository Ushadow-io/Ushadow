from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.instance_create_config import InstanceCreateConfig


T = TypeVar("T", bound="InstanceCreate")


@_attrs_define
class InstanceCreate:
    """Request to create a new instance.

    Attributes:
        id (str):
        template_id (str): Template to instantiate
        name (str):
        description (None | str | Unset):
        config (InstanceCreateConfig | Unset): Config values
        deployment_target (None | str | Unset): Where to deploy
    """

    id: str
    template_id: str
    name: str
    description: None | str | Unset = UNSET
    config: InstanceCreateConfig | Unset = UNSET
    deployment_target: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        template_id = self.template_id

        name = self.name

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        config: dict[str, Any] | Unset = UNSET
        if not isinstance(self.config, Unset):
            config = self.config.to_dict()

        deployment_target: None | str | Unset
        if isinstance(self.deployment_target, Unset):
            deployment_target = UNSET
        else:
            deployment_target = self.deployment_target

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "template_id": template_id,
                "name": name,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if config is not UNSET:
            field_dict["config"] = config
        if deployment_target is not UNSET:
            field_dict["deployment_target"] = deployment_target

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.instance_create_config import InstanceCreateConfig

        d = dict(src_dict)
        id = d.pop("id")

        template_id = d.pop("template_id")

        name = d.pop("name")

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        _config = d.pop("config", UNSET)
        config: InstanceCreateConfig | Unset
        if isinstance(_config, Unset):
            config = UNSET
        else:
            config = InstanceCreateConfig.from_dict(_config)

        def _parse_deployment_target(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        deployment_target = _parse_deployment_target(d.pop("deployment_target", UNSET))

        instance_create = cls(
            id=id,
            template_id=template_id,
            name=name,
            description=description,
            config=config,
            deployment_target=deployment_target,
        )

        instance_create.additional_properties = d
        return instance_create

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
