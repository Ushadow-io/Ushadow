from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.deployment_status import DeploymentStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.deployment_deployed_config_type_0 import DeploymentDeployedConfigType0


T = TypeVar("T", bound="Deployment")


@_attrs_define
class Deployment:
    """A service deployed to a specific node.

    Represents an instance of a ServiceDefinition running on a u-node.

        Attributes:
            id (str): Unique deployment ID
            service_id (str): Reference to ServiceDefinition
            unode_hostname (str): Target u-node hostname
            status (DeploymentStatus | Unset): Status of a deployment.
            container_id (None | str | Unset): Docker container ID (when deployed)
            container_name (None | str | Unset): Container name on the node
            created_at (datetime.datetime | None | Unset):
            deployed_at (datetime.datetime | None | Unset):
            stopped_at (datetime.datetime | None | Unset):
            last_health_check (datetime.datetime | None | Unset):
            healthy (bool | None | Unset):
            health_message (None | str | Unset):
            error (None | str | Unset):
            retry_count (int | Unset):  Default: 0.
            deployed_config (DeploymentDeployedConfigType0 | None | Unset):
            access_url (None | str | Unset): URL to access the deployed service
            exposed_port (int | None | Unset): Primary exposed port for the service
    """

    id: str
    service_id: str
    unode_hostname: str
    status: DeploymentStatus | Unset = UNSET
    container_id: None | str | Unset = UNSET
    container_name: None | str | Unset = UNSET
    created_at: datetime.datetime | None | Unset = UNSET
    deployed_at: datetime.datetime | None | Unset = UNSET
    stopped_at: datetime.datetime | None | Unset = UNSET
    last_health_check: datetime.datetime | None | Unset = UNSET
    healthy: bool | None | Unset = UNSET
    health_message: None | str | Unset = UNSET
    error: None | str | Unset = UNSET
    retry_count: int | Unset = 0
    deployed_config: DeploymentDeployedConfigType0 | None | Unset = UNSET
    access_url: None | str | Unset = UNSET
    exposed_port: int | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.deployment_deployed_config_type_0 import DeploymentDeployedConfigType0

        id = self.id

        service_id = self.service_id

        unode_hostname = self.unode_hostname

        status: str | Unset = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value

        container_id: None | str | Unset
        if isinstance(self.container_id, Unset):
            container_id = UNSET
        else:
            container_id = self.container_id

        container_name: None | str | Unset
        if isinstance(self.container_name, Unset):
            container_name = UNSET
        else:
            container_name = self.container_name

        created_at: None | str | Unset
        if isinstance(self.created_at, Unset):
            created_at = UNSET
        elif isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        deployed_at: None | str | Unset
        if isinstance(self.deployed_at, Unset):
            deployed_at = UNSET
        elif isinstance(self.deployed_at, datetime.datetime):
            deployed_at = self.deployed_at.isoformat()
        else:
            deployed_at = self.deployed_at

        stopped_at: None | str | Unset
        if isinstance(self.stopped_at, Unset):
            stopped_at = UNSET
        elif isinstance(self.stopped_at, datetime.datetime):
            stopped_at = self.stopped_at.isoformat()
        else:
            stopped_at = self.stopped_at

        last_health_check: None | str | Unset
        if isinstance(self.last_health_check, Unset):
            last_health_check = UNSET
        elif isinstance(self.last_health_check, datetime.datetime):
            last_health_check = self.last_health_check.isoformat()
        else:
            last_health_check = self.last_health_check

        healthy: bool | None | Unset
        if isinstance(self.healthy, Unset):
            healthy = UNSET
        else:
            healthy = self.healthy

        health_message: None | str | Unset
        if isinstance(self.health_message, Unset):
            health_message = UNSET
        else:
            health_message = self.health_message

        error: None | str | Unset
        if isinstance(self.error, Unset):
            error = UNSET
        else:
            error = self.error

        retry_count = self.retry_count

        deployed_config: dict[str, Any] | None | Unset
        if isinstance(self.deployed_config, Unset):
            deployed_config = UNSET
        elif isinstance(self.deployed_config, DeploymentDeployedConfigType0):
            deployed_config = self.deployed_config.to_dict()
        else:
            deployed_config = self.deployed_config

        access_url: None | str | Unset
        if isinstance(self.access_url, Unset):
            access_url = UNSET
        else:
            access_url = self.access_url

        exposed_port: int | None | Unset
        if isinstance(self.exposed_port, Unset):
            exposed_port = UNSET
        else:
            exposed_port = self.exposed_port

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "service_id": service_id,
                "unode_hostname": unode_hostname,
            }
        )
        if status is not UNSET:
            field_dict["status"] = status
        if container_id is not UNSET:
            field_dict["container_id"] = container_id
        if container_name is not UNSET:
            field_dict["container_name"] = container_name
        if created_at is not UNSET:
            field_dict["created_at"] = created_at
        if deployed_at is not UNSET:
            field_dict["deployed_at"] = deployed_at
        if stopped_at is not UNSET:
            field_dict["stopped_at"] = stopped_at
        if last_health_check is not UNSET:
            field_dict["last_health_check"] = last_health_check
        if healthy is not UNSET:
            field_dict["healthy"] = healthy
        if health_message is not UNSET:
            field_dict["health_message"] = health_message
        if error is not UNSET:
            field_dict["error"] = error
        if retry_count is not UNSET:
            field_dict["retry_count"] = retry_count
        if deployed_config is not UNSET:
            field_dict["deployed_config"] = deployed_config
        if access_url is not UNSET:
            field_dict["access_url"] = access_url
        if exposed_port is not UNSET:
            field_dict["exposed_port"] = exposed_port

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.deployment_deployed_config_type_0 import DeploymentDeployedConfigType0

        d = dict(src_dict)
        id = d.pop("id")

        service_id = d.pop("service_id")

        unode_hostname = d.pop("unode_hostname")

        _status = d.pop("status", UNSET)
        status: DeploymentStatus | Unset
        if isinstance(_status, Unset):
            status = UNSET
        else:
            status = DeploymentStatus(_status)

        def _parse_container_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        container_id = _parse_container_id(d.pop("container_id", UNSET))

        def _parse_container_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        container_name = _parse_container_name(d.pop("container_name", UNSET))

        def _parse_created_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_type_0 = isoparse(data)

                return created_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        created_at = _parse_created_at(d.pop("created_at", UNSET))

        def _parse_deployed_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                deployed_at_type_0 = isoparse(data)

                return deployed_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        deployed_at = _parse_deployed_at(d.pop("deployed_at", UNSET))

        def _parse_stopped_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                stopped_at_type_0 = isoparse(data)

                return stopped_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        stopped_at = _parse_stopped_at(d.pop("stopped_at", UNSET))

        def _parse_last_health_check(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                last_health_check_type_0 = isoparse(data)

                return last_health_check_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        last_health_check = _parse_last_health_check(d.pop("last_health_check", UNSET))

        def _parse_healthy(data: object) -> bool | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(bool | None | Unset, data)

        healthy = _parse_healthy(d.pop("healthy", UNSET))

        def _parse_health_message(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        health_message = _parse_health_message(d.pop("health_message", UNSET))

        def _parse_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        error = _parse_error(d.pop("error", UNSET))

        retry_count = d.pop("retry_count", UNSET)

        def _parse_deployed_config(data: object) -> DeploymentDeployedConfigType0 | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                deployed_config_type_0 = DeploymentDeployedConfigType0.from_dict(data)

                return deployed_config_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(DeploymentDeployedConfigType0 | None | Unset, data)

        deployed_config = _parse_deployed_config(d.pop("deployed_config", UNSET))

        def _parse_access_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        access_url = _parse_access_url(d.pop("access_url", UNSET))

        def _parse_exposed_port(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        exposed_port = _parse_exposed_port(d.pop("exposed_port", UNSET))

        deployment = cls(
            id=id,
            service_id=service_id,
            unode_hostname=unode_hostname,
            status=status,
            container_id=container_id,
            container_name=container_name,
            created_at=created_at,
            deployed_at=deployed_at,
            stopped_at=stopped_at,
            last_health_check=last_health_check,
            healthy=healthy,
            health_message=health_message,
            error=error,
            retry_count=retry_count,
            deployed_config=deployed_config,
            access_url=access_url,
            exposed_port=exposed_port,
        )

        deployment.additional_properties = d
        return deployment

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
