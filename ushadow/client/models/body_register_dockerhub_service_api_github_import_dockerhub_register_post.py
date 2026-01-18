from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.body_register_dockerhub_service_api_github_import_dockerhub_register_post_env_vars_type_0_item import (
        BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostEnvVarsType0Item,
    )
    from ..models.body_register_dockerhub_service_api_github_import_dockerhub_register_post_ports_type_0_item import (
        BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostPortsType0Item,
    )
    from ..models.body_register_dockerhub_service_api_github_import_dockerhub_register_post_volumes_type_0_item import (
        BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostVolumesType0Item,
    )


T = TypeVar("T", bound="BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost")


@_attrs_define
class BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost:
    """
    Attributes:
        ports (list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostPortsType0Item] | None | Unset):
        volumes (list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostVolumesType0Item] | None | Unset):
        env_vars (list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostEnvVarsType0Item] | None |
            Unset):
        capabilities (list[str] | None | Unset):
    """

    ports: list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostPortsType0Item] | None | Unset = UNSET
    volumes: list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostVolumesType0Item] | None | Unset = (
        UNSET
    )
    env_vars: list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostEnvVarsType0Item] | None | Unset = (
        UNSET
    )
    capabilities: list[str] | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        ports: list[dict[str, Any]] | None | Unset
        if isinstance(self.ports, Unset):
            ports = UNSET
        elif isinstance(self.ports, list):
            ports = []
            for ports_type_0_item_data in self.ports:
                ports_type_0_item = ports_type_0_item_data.to_dict()
                ports.append(ports_type_0_item)

        else:
            ports = self.ports

        volumes: list[dict[str, Any]] | None | Unset
        if isinstance(self.volumes, Unset):
            volumes = UNSET
        elif isinstance(self.volumes, list):
            volumes = []
            for volumes_type_0_item_data in self.volumes:
                volumes_type_0_item = volumes_type_0_item_data.to_dict()
                volumes.append(volumes_type_0_item)

        else:
            volumes = self.volumes

        env_vars: list[dict[str, Any]] | None | Unset
        if isinstance(self.env_vars, Unset):
            env_vars = UNSET
        elif isinstance(self.env_vars, list):
            env_vars = []
            for env_vars_type_0_item_data in self.env_vars:
                env_vars_type_0_item = env_vars_type_0_item_data.to_dict()
                env_vars.append(env_vars_type_0_item)

        else:
            env_vars = self.env_vars

        capabilities: list[str] | None | Unset
        if isinstance(self.capabilities, Unset):
            capabilities = UNSET
        elif isinstance(self.capabilities, list):
            capabilities = self.capabilities

        else:
            capabilities = self.capabilities

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if ports is not UNSET:
            field_dict["ports"] = ports
        if volumes is not UNSET:
            field_dict["volumes"] = volumes
        if env_vars is not UNSET:
            field_dict["env_vars"] = env_vars
        if capabilities is not UNSET:
            field_dict["capabilities"] = capabilities

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.body_register_dockerhub_service_api_github_import_dockerhub_register_post_env_vars_type_0_item import (
            BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostEnvVarsType0Item,
        )
        from ..models.body_register_dockerhub_service_api_github_import_dockerhub_register_post_ports_type_0_item import (
            BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostPortsType0Item,
        )
        from ..models.body_register_dockerhub_service_api_github_import_dockerhub_register_post_volumes_type_0_item import (
            BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostVolumesType0Item,
        )

        d = dict(src_dict)

        def _parse_ports(
            data: object,
        ) -> list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostPortsType0Item] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                ports_type_0 = []
                _ports_type_0 = data
                for ports_type_0_item_data in _ports_type_0:
                    ports_type_0_item = (
                        BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostPortsType0Item.from_dict(
                            ports_type_0_item_data
                        )
                    )

                    ports_type_0.append(ports_type_0_item)

                return ports_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(
                list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostPortsType0Item] | None | Unset,
                data,
            )

        ports = _parse_ports(d.pop("ports", UNSET))

        def _parse_volumes(
            data: object,
        ) -> list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostVolumesType0Item] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                volumes_type_0 = []
                _volumes_type_0 = data
                for volumes_type_0_item_data in _volumes_type_0:
                    volumes_type_0_item = (
                        BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostVolumesType0Item.from_dict(
                            volumes_type_0_item_data
                        )
                    )

                    volumes_type_0.append(volumes_type_0_item)

                return volumes_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(
                list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostVolumesType0Item] | None | Unset,
                data,
            )

        volumes = _parse_volumes(d.pop("volumes", UNSET))

        def _parse_env_vars(
            data: object,
        ) -> list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostEnvVarsType0Item] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                env_vars_type_0 = []
                _env_vars_type_0 = data
                for env_vars_type_0_item_data in _env_vars_type_0:
                    env_vars_type_0_item = (
                        BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostEnvVarsType0Item.from_dict(
                            env_vars_type_0_item_data
                        )
                    )

                    env_vars_type_0.append(env_vars_type_0_item)

                return env_vars_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(
                list[BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPostEnvVarsType0Item] | None | Unset,
                data,
            )

        env_vars = _parse_env_vars(d.pop("env_vars", UNSET))

        def _parse_capabilities(data: object) -> list[str] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                capabilities_type_0 = cast(list[str], data)

                return capabilities_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[str] | None | Unset, data)

        capabilities = _parse_capabilities(d.pop("capabilities", UNSET))

        body_register_dockerhub_service_api_github_import_dockerhub_register_post = cls(
            ports=ports,
            volumes=volumes,
            env_vars=env_vars,
            capabilities=capabilities,
        )

        body_register_dockerhub_service_api_github_import_dockerhub_register_post.additional_properties = d
        return body_register_dockerhub_service_api_github_import_dockerhub_register_post

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
