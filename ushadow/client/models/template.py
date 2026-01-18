from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.template_source import TemplateSource
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.template_config_schema_item import TemplateConfigSchemaItem


T = TypeVar("T", bound="Template")


@_attrs_define
class Template:
    """A discoverable service or provider template.

    Templates are discovered from compose files or provider definitions.
    They define the "shape" of a service - what it needs and provides.

        Attributes:
            id (str): Template identifier (e.g., 'openmemory', 'openai')
            source (TemplateSource): Where a template was discovered from.
            name (str): Display name
            description (None | str | Unset): Human-readable description
            requires (list[str] | Unset): Capability inputs (e.g., ['llm'])
            optional (list[str] | Unset): Optional capabilities
            provides (None | str | Unset): Capability this provides (e.g., 'memory')
            config_schema (list[TemplateConfigSchemaItem] | Unset): Schema for configurable fields
            compose_file (None | str | Unset): Path to compose file (if source=compose)
            service_name (None | str | Unset): Service name in compose file
            provider_file (None | str | Unset): Path to provider file (if source=provider)
            mode (None | str | Unset): 'cloud' or 'local'
            icon (None | str | Unset):
            tags (list[str] | Unset):
            configured (bool | Unset): Whether required config is present Default: True.
            available (bool | Unset): Whether local service is running/reachable Default: True.
    """

    id: str
    source: TemplateSource
    name: str
    description: None | str | Unset = UNSET
    requires: list[str] | Unset = UNSET
    optional: list[str] | Unset = UNSET
    provides: None | str | Unset = UNSET
    config_schema: list[TemplateConfigSchemaItem] | Unset = UNSET
    compose_file: None | str | Unset = UNSET
    service_name: None | str | Unset = UNSET
    provider_file: None | str | Unset = UNSET
    mode: None | str | Unset = UNSET
    icon: None | str | Unset = UNSET
    tags: list[str] | Unset = UNSET
    configured: bool | Unset = True
    available: bool | Unset = True
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        source = self.source.value

        name = self.name

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        requires: list[str] | Unset = UNSET
        if not isinstance(self.requires, Unset):
            requires = self.requires

        optional: list[str] | Unset = UNSET
        if not isinstance(self.optional, Unset):
            optional = self.optional

        provides: None | str | Unset
        if isinstance(self.provides, Unset):
            provides = UNSET
        else:
            provides = self.provides

        config_schema: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.config_schema, Unset):
            config_schema = []
            for config_schema_item_data in self.config_schema:
                config_schema_item = config_schema_item_data.to_dict()
                config_schema.append(config_schema_item)

        compose_file: None | str | Unset
        if isinstance(self.compose_file, Unset):
            compose_file = UNSET
        else:
            compose_file = self.compose_file

        service_name: None | str | Unset
        if isinstance(self.service_name, Unset):
            service_name = UNSET
        else:
            service_name = self.service_name

        provider_file: None | str | Unset
        if isinstance(self.provider_file, Unset):
            provider_file = UNSET
        else:
            provider_file = self.provider_file

        mode: None | str | Unset
        if isinstance(self.mode, Unset):
            mode = UNSET
        else:
            mode = self.mode

        icon: None | str | Unset
        if isinstance(self.icon, Unset):
            icon = UNSET
        else:
            icon = self.icon

        tags: list[str] | Unset = UNSET
        if not isinstance(self.tags, Unset):
            tags = self.tags

        configured = self.configured

        available = self.available

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "source": source,
                "name": name,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if requires is not UNSET:
            field_dict["requires"] = requires
        if optional is not UNSET:
            field_dict["optional"] = optional
        if provides is not UNSET:
            field_dict["provides"] = provides
        if config_schema is not UNSET:
            field_dict["config_schema"] = config_schema
        if compose_file is not UNSET:
            field_dict["compose_file"] = compose_file
        if service_name is not UNSET:
            field_dict["service_name"] = service_name
        if provider_file is not UNSET:
            field_dict["provider_file"] = provider_file
        if mode is not UNSET:
            field_dict["mode"] = mode
        if icon is not UNSET:
            field_dict["icon"] = icon
        if tags is not UNSET:
            field_dict["tags"] = tags
        if configured is not UNSET:
            field_dict["configured"] = configured
        if available is not UNSET:
            field_dict["available"] = available

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.template_config_schema_item import TemplateConfigSchemaItem

        d = dict(src_dict)
        id = d.pop("id")

        source = TemplateSource(d.pop("source"))

        name = d.pop("name")

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        requires = cast(list[str], d.pop("requires", UNSET))

        optional = cast(list[str], d.pop("optional", UNSET))

        def _parse_provides(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        provides = _parse_provides(d.pop("provides", UNSET))

        _config_schema = d.pop("config_schema", UNSET)
        config_schema: list[TemplateConfigSchemaItem] | Unset = UNSET
        if _config_schema is not UNSET:
            config_schema = []
            for config_schema_item_data in _config_schema:
                config_schema_item = TemplateConfigSchemaItem.from_dict(config_schema_item_data)

                config_schema.append(config_schema_item)

        def _parse_compose_file(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        compose_file = _parse_compose_file(d.pop("compose_file", UNSET))

        def _parse_service_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        service_name = _parse_service_name(d.pop("service_name", UNSET))

        def _parse_provider_file(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        provider_file = _parse_provider_file(d.pop("provider_file", UNSET))

        def _parse_mode(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        mode = _parse_mode(d.pop("mode", UNSET))

        def _parse_icon(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        icon = _parse_icon(d.pop("icon", UNSET))

        tags = cast(list[str], d.pop("tags", UNSET))

        configured = d.pop("configured", UNSET)

        available = d.pop("available", UNSET)

        template = cls(
            id=id,
            source=source,
            name=name,
            description=description,
            requires=requires,
            optional=optional,
            provides=provides,
            config_schema=config_schema,
            compose_file=compose_file,
            service_name=service_name,
            provider_file=provider_file,
            mode=mode,
            icon=icon,
            tags=tags,
            configured=configured,
            available=available,
        )

        template.additional_properties = d
        return template

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
