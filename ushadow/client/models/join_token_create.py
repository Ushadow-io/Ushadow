from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.u_node_role import UNodeRole
from ..types import UNSET, Unset

T = TypeVar("T", bound="JoinTokenCreate")


@_attrs_define
class JoinTokenCreate:
    """Request to create a join token.

    Attributes:
        role (UNodeRole | Unset): Role of a u-node in the cluster.
        max_uses (int | Unset):  Default: 1.
        expires_in_hours (int | Unset):  Default: 24.
    """

    role: UNodeRole | Unset = UNSET
    max_uses: int | Unset = 1
    expires_in_hours: int | Unset = 24
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        role: str | Unset = UNSET
        if not isinstance(self.role, Unset):
            role = self.role.value

        max_uses = self.max_uses

        expires_in_hours = self.expires_in_hours

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if role is not UNSET:
            field_dict["role"] = role
        if max_uses is not UNSET:
            field_dict["max_uses"] = max_uses
        if expires_in_hours is not UNSET:
            field_dict["expires_in_hours"] = expires_in_hours

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        _role = d.pop("role", UNSET)
        role: UNodeRole | Unset
        if isinstance(_role, Unset):
            role = UNSET
        else:
            role = UNodeRole(_role)

        max_uses = d.pop("max_uses", UNSET)

        expires_in_hours = d.pop("expires_in_hours", UNSET)

        join_token_create = cls(
            role=role,
            max_uses=max_uses,
            expires_in_hours=expires_in_hours,
        )

        join_token_create.additional_properties = d
        return join_token_create

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
