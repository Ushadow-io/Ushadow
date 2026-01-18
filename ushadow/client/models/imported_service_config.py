from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.imported_service_config_source_type import ImportedServiceConfigSourceType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.env_var_config_item import EnvVarConfigItem
    from ..models.port_config import PortConfig
    from ..models.shadow_header_config import ShadowHeaderConfig
    from ..models.volume_config import VolumeConfig


T = TypeVar("T", bound="ImportedServiceConfig")


@_attrs_define
class ImportedServiceConfig:
    """Full configuration for an imported service.

    Attributes:
        service_name (str):
        source_url (str):
        display_name (None | str | Unset):
        description (None | str | Unset):
        source_type (ImportedServiceConfigSourceType | Unset):  Default: ImportedServiceConfigSourceType.GITHUB.
        compose_path (None | str | Unset):
        docker_image (None | str | Unset):
        ports (list[PortConfig] | Unset):
        volumes (list[VolumeConfig] | Unset):
        shadow_header (ShadowHeaderConfig | Unset): Configuration for shadow header routing.
        env_vars (list[EnvVarConfigItem] | Unset):
        enabled (bool | Unset):  Default: True.
        capabilities (list[str] | Unset): Capabilities this service provides
    """

    service_name: str
    source_url: str
    display_name: None | str | Unset = UNSET
    description: None | str | Unset = UNSET
    source_type: ImportedServiceConfigSourceType | Unset = ImportedServiceConfigSourceType.GITHUB
    compose_path: None | str | Unset = UNSET
    docker_image: None | str | Unset = UNSET
    ports: list[PortConfig] | Unset = UNSET
    volumes: list[VolumeConfig] | Unset = UNSET
    shadow_header: ShadowHeaderConfig | Unset = UNSET
    env_vars: list[EnvVarConfigItem] | Unset = UNSET
    enabled: bool | Unset = True
    capabilities: list[str] | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        service_name = self.service_name

        source_url = self.source_url

        display_name: None | str | Unset
        if isinstance(self.display_name, Unset):
            display_name = UNSET
        else:
            display_name = self.display_name

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        source_type: str | Unset = UNSET
        if not isinstance(self.source_type, Unset):
            source_type = self.source_type.value

        compose_path: None | str | Unset
        if isinstance(self.compose_path, Unset):
            compose_path = UNSET
        else:
            compose_path = self.compose_path

        docker_image: None | str | Unset
        if isinstance(self.docker_image, Unset):
            docker_image = UNSET
        else:
            docker_image = self.docker_image

        ports: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.ports, Unset):
            ports = []
            for ports_item_data in self.ports:
                ports_item = ports_item_data.to_dict()
                ports.append(ports_item)

        volumes: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.volumes, Unset):
            volumes = []
            for volumes_item_data in self.volumes:
                volumes_item = volumes_item_data.to_dict()
                volumes.append(volumes_item)

        shadow_header: dict[str, Any] | Unset = UNSET
        if not isinstance(self.shadow_header, Unset):
            shadow_header = self.shadow_header.to_dict()

        env_vars: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.env_vars, Unset):
            env_vars = []
            for env_vars_item_data in self.env_vars:
                env_vars_item = env_vars_item_data.to_dict()
                env_vars.append(env_vars_item)

        enabled = self.enabled

        capabilities: list[str] | Unset = UNSET
        if not isinstance(self.capabilities, Unset):
            capabilities = self.capabilities

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "service_name": service_name,
                "source_url": source_url,
            }
        )
        if display_name is not UNSET:
            field_dict["display_name"] = display_name
        if description is not UNSET:
            field_dict["description"] = description
        if source_type is not UNSET:
            field_dict["source_type"] = source_type
        if compose_path is not UNSET:
            field_dict["compose_path"] = compose_path
        if docker_image is not UNSET:
            field_dict["docker_image"] = docker_image
        if ports is not UNSET:
            field_dict["ports"] = ports
        if volumes is not UNSET:
            field_dict["volumes"] = volumes
        if shadow_header is not UNSET:
            field_dict["shadow_header"] = shadow_header
        if env_vars is not UNSET:
            field_dict["env_vars"] = env_vars
        if enabled is not UNSET:
            field_dict["enabled"] = enabled
        if capabilities is not UNSET:
            field_dict["capabilities"] = capabilities

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.env_var_config_item import EnvVarConfigItem
        from ..models.port_config import PortConfig
        from ..models.shadow_header_config import ShadowHeaderConfig
        from ..models.volume_config import VolumeConfig

        d = dict(src_dict)
        service_name = d.pop("service_name")

        source_url = d.pop("source_url")

        def _parse_display_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        display_name = _parse_display_name(d.pop("display_name", UNSET))

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        _source_type = d.pop("source_type", UNSET)
        source_type: ImportedServiceConfigSourceType | Unset
        if isinstance(_source_type, Unset):
            source_type = UNSET
        else:
            source_type = ImportedServiceConfigSourceType(_source_type)

        def _parse_compose_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        compose_path = _parse_compose_path(d.pop("compose_path", UNSET))

        def _parse_docker_image(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        docker_image = _parse_docker_image(d.pop("docker_image", UNSET))

        _ports = d.pop("ports", UNSET)
        ports: list[PortConfig] | Unset = UNSET
        if _ports is not UNSET:
            ports = []
            for ports_item_data in _ports:
                ports_item = PortConfig.from_dict(ports_item_data)

                ports.append(ports_item)

        _volumes = d.pop("volumes", UNSET)
        volumes: list[VolumeConfig] | Unset = UNSET
        if _volumes is not UNSET:
            volumes = []
            for volumes_item_data in _volumes:
                volumes_item = VolumeConfig.from_dict(volumes_item_data)

                volumes.append(volumes_item)

        _shadow_header = d.pop("shadow_header", UNSET)
        shadow_header: ShadowHeaderConfig | Unset
        if isinstance(_shadow_header, Unset):
            shadow_header = UNSET
        else:
            shadow_header = ShadowHeaderConfig.from_dict(_shadow_header)

        _env_vars = d.pop("env_vars", UNSET)
        env_vars: list[EnvVarConfigItem] | Unset = UNSET
        if _env_vars is not UNSET:
            env_vars = []
            for env_vars_item_data in _env_vars:
                env_vars_item = EnvVarConfigItem.from_dict(env_vars_item_data)

                env_vars.append(env_vars_item)

        enabled = d.pop("enabled", UNSET)

        capabilities = cast(list[str], d.pop("capabilities", UNSET))

        imported_service_config = cls(
            service_name=service_name,
            source_url=source_url,
            display_name=display_name,
            description=description,
            source_type=source_type,
            compose_path=compose_path,
            docker_image=docker_image,
            ports=ports,
            volumes=volumes,
            shadow_header=shadow_header,
            env_vars=env_vars,
            enabled=enabled,
            capabilities=capabilities,
        )

        imported_service_config.additional_properties = d
        return imported_service_config

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
