from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="GitHubUrlInfo")


@_attrs_define
class GitHubUrlInfo:
    """Parsed GitHub URL information.

    Attributes:
        owner (str):
        repo (str):
        branch (str | Unset):  Default: 'main'.
        path (str | Unset):  Default: ''.
    """

    owner: str
    repo: str
    branch: str | Unset = "main"
    path: str | Unset = ""
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        owner = self.owner

        repo = self.repo

        branch = self.branch

        path = self.path

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "owner": owner,
                "repo": repo,
            }
        )
        if branch is not UNSET:
            field_dict["branch"] = branch
        if path is not UNSET:
            field_dict["path"] = path

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        owner = d.pop("owner")

        repo = d.pop("repo")

        branch = d.pop("branch", UNSET)

        path = d.pop("path", UNSET)

        git_hub_url_info = cls(
            owner=owner,
            repo=repo,
            branch=branch,
            path=path,
        )

        git_hub_url_info.additional_properties = d
        return git_hub_url_info

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
