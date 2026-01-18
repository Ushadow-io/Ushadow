from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.u_node_status import UNodeStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.u_node_capabilities import UNodeCapabilities
    from ..models.u_node_heartbeat_metrics import UNodeHeartbeatMetrics


T = TypeVar("T", bound="UNodeHeartbeat")


@_attrs_define
class UNodeHeartbeat:
    """Heartbeat message from a u-node.

    Attributes:
        hostname (str):
        status (UNodeStatus | Unset): Connection status of a u-node.
        manager_version (None | str | Unset):
        services_running (list[str] | Unset):
        capabilities (None | UNodeCapabilities | Unset):
        metrics (UNodeHeartbeatMetrics | Unset):
    """

    hostname: str
    status: UNodeStatus | Unset = UNSET
    manager_version: None | str | Unset = UNSET
    services_running: list[str] | Unset = UNSET
    capabilities: None | UNodeCapabilities | Unset = UNSET
    metrics: UNodeHeartbeatMetrics | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.u_node_capabilities import UNodeCapabilities

        hostname = self.hostname

        status: str | Unset = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value

        manager_version: None | str | Unset
        if isinstance(self.manager_version, Unset):
            manager_version = UNSET
        else:
            manager_version = self.manager_version

        services_running: list[str] | Unset = UNSET
        if not isinstance(self.services_running, Unset):
            services_running = self.services_running

        capabilities: dict[str, Any] | None | Unset
        if isinstance(self.capabilities, Unset):
            capabilities = UNSET
        elif isinstance(self.capabilities, UNodeCapabilities):
            capabilities = self.capabilities.to_dict()
        else:
            capabilities = self.capabilities

        metrics: dict[str, Any] | Unset = UNSET
        if not isinstance(self.metrics, Unset):
            metrics = self.metrics.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "hostname": hostname,
            }
        )
        if status is not UNSET:
            field_dict["status"] = status
        if manager_version is not UNSET:
            field_dict["manager_version"] = manager_version
        if services_running is not UNSET:
            field_dict["services_running"] = services_running
        if capabilities is not UNSET:
            field_dict["capabilities"] = capabilities
        if metrics is not UNSET:
            field_dict["metrics"] = metrics

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.u_node_capabilities import UNodeCapabilities
        from ..models.u_node_heartbeat_metrics import UNodeHeartbeatMetrics

        d = dict(src_dict)
        hostname = d.pop("hostname")

        _status = d.pop("status", UNSET)
        status: UNodeStatus | Unset
        if isinstance(_status, Unset):
            status = UNSET
        else:
            status = UNodeStatus(_status)

        def _parse_manager_version(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        manager_version = _parse_manager_version(d.pop("manager_version", UNSET))

        services_running = cast(list[str], d.pop("services_running", UNSET))

        def _parse_capabilities(data: object) -> None | UNodeCapabilities | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                capabilities_type_0 = UNodeCapabilities.from_dict(data)

                return capabilities_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | UNodeCapabilities | Unset, data)

        capabilities = _parse_capabilities(d.pop("capabilities", UNSET))

        _metrics = d.pop("metrics", UNSET)
        metrics: UNodeHeartbeatMetrics | Unset
        if isinstance(_metrics, Unset):
            metrics = UNSET
        else:
            metrics = UNodeHeartbeatMetrics.from_dict(_metrics)

        u_node_heartbeat = cls(
            hostname=hostname,
            status=status,
            manager_version=manager_version,
            services_running=services_running,
            capabilities=capabilities,
            metrics=metrics,
        )

        u_node_heartbeat.additional_properties = d
        return u_node_heartbeat

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
