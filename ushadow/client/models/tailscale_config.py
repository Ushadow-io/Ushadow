from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.deployment_mode import DeploymentMode


T = TypeVar("T", bound="TailscaleConfig")


@_attrs_define
class TailscaleConfig:
    """Complete Tailscale configuration

    Attributes:
        hostname (str): Tailscale hostname (e.g., machine-name.tail12345.ts.net)
        deployment_mode (DeploymentMode): Deployment mode configuration
        use_caddy_proxy (bool): True for multi-env, False for single-env
        https_enabled (bool | Unset):  Default: True.
        backend_port (int | Unset):  Default: 8000.
        frontend_port (int | None | Unset):
        environments (list[str] | Unset):
    """

    hostname: str
    deployment_mode: DeploymentMode
    use_caddy_proxy: bool
    https_enabled: bool | Unset = True
    backend_port: int | Unset = 8000
    frontend_port: int | None | Unset = UNSET
    environments: list[str] | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        hostname = self.hostname

        deployment_mode = self.deployment_mode.to_dict()

        use_caddy_proxy = self.use_caddy_proxy

        https_enabled = self.https_enabled

        backend_port = self.backend_port

        frontend_port: int | None | Unset
        if isinstance(self.frontend_port, Unset):
            frontend_port = UNSET
        else:
            frontend_port = self.frontend_port

        environments: list[str] | Unset = UNSET
        if not isinstance(self.environments, Unset):
            environments = self.environments

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "hostname": hostname,
                "deployment_mode": deployment_mode,
                "use_caddy_proxy": use_caddy_proxy,
            }
        )
        if https_enabled is not UNSET:
            field_dict["https_enabled"] = https_enabled
        if backend_port is not UNSET:
            field_dict["backend_port"] = backend_port
        if frontend_port is not UNSET:
            field_dict["frontend_port"] = frontend_port
        if environments is not UNSET:
            field_dict["environments"] = environments

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.deployment_mode import DeploymentMode

        d = dict(src_dict)
        hostname = d.pop("hostname")

        deployment_mode = DeploymentMode.from_dict(d.pop("deployment_mode"))

        use_caddy_proxy = d.pop("use_caddy_proxy")

        https_enabled = d.pop("https_enabled", UNSET)

        backend_port = d.pop("backend_port", UNSET)

        def _parse_frontend_port(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        frontend_port = _parse_frontend_port(d.pop("frontend_port", UNSET))

        environments = cast(list[str], d.pop("environments", UNSET))

        tailscale_config = cls(
            hostname=hostname,
            deployment_mode=deployment_mode,
            use_caddy_proxy=use_caddy_proxy,
            https_enabled=https_enabled,
            backend_port=backend_port,
            frontend_port=frontend_port,
            environments=environments,
        )

        tailscale_config.additional_properties = d
        return tailscale_config

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
