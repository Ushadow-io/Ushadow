from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.access_urls_environments import AccessUrlsEnvironments


T = TypeVar("T", bound="AccessUrls")


@_attrs_define
class AccessUrls:
    """Generated access URLs after setup

    Attributes:
        frontend (str):
        backend (str):
        environments (AccessUrlsEnvironments | Unset):
    """

    frontend: str
    backend: str
    environments: AccessUrlsEnvironments | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        frontend = self.frontend

        backend = self.backend

        environments: dict[str, Any] | Unset = UNSET
        if not isinstance(self.environments, Unset):
            environments = self.environments.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "frontend": frontend,
                "backend": backend,
            }
        )
        if environments is not UNSET:
            field_dict["environments"] = environments

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.access_urls_environments import AccessUrlsEnvironments

        d = dict(src_dict)
        frontend = d.pop("frontend")

        backend = d.pop("backend")

        _environments = d.pop("environments", UNSET)
        environments: AccessUrlsEnvironments | Unset
        if isinstance(_environments, Unset):
            environments = UNSET
        else:
            environments = AccessUrlsEnvironments.from_dict(_environments)

        access_urls = cls(
            frontend=frontend,
            backend=backend,
            environments=environments,
        )

        access_urls.additional_properties = d
        return access_urls

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
