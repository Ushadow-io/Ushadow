from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="UnifiedImportRequest")


@_attrs_define
class UnifiedImportRequest:
    """Unified request for importing from any supported source.

    Attributes:
        url (str): GitHub URL, Docker Hub URL, or image reference
        branch (None | str | Unset): Branch for GitHub (defaults to main)
        tag (None | str | Unset): Tag for Docker Hub (defaults to latest)
        compose_path (None | str | Unset): Path to docker-compose file if not auto-detected
    """

    url: str
    branch: None | str | Unset = UNSET
    tag: None | str | Unset = UNSET
    compose_path: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        url = self.url

        branch: None | str | Unset
        if isinstance(self.branch, Unset):
            branch = UNSET
        else:
            branch = self.branch

        tag: None | str | Unset
        if isinstance(self.tag, Unset):
            tag = UNSET
        else:
            tag = self.tag

        compose_path: None | str | Unset
        if isinstance(self.compose_path, Unset):
            compose_path = UNSET
        else:
            compose_path = self.compose_path

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "url": url,
            }
        )
        if branch is not UNSET:
            field_dict["branch"] = branch
        if tag is not UNSET:
            field_dict["tag"] = tag
        if compose_path is not UNSET:
            field_dict["compose_path"] = compose_path

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        url = d.pop("url")

        def _parse_branch(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        branch = _parse_branch(d.pop("branch", UNSET))

        def _parse_tag(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        tag = _parse_tag(d.pop("tag", UNSET))

        def _parse_compose_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        compose_path = _parse_compose_path(d.pop("compose_path", UNSET))

        unified_import_request = cls(
            url=url,
            branch=branch,
            tag=tag,
            compose_path=compose_path,
        )

        unified_import_request.additional_properties = d
        return unified_import_request

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
