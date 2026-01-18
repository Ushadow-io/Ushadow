from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.mobile_connection_qr_connection_data import MobileConnectionQRConnectionData


T = TypeVar("T", bound="MobileConnectionQR")


@_attrs_define
class MobileConnectionQR:
    """QR code for mobile app connection.

    Contains minimal data for the QR code - just enough to connect.
    After connecting, mobile app fetches full details from /api/unodes/leader/info

        Attributes:
            qr_code_data (str):
            connection_data (MobileConnectionQRConnectionData):
            hostname (str):
            tailscale_ip (str):
            api_port (int):
            api_url (str):
            auth_token (str):
    """

    qr_code_data: str
    connection_data: MobileConnectionQRConnectionData
    hostname: str
    tailscale_ip: str
    api_port: int
    api_url: str
    auth_token: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        qr_code_data = self.qr_code_data

        connection_data = self.connection_data.to_dict()

        hostname = self.hostname

        tailscale_ip = self.tailscale_ip

        api_port = self.api_port

        api_url = self.api_url

        auth_token = self.auth_token

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "qr_code_data": qr_code_data,
                "connection_data": connection_data,
                "hostname": hostname,
                "tailscale_ip": tailscale_ip,
                "api_port": api_port,
                "api_url": api_url,
                "auth_token": auth_token,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.mobile_connection_qr_connection_data import MobileConnectionQRConnectionData

        d = dict(src_dict)
        qr_code_data = d.pop("qr_code_data")

        connection_data = MobileConnectionQRConnectionData.from_dict(d.pop("connection_data"))

        hostname = d.pop("hostname")

        tailscale_ip = d.pop("tailscale_ip")

        api_port = d.pop("api_port")

        api_url = d.pop("api_url")

        auth_token = d.pop("auth_token")

        mobile_connection_qr = cls(
            qr_code_data=qr_code_data,
            connection_data=connection_data,
            hostname=hostname,
            tailscale_ip=tailscale_ip,
            api_port=api_port,
            api_url=api_url,
            auth_token=auth_token,
        )

        mobile_connection_qr.additional_properties = d
        return mobile_connection_qr

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
