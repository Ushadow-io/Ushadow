from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="InstallationGuide")


@_attrs_define
class InstallationGuide:
    """Platform-specific installation instructions

    Attributes:
        platform (str):
        instructions (str):
        download_url (str):
        verification_command (str):
    """

    platform: str
    instructions: str
    download_url: str
    verification_command: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        platform = self.platform

        instructions = self.instructions

        download_url = self.download_url

        verification_command = self.verification_command

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "platform": platform,
                "instructions": instructions,
                "download_url": download_url,
                "verification_command": verification_command,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        platform = d.pop("platform")

        instructions = d.pop("instructions")

        download_url = d.pop("download_url")

        verification_command = d.pop("verification_command")

        installation_guide = cls(
            platform=platform,
            instructions=instructions,
            download_url=download_url,
            verification_command=verification_command,
        )

        installation_guide.additional_properties = d
        return installation_guide

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
