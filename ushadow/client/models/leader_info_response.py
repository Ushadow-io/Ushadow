from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.service_deployment import ServiceDeployment
    from ..models.u_node import UNode
    from ..models.u_node_capabilities import UNodeCapabilities


T = TypeVar("T", bound="LeaderInfoResponse")


@_attrs_define
class LeaderInfoResponse:
    """Full leader information for mobile app connection.

    This endpoint returns everything the mobile app needs after connecting:
    - Leader node details and capabilities
    - WebSocket streaming URLs for audio
    - All unodes in the cluster
    - Services deployed across the cluster

        Attributes:
            hostname (str):
            tailscale_ip (str):
            capabilities (UNodeCapabilities): Capabilities of a u-node.
            ushadow_api_url (str):
            unodes (list[UNode]):
            services (list[ServiceDeployment]):
            tailscale_hostname (None | str | Unset):
            api_port (int | Unset):  Default: 8000.
            chronicle_api_url (None | str | Unset):
            ws_pcm_url (None | str | Unset):
            ws_omi_url (None | str | Unset):
    """

    hostname: str
    tailscale_ip: str
    capabilities: UNodeCapabilities
    ushadow_api_url: str
    unodes: list[UNode]
    services: list[ServiceDeployment]
    tailscale_hostname: None | str | Unset = UNSET
    api_port: int | Unset = 8000
    chronicle_api_url: None | str | Unset = UNSET
    ws_pcm_url: None | str | Unset = UNSET
    ws_omi_url: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        hostname = self.hostname

        tailscale_ip = self.tailscale_ip

        capabilities = self.capabilities.to_dict()

        ushadow_api_url = self.ushadow_api_url

        unodes = []
        for unodes_item_data in self.unodes:
            unodes_item = unodes_item_data.to_dict()
            unodes.append(unodes_item)

        services = []
        for services_item_data in self.services:
            services_item = services_item_data.to_dict()
            services.append(services_item)

        tailscale_hostname: None | str | Unset
        if isinstance(self.tailscale_hostname, Unset):
            tailscale_hostname = UNSET
        else:
            tailscale_hostname = self.tailscale_hostname

        api_port = self.api_port

        chronicle_api_url: None | str | Unset
        if isinstance(self.chronicle_api_url, Unset):
            chronicle_api_url = UNSET
        else:
            chronicle_api_url = self.chronicle_api_url

        ws_pcm_url: None | str | Unset
        if isinstance(self.ws_pcm_url, Unset):
            ws_pcm_url = UNSET
        else:
            ws_pcm_url = self.ws_pcm_url

        ws_omi_url: None | str | Unset
        if isinstance(self.ws_omi_url, Unset):
            ws_omi_url = UNSET
        else:
            ws_omi_url = self.ws_omi_url

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "hostname": hostname,
                "tailscale_ip": tailscale_ip,
                "capabilities": capabilities,
                "ushadow_api_url": ushadow_api_url,
                "unodes": unodes,
                "services": services,
            }
        )
        if tailscale_hostname is not UNSET:
            field_dict["tailscale_hostname"] = tailscale_hostname
        if api_port is not UNSET:
            field_dict["api_port"] = api_port
        if chronicle_api_url is not UNSET:
            field_dict["chronicle_api_url"] = chronicle_api_url
        if ws_pcm_url is not UNSET:
            field_dict["ws_pcm_url"] = ws_pcm_url
        if ws_omi_url is not UNSET:
            field_dict["ws_omi_url"] = ws_omi_url

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.service_deployment import ServiceDeployment
        from ..models.u_node import UNode
        from ..models.u_node_capabilities import UNodeCapabilities

        d = dict(src_dict)
        hostname = d.pop("hostname")

        tailscale_ip = d.pop("tailscale_ip")

        capabilities = UNodeCapabilities.from_dict(d.pop("capabilities"))

        ushadow_api_url = d.pop("ushadow_api_url")

        unodes = []
        _unodes = d.pop("unodes")
        for unodes_item_data in _unodes:
            unodes_item = UNode.from_dict(unodes_item_data)

            unodes.append(unodes_item)

        services = []
        _services = d.pop("services")
        for services_item_data in _services:
            services_item = ServiceDeployment.from_dict(services_item_data)

            services.append(services_item)

        def _parse_tailscale_hostname(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        tailscale_hostname = _parse_tailscale_hostname(d.pop("tailscale_hostname", UNSET))

        api_port = d.pop("api_port", UNSET)

        def _parse_chronicle_api_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        chronicle_api_url = _parse_chronicle_api_url(d.pop("chronicle_api_url", UNSET))

        def _parse_ws_pcm_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        ws_pcm_url = _parse_ws_pcm_url(d.pop("ws_pcm_url", UNSET))

        def _parse_ws_omi_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        ws_omi_url = _parse_ws_omi_url(d.pop("ws_omi_url", UNSET))

        leader_info_response = cls(
            hostname=hostname,
            tailscale_ip=tailscale_ip,
            capabilities=capabilities,
            ushadow_api_url=ushadow_api_url,
            unodes=unodes,
            services=services,
            tailscale_hostname=tailscale_hostname,
            api_port=api_port,
            chronicle_api_url=chronicle_api_url,
            ws_pcm_url=ws_pcm_url,
            ws_omi_url=ws_omi_url,
        )

        leader_info_response.additional_properties = d
        return leader_info_response

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
