from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="CertificateStatus")


@_attrs_define
class CertificateStatus:
    """Certificate provisioning status

    Attributes:
        provisioned (bool):
        cert_path (None | str | Unset):
        key_path (None | str | Unset):
        expires_at (None | str | Unset):
        error (None | str | Unset):
    """

    provisioned: bool
    cert_path: None | str | Unset = UNSET
    key_path: None | str | Unset = UNSET
    expires_at: None | str | Unset = UNSET
    error: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        provisioned = self.provisioned

        cert_path: None | str | Unset
        if isinstance(self.cert_path, Unset):
            cert_path = UNSET
        else:
            cert_path = self.cert_path

        key_path: None | str | Unset
        if isinstance(self.key_path, Unset):
            key_path = UNSET
        else:
            key_path = self.key_path

        expires_at: None | str | Unset
        if isinstance(self.expires_at, Unset):
            expires_at = UNSET
        else:
            expires_at = self.expires_at

        error: None | str | Unset
        if isinstance(self.error, Unset):
            error = UNSET
        else:
            error = self.error

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "provisioned": provisioned,
            }
        )
        if cert_path is not UNSET:
            field_dict["cert_path"] = cert_path
        if key_path is not UNSET:
            field_dict["key_path"] = key_path
        if expires_at is not UNSET:
            field_dict["expires_at"] = expires_at
        if error is not UNSET:
            field_dict["error"] = error

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        provisioned = d.pop("provisioned")

        def _parse_cert_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        cert_path = _parse_cert_path(d.pop("cert_path", UNSET))

        def _parse_key_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        key_path = _parse_key_path(d.pop("key_path", UNSET))

        def _parse_expires_at(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        expires_at = _parse_expires_at(d.pop("expires_at", UNSET))

        def _parse_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        error = _parse_error(d.pop("error", UNSET))

        certificate_status = cls(
            provisioned=provisioned,
            cert_path=cert_path,
            key_path=key_path,
            expires_at=expires_at,
            error=error,
        )

        certificate_status.additional_properties = d
        return certificate_status

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
