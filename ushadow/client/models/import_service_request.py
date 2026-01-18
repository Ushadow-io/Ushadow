from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.imported_service_config import ImportedServiceConfig


T = TypeVar("T", bound="ImportServiceRequest")


@_attrs_define
class ImportServiceRequest:
    """Request to import and register a service from GitHub.

    Attributes:
        github_url (str):
        compose_path (str):
        service_name (str):
        config (ImportedServiceConfig): Full configuration for an imported service.
    """

    github_url: str
    compose_path: str
    service_name: str
    config: ImportedServiceConfig
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        github_url = self.github_url

        compose_path = self.compose_path

        service_name = self.service_name

        config = self.config.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "github_url": github_url,
                "compose_path": compose_path,
                "service_name": service_name,
                "config": config,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.imported_service_config import ImportedServiceConfig

        d = dict(src_dict)
        github_url = d.pop("github_url")

        compose_path = d.pop("compose_path")

        service_name = d.pop("service_name")

        config = ImportedServiceConfig.from_dict(d.pop("config"))

        import_service_request = cls(
            github_url=github_url,
            compose_path=compose_path,
            service_name=service_name,
            config=config,
        )

        import_service_request.additional_properties = d
        return import_service_request

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
