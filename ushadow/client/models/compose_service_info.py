from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.compose_env_var_info import ComposeEnvVarInfo
    from ..models.compose_service_info_healthcheck_type_0 import ComposeServiceInfoHealthcheckType0
    from ..models.compose_service_info_ports_item import ComposeServiceInfoPortsItem


T = TypeVar("T", bound="ComposeServiceInfo")


@_attrs_define
class ComposeServiceInfo:
    """Service information extracted from compose file.

    Attributes:
        name (str):
        image (None | str | Unset):
        ports (list[ComposeServiceInfoPortsItem] | Unset):
        environment (list[ComposeEnvVarInfo] | Unset):
        depends_on (list[str] | Unset):
        volumes (list[str] | Unset):
        networks (list[str] | Unset):
        command (None | str | Unset):
        healthcheck (ComposeServiceInfoHealthcheckType0 | None | Unset):
    """

    name: str
    image: None | str | Unset = UNSET
    ports: list[ComposeServiceInfoPortsItem] | Unset = UNSET
    environment: list[ComposeEnvVarInfo] | Unset = UNSET
    depends_on: list[str] | Unset = UNSET
    volumes: list[str] | Unset = UNSET
    networks: list[str] | Unset = UNSET
    command: None | str | Unset = UNSET
    healthcheck: ComposeServiceInfoHealthcheckType0 | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.compose_service_info_healthcheck_type_0 import ComposeServiceInfoHealthcheckType0

        name = self.name

        image: None | str | Unset
        if isinstance(self.image, Unset):
            image = UNSET
        else:
            image = self.image

        ports: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.ports, Unset):
            ports = []
            for ports_item_data in self.ports:
                ports_item = ports_item_data.to_dict()
                ports.append(ports_item)

        environment: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.environment, Unset):
            environment = []
            for environment_item_data in self.environment:
                environment_item = environment_item_data.to_dict()
                environment.append(environment_item)

        depends_on: list[str] | Unset = UNSET
        if not isinstance(self.depends_on, Unset):
            depends_on = self.depends_on

        volumes: list[str] | Unset = UNSET
        if not isinstance(self.volumes, Unset):
            volumes = self.volumes

        networks: list[str] | Unset = UNSET
        if not isinstance(self.networks, Unset):
            networks = self.networks

        command: None | str | Unset
        if isinstance(self.command, Unset):
            command = UNSET
        else:
            command = self.command

        healthcheck: dict[str, Any] | None | Unset
        if isinstance(self.healthcheck, Unset):
            healthcheck = UNSET
        elif isinstance(self.healthcheck, ComposeServiceInfoHealthcheckType0):
            healthcheck = self.healthcheck.to_dict()
        else:
            healthcheck = self.healthcheck

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
            }
        )
        if image is not UNSET:
            field_dict["image"] = image
        if ports is not UNSET:
            field_dict["ports"] = ports
        if environment is not UNSET:
            field_dict["environment"] = environment
        if depends_on is not UNSET:
            field_dict["depends_on"] = depends_on
        if volumes is not UNSET:
            field_dict["volumes"] = volumes
        if networks is not UNSET:
            field_dict["networks"] = networks
        if command is not UNSET:
            field_dict["command"] = command
        if healthcheck is not UNSET:
            field_dict["healthcheck"] = healthcheck

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.compose_env_var_info import ComposeEnvVarInfo
        from ..models.compose_service_info_healthcheck_type_0 import ComposeServiceInfoHealthcheckType0
        from ..models.compose_service_info_ports_item import ComposeServiceInfoPortsItem

        d = dict(src_dict)
        name = d.pop("name")

        def _parse_image(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        image = _parse_image(d.pop("image", UNSET))

        _ports = d.pop("ports", UNSET)
        ports: list[ComposeServiceInfoPortsItem] | Unset = UNSET
        if _ports is not UNSET:
            ports = []
            for ports_item_data in _ports:
                ports_item = ComposeServiceInfoPortsItem.from_dict(ports_item_data)

                ports.append(ports_item)

        _environment = d.pop("environment", UNSET)
        environment: list[ComposeEnvVarInfo] | Unset = UNSET
        if _environment is not UNSET:
            environment = []
            for environment_item_data in _environment:
                environment_item = ComposeEnvVarInfo.from_dict(environment_item_data)

                environment.append(environment_item)

        depends_on = cast(list[str], d.pop("depends_on", UNSET))

        volumes = cast(list[str], d.pop("volumes", UNSET))

        networks = cast(list[str], d.pop("networks", UNSET))

        def _parse_command(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        command = _parse_command(d.pop("command", UNSET))

        def _parse_healthcheck(data: object) -> ComposeServiceInfoHealthcheckType0 | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                healthcheck_type_0 = ComposeServiceInfoHealthcheckType0.from_dict(data)

                return healthcheck_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(ComposeServiceInfoHealthcheckType0 | None | Unset, data)

        healthcheck = _parse_healthcheck(d.pop("healthcheck", UNSET))

        compose_service_info = cls(
            name=name,
            image=image,
            ports=ports,
            environment=environment,
            depends_on=depends_on,
            volumes=volumes,
            networks=networks,
            command=command,
            healthcheck=healthcheck,
        )

        compose_service_info.additional_properties = d
        return compose_service_info

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
