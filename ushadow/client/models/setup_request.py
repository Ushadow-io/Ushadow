from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="SetupRequest")


@_attrs_define
class SetupRequest:
    """Initial setup request for creating first admin user.

    Attributes:
        display_name (str):
        email (str):
        password (str):
        confirm_password (str):
    """

    display_name: str
    email: str
    password: str
    confirm_password: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        display_name = self.display_name

        email = self.email

        password = self.password

        confirm_password = self.confirm_password

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "display_name": display_name,
                "email": email,
                "password": password,
                "confirm_password": confirm_password,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        display_name = d.pop("display_name")

        email = d.pop("email")

        password = d.pop("password")

        confirm_password = d.pop("confirm_password")

        setup_request = cls(
            display_name=display_name,
            email=email,
            password=password,
            confirm_password=confirm_password,
        )

        setup_request.additional_properties = d
        return setup_request

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
