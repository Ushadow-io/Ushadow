from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ServiceTokenResponse")


@_attrs_define
class ServiceTokenResponse:
    """Response containing a cross-service JWT token.

    Attributes:
        access_token (str):
        audiences (list[str]):
        token_type (str | Unset):  Default: 'bearer'.
    """

    access_token: str
    audiences: list[str]
    token_type: str | Unset = "bearer"
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        access_token = self.access_token

        audiences = self.audiences

        token_type = self.token_type

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "access_token": access_token,
                "audiences": audiences,
            }
        )
        if token_type is not UNSET:
            field_dict["token_type"] = token_type

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        access_token = d.pop("access_token")

        audiences = cast(list[str], d.pop("audiences"))

        token_type = d.pop("token_type", UNSET)

        service_token_response = cls(
            access_token=access_token,
            audiences=audiences,
            token_type=token_type,
        )

        service_token_response.additional_properties = d
        return service_token_response

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
