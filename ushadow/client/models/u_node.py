from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.u_node_platform import UNodePlatform
from ..models.u_node_role import UNodeRole
from ..models.u_node_status import UNodeStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.u_node_capabilities import UNodeCapabilities
    from ..models.u_node_labels import UNodeLabels
    from ..models.u_node_metadata import UNodeMetadata


T = TypeVar("T", bound="UNode")


@_attrs_define
class UNode:
    """Full u-node model for API responses.

    Attributes:
        hostname (str): Tailscale hostname
        id (str):
        registered_at (datetime.datetime):
        display_name (None | str | Unset):
        role (UNodeRole | Unset): Role of a u-node in the cluster.
        platform (UNodePlatform | Unset): Platform the u-node is running on.
        tailscale_ip (None | str | Unset):
        capabilities (UNodeCapabilities | Unset): Capabilities of a u-node.
        labels (UNodeLabels | Unset):
        status (UNodeStatus | Unset): Connection status of a u-node.
        last_seen (datetime.datetime | None | Unset):
        manager_version (str | Unset):  Default: '0.1.0'.
        services (list[str] | Unset):
        error_message (None | str | Unset):
        metadata (UNodeMetadata | Unset):
    """

    hostname: str
    id: str
    registered_at: datetime.datetime
    display_name: None | str | Unset = UNSET
    role: UNodeRole | Unset = UNSET
    platform: UNodePlatform | Unset = UNSET
    tailscale_ip: None | str | Unset = UNSET
    capabilities: UNodeCapabilities | Unset = UNSET
    labels: UNodeLabels | Unset = UNSET
    status: UNodeStatus | Unset = UNSET
    last_seen: datetime.datetime | None | Unset = UNSET
    manager_version: str | Unset = "0.1.0"
    services: list[str] | Unset = UNSET
    error_message: None | str | Unset = UNSET
    metadata: UNodeMetadata | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        hostname = self.hostname

        id = self.id

        registered_at = self.registered_at.isoformat()

        display_name: None | str | Unset
        if isinstance(self.display_name, Unset):
            display_name = UNSET
        else:
            display_name = self.display_name

        role: str | Unset = UNSET
        if not isinstance(self.role, Unset):
            role = self.role.value

        platform: str | Unset = UNSET
        if not isinstance(self.platform, Unset):
            platform = self.platform.value

        tailscale_ip: None | str | Unset
        if isinstance(self.tailscale_ip, Unset):
            tailscale_ip = UNSET
        else:
            tailscale_ip = self.tailscale_ip

        capabilities: dict[str, Any] | Unset = UNSET
        if not isinstance(self.capabilities, Unset):
            capabilities = self.capabilities.to_dict()

        labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.labels, Unset):
            labels = self.labels.to_dict()

        status: str | Unset = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value

        last_seen: None | str | Unset
        if isinstance(self.last_seen, Unset):
            last_seen = UNSET
        elif isinstance(self.last_seen, datetime.datetime):
            last_seen = self.last_seen.isoformat()
        else:
            last_seen = self.last_seen

        manager_version = self.manager_version

        services: list[str] | Unset = UNSET
        if not isinstance(self.services, Unset):
            services = self.services

        error_message: None | str | Unset
        if isinstance(self.error_message, Unset):
            error_message = UNSET
        else:
            error_message = self.error_message

        metadata: dict[str, Any] | Unset = UNSET
        if not isinstance(self.metadata, Unset):
            metadata = self.metadata.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "hostname": hostname,
                "id": id,
                "registered_at": registered_at,
            }
        )
        if display_name is not UNSET:
            field_dict["display_name"] = display_name
        if role is not UNSET:
            field_dict["role"] = role
        if platform is not UNSET:
            field_dict["platform"] = platform
        if tailscale_ip is not UNSET:
            field_dict["tailscale_ip"] = tailscale_ip
        if capabilities is not UNSET:
            field_dict["capabilities"] = capabilities
        if labels is not UNSET:
            field_dict["labels"] = labels
        if status is not UNSET:
            field_dict["status"] = status
        if last_seen is not UNSET:
            field_dict["last_seen"] = last_seen
        if manager_version is not UNSET:
            field_dict["manager_version"] = manager_version
        if services is not UNSET:
            field_dict["services"] = services
        if error_message is not UNSET:
            field_dict["error_message"] = error_message
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.u_node_capabilities import UNodeCapabilities
        from ..models.u_node_labels import UNodeLabels
        from ..models.u_node_metadata import UNodeMetadata

        d = dict(src_dict)
        hostname = d.pop("hostname")

        id = d.pop("id")

        registered_at = isoparse(d.pop("registered_at"))

        def _parse_display_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        display_name = _parse_display_name(d.pop("display_name", UNSET))

        _role = d.pop("role", UNSET)
        role: UNodeRole | Unset
        if isinstance(_role, Unset):
            role = UNSET
        else:
            role = UNodeRole(_role)

        _platform = d.pop("platform", UNSET)
        platform: UNodePlatform | Unset
        if isinstance(_platform, Unset):
            platform = UNSET
        else:
            platform = UNodePlatform(_platform)

        def _parse_tailscale_ip(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        tailscale_ip = _parse_tailscale_ip(d.pop("tailscale_ip", UNSET))

        _capabilities = d.pop("capabilities", UNSET)
        capabilities: UNodeCapabilities | Unset
        if isinstance(_capabilities, Unset):
            capabilities = UNSET
        else:
            capabilities = UNodeCapabilities.from_dict(_capabilities)

        _labels = d.pop("labels", UNSET)
        labels: UNodeLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = UNodeLabels.from_dict(_labels)

        _status = d.pop("status", UNSET)
        status: UNodeStatus | Unset
        if isinstance(_status, Unset):
            status = UNSET
        else:
            status = UNodeStatus(_status)

        def _parse_last_seen(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                last_seen_type_0 = isoparse(data)

                return last_seen_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        last_seen = _parse_last_seen(d.pop("last_seen", UNSET))

        manager_version = d.pop("manager_version", UNSET)

        services = cast(list[str], d.pop("services", UNSET))

        def _parse_error_message(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        error_message = _parse_error_message(d.pop("error_message", UNSET))

        _metadata = d.pop("metadata", UNSET)
        metadata: UNodeMetadata | Unset
        if isinstance(_metadata, Unset):
            metadata = UNSET
        else:
            metadata = UNodeMetadata.from_dict(_metadata)

        u_node = cls(
            hostname=hostname,
            id=id,
            registered_at=registered_at,
            display_name=display_name,
            role=role,
            platform=platform,
            tailscale_ip=tailscale_ip,
            capabilities=capabilities,
            labels=labels,
            status=status,
            last_seen=last_seen,
            manager_version=manager_version,
            services=services,
            error_message=error_message,
            metadata=metadata,
        )

        u_node.additional_properties = d
        return u_node

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
