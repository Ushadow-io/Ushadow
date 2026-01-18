from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ServiceTokenRequest")


@_attrs_define
class ServiceTokenRequest:
    """Request for generating a cross-service token.

    Attributes:
        audiences (list[str] | Unset): Services this token should be valid for
    """

    audiences: list[str] | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        audiences: list[str] | Unset = UNSET
        if not isinstance(self.audiences, Unset):
            audiences = self.audiences

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if audiences is not UNSET:
            field_dict["audiences"] = audiences

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        audiences = cast(list[str], d.pop("audiences", UNSET))

        service_token_request = cls(
            audiences=audiences,
        )

        service_token_request.additional_properties = d
        return service_token_request

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
