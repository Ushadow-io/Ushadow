from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ServiceDeployment")


@_attrs_define
class ServiceDeployment:
    """A service deployed on a unode.

    Attributes:
        name (str):
        display_name (str):
        status (str):
        unode_hostname (str):
        route_path (None | str | Unset):
        internal_port (int | None | Unset):
        external_url (None | str | Unset):
        internal_url (None | str | Unset):
        ws_pcm_url (None | str | Unset):
        ws_omi_url (None | str | Unset):
    """

    name: str
    display_name: str
    status: str
    unode_hostname: str
    route_path: None | str | Unset = UNSET
    internal_port: int | None | Unset = UNSET
    external_url: None | str | Unset = UNSET
    internal_url: None | str | Unset = UNSET
    ws_pcm_url: None | str | Unset = UNSET
    ws_omi_url: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        display_name = self.display_name

        status = self.status

        unode_hostname = self.unode_hostname

        route_path: None | str | Unset
        if isinstance(self.route_path, Unset):
            route_path = UNSET
        else:
            route_path = self.route_path

        internal_port: int | None | Unset
        if isinstance(self.internal_port, Unset):
            internal_port = UNSET
        else:
            internal_port = self.internal_port

        external_url: None | str | Unset
        if isinstance(self.external_url, Unset):
            external_url = UNSET
        else:
            external_url = self.external_url

        internal_url: None | str | Unset
        if isinstance(self.internal_url, Unset):
            internal_url = UNSET
        else:
            internal_url = self.internal_url

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
                "name": name,
                "display_name": display_name,
                "status": status,
                "unode_hostname": unode_hostname,
            }
        )
        if route_path is not UNSET:
            field_dict["route_path"] = route_path
        if internal_port is not UNSET:
            field_dict["internal_port"] = internal_port
        if external_url is not UNSET:
            field_dict["external_url"] = external_url
        if internal_url is not UNSET:
            field_dict["internal_url"] = internal_url
        if ws_pcm_url is not UNSET:
            field_dict["ws_pcm_url"] = ws_pcm_url
        if ws_omi_url is not UNSET:
            field_dict["ws_omi_url"] = ws_omi_url

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        name = d.pop("name")

        display_name = d.pop("display_name")

        status = d.pop("status")

        unode_hostname = d.pop("unode_hostname")

        def _parse_route_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        route_path = _parse_route_path(d.pop("route_path", UNSET))

        def _parse_internal_port(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        internal_port = _parse_internal_port(d.pop("internal_port", UNSET))

        def _parse_external_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        external_url = _parse_external_url(d.pop("external_url", UNSET))

        def _parse_internal_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        internal_url = _parse_internal_url(d.pop("internal_url", UNSET))

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

        service_deployment = cls(
            name=name,
            display_name=display_name,
            status=status,
            unode_hostname=unode_hostname,
            route_path=route_path,
            internal_port=internal_port,
            external_url=external_url,
            internal_url=internal_url,
            ws_pcm_url=ws_pcm_url,
            ws_omi_url=ws_omi_url,
        )

        service_deployment.additional_properties = d
        return service_deployment

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
