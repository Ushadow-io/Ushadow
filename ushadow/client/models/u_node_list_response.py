from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.u_node import UNode


T = TypeVar("T", bound="UNodeListResponse")


@_attrs_define
class UNodeListResponse:
    """Response with list of u-nodes.

    Attributes:
        unodes (list[UNode]):
        total (int):
    """

    unodes: list[UNode]
    total: int
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        unodes = []
        for unodes_item_data in self.unodes:
            unodes_item = unodes_item_data.to_dict()
            unodes.append(unodes_item)

        total = self.total

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "unodes": unodes,
                "total": total,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.u_node import UNode

        d = dict(src_dict)
        unodes = []
        _unodes = d.pop("unodes")
        for unodes_item_data in _unodes:
            unodes_item = UNode.from_dict(unodes_item_data)

            unodes.append(unodes_item)

        total = d.pop("total")

        u_node_list_response = cls(
            unodes=unodes,
            total=total,
        )

        u_node_list_response.additional_properties = d
        return u_node_list_response

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
