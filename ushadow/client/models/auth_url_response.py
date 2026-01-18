from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="AuthUrlResponse")


@_attrs_define
class AuthUrlResponse:
    """Authentication URL for Tailscale

    Attributes:
        auth_url (str):
        web_url (str):
        qr_code_data (str):
    """

    auth_url: str
    web_url: str
    qr_code_data: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        auth_url = self.auth_url

        web_url = self.web_url

        qr_code_data = self.qr_code_data

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "auth_url": auth_url,
                "web_url": web_url,
                "qr_code_data": qr_code_data,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        auth_url = d.pop("auth_url")

        web_url = d.pop("web_url")

        qr_code_data = d.pop("qr_code_data")

        auth_url_response = cls(
            auth_url=auth_url,
            web_url=web_url,
            qr_code_data=qr_code_data,
        )

        auth_url_response.additional_properties = d
        return auth_url_response

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
