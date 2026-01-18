from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.service_definition_create_environment import ServiceDefinitionCreateEnvironment
    from ..models.service_definition_create_metadata import ServiceDefinitionCreateMetadata
    from ..models.service_definition_create_ports import ServiceDefinitionCreatePorts


T = TypeVar("T", bound="ServiceDefinitionCreate")


@_attrs_define
class ServiceDefinitionCreate:
    """Request to create a new service definition.

    Attributes:
        service_id (str):
        name (str):
        image (str):
        description (str | Unset):  Default: ''.
        ports (ServiceDefinitionCreatePorts | Unset):
        environment (ServiceDefinitionCreateEnvironment | Unset):
        volumes (list[str] | Unset):
        command (None | str | Unset):
        restart_policy (str | Unset):  Default: 'unless-stopped'.
        network (None | str | Unset):
        health_check_path (None | str | Unset):
        health_check_port (int | None | Unset):
        tags (list[str] | Unset):
        metadata (ServiceDefinitionCreateMetadata | Unset):
    """

    service_id: str
    name: str
    image: str
    description: str | Unset = ""
    ports: ServiceDefinitionCreatePorts | Unset = UNSET
    environment: ServiceDefinitionCreateEnvironment | Unset = UNSET
    volumes: list[str] | Unset = UNSET
    command: None | str | Unset = UNSET
    restart_policy: str | Unset = "unless-stopped"
    network: None | str | Unset = UNSET
    health_check_path: None | str | Unset = UNSET
    health_check_port: int | None | Unset = UNSET
    tags: list[str] | Unset = UNSET
    metadata: ServiceDefinitionCreateMetadata | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        service_id = self.service_id

        name = self.name

        image = self.image

        description = self.description

        ports: dict[str, Any] | Unset = UNSET
        if not isinstance(self.ports, Unset):
            ports = self.ports.to_dict()

        environment: dict[str, Any] | Unset = UNSET
        if not isinstance(self.environment, Unset):
            environment = self.environment.to_dict()

        volumes: list[str] | Unset = UNSET
        if not isinstance(self.volumes, Unset):
            volumes = self.volumes

        command: None | str | Unset
        if isinstance(self.command, Unset):
            command = UNSET
        else:
            command = self.command

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

        tags: list[str] | Unset = UNSET
        if not isinstance(self.tags, Unset):
            tags = self.tags

        metadata: dict[str, Any] | Unset = UNSET
        if not isinstance(self.metadata, Unset):
            metadata = self.metadata.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "service_id": service_id,
                "name": name,
                "image": image,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
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
        from ..models.service_definition_create_environment import ServiceDefinitionCreateEnvironment
        from ..models.service_definition_create_metadata import ServiceDefinitionCreateMetadata
        from ..models.service_definition_create_ports import ServiceDefinitionCreatePorts

        d = dict(src_dict)
        service_id = d.pop("service_id")

        name = d.pop("name")

        image = d.pop("image")

        description = d.pop("description", UNSET)

        _ports = d.pop("ports", UNSET)
        ports: ServiceDefinitionCreatePorts | Unset
        if isinstance(_ports, Unset):
            ports = UNSET
        else:
            ports = ServiceDefinitionCreatePorts.from_dict(_ports)

        _environment = d.pop("environment", UNSET)
        environment: ServiceDefinitionCreateEnvironment | Unset
        if isinstance(_environment, Unset):
            environment = UNSET
        else:
            environment = ServiceDefinitionCreateEnvironment.from_dict(_environment)

        volumes = cast(list[str], d.pop("volumes", UNSET))

        def _parse_command(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        command = _parse_command(d.pop("command", UNSET))

        restart_policy = d.pop("restart_policy", UNSET)

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

        tags = cast(list[str], d.pop("tags", UNSET))

        _metadata = d.pop("metadata", UNSET)
        metadata: ServiceDefinitionCreateMetadata | Unset
        if isinstance(_metadata, Unset):
            metadata = UNSET
        else:
            metadata = ServiceDefinitionCreateMetadata.from_dict(_metadata)

        service_definition_create = cls(
            service_id=service_id,
            name=name,
            image=image,
            description=description,
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

        service_definition_create.additional_properties = d
        return service_definition_create

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
