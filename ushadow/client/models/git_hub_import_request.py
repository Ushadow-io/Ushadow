from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="GitHubImportRequest")


@_attrs_define
class GitHubImportRequest:
    """Request to import from a GitHub URL.

    Attributes:
        github_url (str): GitHub repository or file URL
        branch (None | str | Unset): Branch to use (defaults to main/master)
        compose_path (None | str | Unset): Path to docker-compose file if not auto-detected
    """

    github_url: str
    branch: None | str | Unset = UNSET
    compose_path: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        github_url = self.github_url

        branch: None | str | Unset
        if isinstance(self.branch, Unset):
            branch = UNSET
        else:
            branch = self.branch

        compose_path: None | str | Unset
        if isinstance(self.compose_path, Unset):
            compose_path = UNSET
        else:
            compose_path = self.compose_path

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "github_url": github_url,
            }
        )
        if branch is not UNSET:
            field_dict["branch"] = branch
        if compose_path is not UNSET:
            field_dict["compose_path"] = compose_path

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        github_url = d.pop("github_url")

        def _parse_branch(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        branch = _parse_branch(d.pop("branch", UNSET))

        def _parse_compose_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        compose_path = _parse_compose_path(d.pop("compose_path", UNSET))

        git_hub_import_request = cls(
            github_url=github_url,
            branch=branch,
            compose_path=compose_path,
        )

        git_hub_import_request.additional_properties = d
        return git_hub_import_request

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
