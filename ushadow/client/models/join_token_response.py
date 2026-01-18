from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

T = TypeVar("T", bound="JoinTokenResponse")


@_attrs_define
class JoinTokenResponse:
    """Response with join token and script.

    Attributes:
        token (str):
        expires_at (datetime.datetime):
        join_command (str):
        join_command_powershell (str):
        join_script_url (str):
        join_script_url_powershell (str):
        bootstrap_command (str):
        bootstrap_command_powershell (str):
    """

    token: str
    expires_at: datetime.datetime
    join_command: str
    join_command_powershell: str
    join_script_url: str
    join_script_url_powershell: str
    bootstrap_command: str
    bootstrap_command_powershell: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        token = self.token

        expires_at = self.expires_at.isoformat()

        join_command = self.join_command

        join_command_powershell = self.join_command_powershell

        join_script_url = self.join_script_url

        join_script_url_powershell = self.join_script_url_powershell

        bootstrap_command = self.bootstrap_command

        bootstrap_command_powershell = self.bootstrap_command_powershell

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "token": token,
                "expires_at": expires_at,
                "join_command": join_command,
                "join_command_powershell": join_command_powershell,
                "join_script_url": join_script_url,
                "join_script_url_powershell": join_script_url_powershell,
                "bootstrap_command": bootstrap_command,
                "bootstrap_command_powershell": bootstrap_command_powershell,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        token = d.pop("token")

        expires_at = isoparse(d.pop("expires_at"))

        join_command = d.pop("join_command")

        join_command_powershell = d.pop("join_command_powershell")

        join_script_url = d.pop("join_script_url")

        join_script_url_powershell = d.pop("join_script_url_powershell")

        bootstrap_command = d.pop("bootstrap_command")

        bootstrap_command_powershell = d.pop("bootstrap_command_powershell")

        join_token_response = cls(
            token=token,
            expires_at=expires_at,
            join_command=join_command,
            join_command_powershell=join_command_powershell,
            join_script_url=join_script_url,
            join_script_url_powershell=join_script_url_powershell,
            bootstrap_command=bootstrap_command,
            bootstrap_command_powershell=bootstrap_command_powershell,
        )

        join_token_response.additional_properties = d
        return join_token_response

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
