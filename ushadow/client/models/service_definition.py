from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.service_definition_environment import ServiceDefinitionEnvironment
    from ..models.service_definition_metadata import ServiceDefinitionMetadata
    from ..models.service_definition_ports import ServiceDefinitionPorts


T = TypeVar("T", bound="ServiceDefinition")


@_attrs_define
class ServiceDefinition:
    """A deployable service definition.

    Defines the Docker container configuration that can be deployed
    to one or more u-nodes.

        Attributes:
            service_id (str): Unique identifier for the service
            name (str): Display name
            image (str): Docker image (e.g., 'nginx:latest')
            description (str | Unset): Description of the service Default: ''.
            ports (ServiceDefinitionPorts | Unset): Port mappings: {'container_port/tcp': host_port}
            environment (ServiceDefinitionEnvironment | Unset): Environment variables
            volumes (list[str] | Unset): Volume mounts (e.g., '/host/path:/container/path')
            command (None | str | Unset): Override container command
            restart_policy (str | Unset): Restart policy: no, always, unless-stopped, on-failure Default: 'unless-stopped'.
            network (None | str | Unset): Docker network to join
            health_check_path (None | str | Unset): HTTP path for health checks (e.g., '/health')
            health_check_port (int | None | Unset): Port for health checks
            created_at (datetime.datetime | None | Unset):
            updated_at (datetime.datetime | None | Unset):
            created_by (None | str | Unset):
            tags (list[str] | Unset):
            metadata (ServiceDefinitionMetadata | Unset):
    """

    service_id: str
    name: str
    image: str
    description: str | Unset = ""
    ports: ServiceDefinitionPorts | Unset = UNSET
    environment: ServiceDefinitionEnvironment | Unset = UNSET
    volumes: list[str] | Unset = UNSET
    command: None | str | Unset = UNSET
    restart_policy: str | Unset = "unless-stopped"
    network: None | str | Unset = UNSET
    health_check_path: None | str | Unset = UNSET
    health_check_port: int | None | Unset = UNSET
    created_at: datetime.datetime | None | Unset = UNSET
    updated_at: datetime.datetime | None | Unset = UNSET
    created_by: None | str | Unset = UNSET
    tags: list[str] | Unset = UNSET
    metadata: ServiceDefinitionMetadata | Unset = UNSET
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

        created_at: None | str | Unset
        if isinstance(self.created_at, Unset):
            created_at = UNSET
        elif isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        updated_at: None | str | Unset
        if isinstance(self.updated_at, Unset):
            updated_at = UNSET
        elif isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        created_by: None | str | Unset
        if isinstance(self.created_by, Unset):
            created_by = UNSET
        else:
            created_by = self.created_by

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
        if created_at is not UNSET:
            field_dict["created_at"] = created_at
        if updated_at is not UNSET:
            field_dict["updated_at"] = updated_at
        if created_by is not UNSET:
            field_dict["created_by"] = created_by
        if tags is not UNSET:
            field_dict["tags"] = tags
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.service_definition_environment import ServiceDefinitionEnvironment
        from ..models.service_definition_metadata import ServiceDefinitionMetadata
        from ..models.service_definition_ports import ServiceDefinitionPorts

        d = dict(src_dict)
        service_id = d.pop("service_id")

        name = d.pop("name")

        image = d.pop("image")

        description = d.pop("description", UNSET)

        _ports = d.pop("ports", UNSET)
        ports: ServiceDefinitionPorts | Unset
        if isinstance(_ports, Unset):
            ports = UNSET
        else:
            ports = ServiceDefinitionPorts.from_dict(_ports)

        _environment = d.pop("environment", UNSET)
        environment: ServiceDefinitionEnvironment | Unset
        if isinstance(_environment, Unset):
            environment = UNSET
        else:
            environment = ServiceDefinitionEnvironment.from_dict(_environment)

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

        def _parse_created_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_type_0 = isoparse(data)

                return created_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        created_at = _parse_created_at(d.pop("created_at", UNSET))

        def _parse_updated_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_0 = isoparse(data)

                return updated_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        updated_at = _parse_updated_at(d.pop("updated_at", UNSET))

        def _parse_created_by(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        created_by = _parse_created_by(d.pop("created_by", UNSET))

        tags = cast(list[str], d.pop("tags", UNSET))

        _metadata = d.pop("metadata", UNSET)
        metadata: ServiceDefinitionMetadata | Unset
        if isinstance(_metadata, Unset):
            metadata = UNSET
        else:
            metadata = ServiceDefinitionMetadata.from_dict(_metadata)

        service_definition = cls(
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
            created_at=created_at,
            updated_at=updated_at,
            created_by=created_by,
            tags=tags,
            metadata=metadata,
        )

        service_definition.additional_properties = d
        return service_definition

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
