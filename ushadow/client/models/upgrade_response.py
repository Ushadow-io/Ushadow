from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="UpgradeResponse")


@_attrs_define
class UpgradeResponse:
    """Response from upgrade request.

    Attributes:
        success (bool):
        message (str):
        hostname (str):
        new_image (None | str | Unset):
    """

    success: bool
    message: str
    hostname: str
    new_image: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        success = self.success

        message = self.message

        hostname = self.hostname

        new_image: None | str | Unset
        if isinstance(self.new_image, Unset):
            new_image = UNSET
        else:
            new_image = self.new_image

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "message": message,
                "hostname": hostname,
            }
        )
        if new_image is not UNSET:
            field_dict["new_image"] = new_image

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        success = d.pop("success")

        message = d.pop("message")

        hostname = d.pop("hostname")

        def _parse_new_image(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        new_image = _parse_new_image(d.pop("new_image", UNSET))

        upgrade_response = cls(
            success=success,
            message=message,
            hostname=hostname,
            new_image=new_image,
        )

        upgrade_response.additional_properties = d
        return upgrade_response

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
