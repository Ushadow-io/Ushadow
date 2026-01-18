from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="MissingKey")


@_attrs_define
class MissingKey:
    """A key/setting that needs to be configured.

    Attributes:
        key (str):
        label (str):
        settings_path (None | str | Unset):
        link (None | str | Unset):
        type_ (str | Unset):  Default: 'secret'.
    """

    key: str
    label: str
    settings_path: None | str | Unset = UNSET
    link: None | str | Unset = UNSET
    type_: str | Unset = "secret"
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        key = self.key

        label = self.label

        settings_path: None | str | Unset
        if isinstance(self.settings_path, Unset):
            settings_path = UNSET
        else:
            settings_path = self.settings_path

        link: None | str | Unset
        if isinstance(self.link, Unset):
            link = UNSET
        else:
            link = self.link

        type_ = self.type_

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "key": key,
                "label": label,
            }
        )
        if settings_path is not UNSET:
            field_dict["settings_path"] = settings_path
        if link is not UNSET:
            field_dict["link"] = link
        if type_ is not UNSET:
            field_dict["type"] = type_

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        key = d.pop("key")

        label = d.pop("label")

        def _parse_settings_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        settings_path = _parse_settings_path(d.pop("settings_path", UNSET))

        def _parse_link(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        link = _parse_link(d.pop("link", UNSET))

        type_ = d.pop("type", UNSET)

        missing_key = cls(
            key=key,
            label=label,
            settings_path=settings_path,
            link=link,
            type_=type_,
        )

        missing_key.additional_properties = d
        return missing_key

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
