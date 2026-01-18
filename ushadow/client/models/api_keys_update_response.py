from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.api_keys_step import ApiKeysStep


T = TypeVar("T", bound="ApiKeysUpdateResponse")


@_attrs_define
class ApiKeysUpdateResponse:
    """Response for API keys update operation.

    Attributes:
        api_keys (ApiKeysStep): API Keys configuration step.
        success (bool | Unset): Whether update was successful Default: True.
    """

    api_keys: ApiKeysStep
    success: bool | Unset = True
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        api_keys = self.api_keys.to_dict()

        success = self.success

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "api_keys": api_keys,
            }
        )
        if success is not UNSET:
            field_dict["success"] = success

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.api_keys_step import ApiKeysStep

        d = dict(src_dict)
        api_keys = ApiKeysStep.from_dict(d.pop("api_keys"))

        success = d.pop("success", UNSET)

        api_keys_update_response = cls(
            api_keys=api_keys,
            success=success,
        )

        api_keys_update_response.additional_properties = d
        return api_keys_update_response

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
