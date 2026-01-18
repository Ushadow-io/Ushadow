from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.u_node import UNode


T = TypeVar("T", bound="UNodeRegistrationResponse")


@_attrs_define
class UNodeRegistrationResponse:
    """Response from u-node registration.

    Attributes:
        success (bool):
        message (str):
        unode (None | UNode | Unset):
    """

    success: bool
    message: str
    unode: None | UNode | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.u_node import UNode

        success = self.success

        message = self.message

        unode: dict[str, Any] | None | Unset
        if isinstance(self.unode, Unset):
            unode = UNSET
        elif isinstance(self.unode, UNode):
            unode = self.unode.to_dict()
        else:
            unode = self.unode

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "message": message,
            }
        )
        if unode is not UNSET:
            field_dict["unode"] = unode

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.u_node import UNode

        d = dict(src_dict)
        success = d.pop("success")

        message = d.pop("message")

        def _parse_unode(data: object) -> None | UNode | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                unode_type_0 = UNode.from_dict(data)

                return unode_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | UNode | Unset, data)

        unode = _parse_unode(d.pop("unode", UNSET))

        u_node_registration_response = cls(
            success=success,
            message=message,
            unode=unode,
        )

        u_node_registration_response.additional_properties = d
        return u_node_registration_response

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
