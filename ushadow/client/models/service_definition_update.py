from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.service_definition_update_environment_type_0 import ServiceDefinitionUpdateEnvironmentType0
    from ..models.service_definition_update_metadata_type_0 import ServiceDefinitionUpdateMetadataType0
    from ..models.service_definition_update_ports_type_0 import ServiceDefinitionUpdatePortsType0


T = TypeVar("T", bound="ServiceDefinitionUpdate")


@_attrs_define
class ServiceDefinitionUpdate:
    """Request to update a service definition.

    Attributes:
        name (None | str | Unset):
        description (None | str | Unset):
        image (None | str | Unset):
        ports (None | ServiceDefinitionUpdatePortsType0 | Unset):
        environment (None | ServiceDefinitionUpdateEnvironmentType0 | Unset):
        volumes (list[str] | None | Unset):
        command (None | str | Unset):
        restart_policy (None | str | Unset):
        network (None | str | Unset):
        health_check_path (None | str | Unset):
        health_check_port (int | None | Unset):
        tags (list[str] | None | Unset):
        metadata (None | ServiceDefinitionUpdateMetadataType0 | Unset):
    """

    name: None | str | Unset = UNSET
    description: None | str | Unset = UNSET
    image: None | str | Unset = UNSET
    ports: None | ServiceDefinitionUpdatePortsType0 | Unset = UNSET
    environment: None | ServiceDefinitionUpdateEnvironmentType0 | Unset = UNSET
    volumes: list[str] | None | Unset = UNSET
    command: None | str | Unset = UNSET
    restart_policy: None | str | Unset = UNSET
    network: None | str | Unset = UNSET
    health_check_path: None | str | Unset = UNSET
    health_check_port: int | None | Unset = UNSET
    tags: list[str] | None | Unset = UNSET
    metadata: None | ServiceDefinitionUpdateMetadataType0 | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.service_definition_update_environment_type_0 import ServiceDefinitionUpdateEnvironmentType0
        from ..models.service_definition_update_metadata_type_0 import ServiceDefinitionUpdateMetadataType0
        from ..models.service_definition_update_ports_type_0 import ServiceDefinitionUpdatePortsType0

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

        image: None | str | Unset
        if isinstance(self.image, Unset):
            image = UNSET
        else:
            image = self.image

        ports: dict[str, Any] | None | Unset
        if isinstance(self.ports, Unset):
            ports = UNSET
        elif isinstance(self.ports, ServiceDefinitionUpdatePortsType0):
            ports = self.ports.to_dict()
        else:
            ports = self.ports

        environment: dict[str, Any] | None | Unset
        if isinstance(self.environment, Unset):
            environment = UNSET
        elif isinstance(self.environment, ServiceDefinitionUpdateEnvironmentType0):
            environment = self.environment.to_dict()
        else:
            environment = self.environment

        volumes: list[str] | None | Unset
        if isinstance(self.volumes, Unset):
            volumes = UNSET
        elif isinstance(self.volumes, list):
            volumes = self.volumes

        else:
            volumes = self.volumes

        command: None | str | Unset
        if isinstance(self.command, Unset):
            command = UNSET
        else:
            command = self.command

        restart_policy: None | str | Unset
        if isinstance(self.restart_policy, Unset):
            restart_policy = UNSET
        else:
            restart_policy = self.restart_policy

        network: None | str | Unset
        if isinstance(self.network, Unset):
            network = UNSET
        else:
            network = self.network

        health_check_path: None | str | Unset
        if isinstance(self.health_check_path, Unset):
            health_check_path = UNSET
        else:
            health_check_path = self.health_check_path

        health_check_port: int | None | Unset
        if isinstance(self.health_check_port, Unset):
            health_check_port = UNSET
        else:
            health_check_port = self.health_check_port

        tags: list[str] | None | Unset
        if isinstance(self.tags, Unset):
            tags = UNSET
        elif isinstance(self.tags, list):
            tags = self.tags

        else:
            tags = self.tags

        metadata: dict[str, Any] | None | Unset
        if isinstance(self.metadata, Unset):
            metadata = UNSET
        elif isinstance(self.metadata, ServiceDefinitionUpdateMetadataType0):
            metadata = self.metadata.to_dict()
        else:
            metadata = self.metadata

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if name is not UNSET:
            field_dict["name"] = name
        if description is not UNSET:
            field_dict["description"] = description
        if image is not UNSET:
            field_dict["image"] = image
        if ports is not UNSET:
            field_dict["ports"] = ports
        if environment is not UNSET:
            field_dict["environment"] = environment
        if volumes is not UNSET:
            field_dict["volumes"] = volumes
        if command is not UNSET:
            field_dict["command"] = command
        if restart_policy is not UNSET:
            field_dict["restart_policy"] = restart_policy
        if network is not UNSET:
            field_dict["network"] = network
        if health_check_path is not UNSET:
            field_dict["health_check_path"] = health_check_path
        if health_check_port is not UNSET:
            field_dict["health_check_port"] = health_check_port
        if tags is not UNSET:
            field_dict["tags"] = tags
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.service_definition_update_environment_type_0 import ServiceDefinitionUpdateEnvironmentType0
        from ..models.service_definition_update_metadata_type_0 import ServiceDefinitionUpdateMetadataType0
        from ..models.service_definition_update_ports_type_0 import ServiceDefinitionUpdatePortsType0

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

        def _parse_image(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        image = _parse_image(d.pop("image", UNSET))

        def _parse_ports(data: object) -> None | ServiceDefinitionUpdatePortsType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                ports_type_0 = ServiceDefinitionUpdatePortsType0.from_dict(data)

                return ports_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | ServiceDefinitionUpdatePortsType0 | Unset, data)

        ports = _parse_ports(d.pop("ports", UNSET))

        def _parse_environment(data: object) -> None | ServiceDefinitionUpdateEnvironmentType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                environment_type_0 = ServiceDefinitionUpdateEnvironmentType0.from_dict(data)

                return environment_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | ServiceDefinitionUpdateEnvironmentType0 | Unset, data)

        environment = _parse_environment(d.pop("environment", UNSET))

        def _parse_volumes(data: object) -> list[str] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                volumes_type_0 = cast(list[str], data)

                return volumes_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[str] | None | Unset, data)

        volumes = _parse_volumes(d.pop("volumes", UNSET))

        def _parse_command(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        command = _parse_command(d.pop("command", UNSET))

        def _parse_restart_policy(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        restart_policy = _parse_restart_policy(d.pop("restart_policy", UNSET))

        def _parse_network(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        network = _parse_network(d.pop("network", UNSET))

        def _parse_health_check_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        health_check_path = _parse_health_check_path(d.pop("health_check_path", UNSET))

        def _parse_health_check_port(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        health_check_port = _parse_health_check_port(d.pop("health_check_port", UNSET))

        def _parse_tags(data: object) -> list[str] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                tags_type_0 = cast(list[str], data)

                return tags_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[str] | None | Unset, data)

        tags = _parse_tags(d.pop("tags", UNSET))

        def _parse_metadata(data: object) -> None | ServiceDefinitionUpdateMetadataType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                metadata_type_0 = ServiceDefinitionUpdateMetadataType0.from_dict(data)

                return metadata_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | ServiceDefinitionUpdateMetadataType0 | Unset, data)

        metadata = _parse_metadata(d.pop("metadata", UNSET))

        service_definition_update = cls(
            name=name,
            description=description,
            image=image,
            ports=ports,
            environment=environment,
            volumes=volumes,
            command=command,
            restart_policy=restart_policy,
            network=network,
            health_check_path=health_check_path,
            health_check_port=health_check_port,
            tags=tags,
            metadata=metadata,
        )

        service_definition_update.additional_properties = d
        return service_definition_update

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
