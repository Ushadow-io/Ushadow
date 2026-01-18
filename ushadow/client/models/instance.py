from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.instance_status import InstanceStatus
from ..models.integration_type import IntegrationType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.instance_config import InstanceConfig
    from ..models.instance_outputs import InstanceOutputs


T = TypeVar("T", bound="Instance")


@_attrs_define
class Instance:
    """An instance of a template with configuration applied.

    Instance = Template + Config Set + Deployment Target

    Instances have inputs (config values, capability requirements)
    and outputs (resolved config + access URL after deployment).

        Attributes:
            id (str): Unique instance identifier (e.g., 'openmemory-prod')
            template_id (str): Reference to the template
            name (str): Display name for this instance
            description (None | str | Unset): Instance description
            config (InstanceConfig | Unset): Configuration values for an instance.
            deployment_target (None | str | Unset): Deployment target: None=local docker, hostname=u-node, 'cloud'=no
                deployment
            status (InstanceStatus | Unset): Status of an instance.
            outputs (InstanceOutputs | Unset): Outputs from an instance after deployment.
            container_id (None | str | Unset): Docker container ID when deployed
            container_name (None | str | Unset): Container name
            deployment_id (None | str | Unset): Reference to Deployment record if remote
            created_at (datetime.datetime | None | Unset):
            deployed_at (datetime.datetime | None | Unset):
            updated_at (datetime.datetime | None | Unset):
            error (None | str | Unset):
            integration_type (IntegrationType | None | Unset): Integration type (filesystem, rest, graphql) - null for non-
                integrations
            sync_enabled (bool | None | Unset): Whether auto-sync is enabled
            sync_interval (int | None | Unset): Sync interval in seconds (e.g., 21600 for 6 hours)
            last_sync_at (datetime.datetime | None | Unset): Timestamp of last successful sync
            last_sync_status (None | str | Unset): Status of last sync: 'success', 'error', 'in_progress', 'never'
            last_sync_items_count (int | None | Unset): Number of items synced in last sync
            last_sync_error (None | str | Unset): Error message from last failed sync
            next_sync_at (datetime.datetime | None | Unset): Computed timestamp of next scheduled sync
    """

    id: str
    template_id: str
    name: str
    description: None | str | Unset = UNSET
    config: InstanceConfig | Unset = UNSET
    deployment_target: None | str | Unset = UNSET
    status: InstanceStatus | Unset = UNSET
    outputs: InstanceOutputs | Unset = UNSET
    container_id: None | str | Unset = UNSET
    container_name: None | str | Unset = UNSET
    deployment_id: None | str | Unset = UNSET
    created_at: datetime.datetime | None | Unset = UNSET
    deployed_at: datetime.datetime | None | Unset = UNSET
    updated_at: datetime.datetime | None | Unset = UNSET
    error: None | str | Unset = UNSET
    integration_type: IntegrationType | None | Unset = UNSET
    sync_enabled: bool | None | Unset = UNSET
    sync_interval: int | None | Unset = UNSET
    last_sync_at: datetime.datetime | None | Unset = UNSET
    last_sync_status: None | str | Unset = UNSET
    last_sync_items_count: int | None | Unset = UNSET
    last_sync_error: None | str | Unset = UNSET
    next_sync_at: datetime.datetime | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        template_id = self.template_id

        name = self.name

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        config: dict[str, Any] | Unset = UNSET
        if not isinstance(self.config, Unset):
            config = self.config.to_dict()

        deployment_target: None | str | Unset
        if isinstance(self.deployment_target, Unset):
            deployment_target = UNSET
        else:
            deployment_target = self.deployment_target

        status: str | Unset = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value

        outputs: dict[str, Any] | Unset = UNSET
        if not isinstance(self.outputs, Unset):
            outputs = self.outputs.to_dict()

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

        deployment_id: None | str | Unset
        if isinstance(self.deployment_id, Unset):
            deployment_id = UNSET
        else:
            deployment_id = self.deployment_id

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

        updated_at: None | str | Unset
        if isinstance(self.updated_at, Unset):
            updated_at = UNSET
        elif isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        error: None | str | Unset
        if isinstance(self.error, Unset):
            error = UNSET
        else:
            error = self.error

        integration_type: None | str | Unset
        if isinstance(self.integration_type, Unset):
            integration_type = UNSET
        elif isinstance(self.integration_type, IntegrationType):
            integration_type = self.integration_type.value
        else:
            integration_type = self.integration_type

        sync_enabled: bool | None | Unset
        if isinstance(self.sync_enabled, Unset):
            sync_enabled = UNSET
        else:
            sync_enabled = self.sync_enabled

        sync_interval: int | None | Unset
        if isinstance(self.sync_interval, Unset):
            sync_interval = UNSET
        else:
            sync_interval = self.sync_interval

        last_sync_at: None | str | Unset
        if isinstance(self.last_sync_at, Unset):
            last_sync_at = UNSET
        elif isinstance(self.last_sync_at, datetime.datetime):
            last_sync_at = self.last_sync_at.isoformat()
        else:
            last_sync_at = self.last_sync_at

        last_sync_status: None | str | Unset
        if isinstance(self.last_sync_status, Unset):
            last_sync_status = UNSET
        else:
            last_sync_status = self.last_sync_status

        last_sync_items_count: int | None | Unset
        if isinstance(self.last_sync_items_count, Unset):
            last_sync_items_count = UNSET
        else:
            last_sync_items_count = self.last_sync_items_count

        last_sync_error: None | str | Unset
        if isinstance(self.last_sync_error, Unset):
            last_sync_error = UNSET
        else:
            last_sync_error = self.last_sync_error

        next_sync_at: None | str | Unset
        if isinstance(self.next_sync_at, Unset):
            next_sync_at = UNSET
        elif isinstance(self.next_sync_at, datetime.datetime):
            next_sync_at = self.next_sync_at.isoformat()
        else:
            next_sync_at = self.next_sync_at

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "template_id": template_id,
                "name": name,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if config is not UNSET:
            field_dict["config"] = config
        if deployment_target is not UNSET:
            field_dict["deployment_target"] = deployment_target
        if status is not UNSET:
            field_dict["status"] = status
        if outputs is not UNSET:
            field_dict["outputs"] = outputs
        if container_id is not UNSET:
            field_dict["container_id"] = container_id
        if container_name is not UNSET:
            field_dict["container_name"] = container_name
        if deployment_id is not UNSET:
            field_dict["deployment_id"] = deployment_id
        if created_at is not UNSET:
            field_dict["created_at"] = created_at
        if deployed_at is not UNSET:
            field_dict["deployed_at"] = deployed_at
        if updated_at is not UNSET:
            field_dict["updated_at"] = updated_at
        if error is not UNSET:
            field_dict["error"] = error
        if integration_type is not UNSET:
            field_dict["integration_type"] = integration_type
        if sync_enabled is not UNSET:
            field_dict["sync_enabled"] = sync_enabled
        if sync_interval is not UNSET:
            field_dict["sync_interval"] = sync_interval
        if last_sync_at is not UNSET:
            field_dict["last_sync_at"] = last_sync_at
        if last_sync_status is not UNSET:
            field_dict["last_sync_status"] = last_sync_status
        if last_sync_items_count is not UNSET:
            field_dict["last_sync_items_count"] = last_sync_items_count
        if last_sync_error is not UNSET:
            field_dict["last_sync_error"] = last_sync_error
        if next_sync_at is not UNSET:
            field_dict["next_sync_at"] = next_sync_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.instance_config import InstanceConfig
        from ..models.instance_outputs import InstanceOutputs

        d = dict(src_dict)
        id = d.pop("id")

        template_id = d.pop("template_id")

        name = d.pop("name")

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        _config = d.pop("config", UNSET)
        config: InstanceConfig | Unset
        if isinstance(_config, Unset):
            config = UNSET
        else:
            config = InstanceConfig.from_dict(_config)

        def _parse_deployment_target(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        deployment_target = _parse_deployment_target(d.pop("deployment_target", UNSET))

        _status = d.pop("status", UNSET)
        status: InstanceStatus | Unset
        if isinstance(_status, Unset):
            status = UNSET
        else:
            status = InstanceStatus(_status)

        _outputs = d.pop("outputs", UNSET)
        outputs: InstanceOutputs | Unset
        if isinstance(_outputs, Unset):
            outputs = UNSET
        else:
            outputs = InstanceOutputs.from_dict(_outputs)

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

        def _parse_deployment_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        deployment_id = _parse_deployment_id(d.pop("deployment_id", UNSET))

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

        def _parse_updated_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_0 = isoparse(data)

                return updated_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        updated_at = _parse_updated_at(d.pop("updated_at", UNSET))

        def _parse_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        error = _parse_error(d.pop("error", UNSET))

        def _parse_integration_type(data: object) -> IntegrationType | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                integration_type_type_0 = IntegrationType(data)

                return integration_type_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(IntegrationType | None | Unset, data)

        integration_type = _parse_integration_type(d.pop("integration_type", UNSET))

        def _parse_sync_enabled(data: object) -> bool | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(bool | None | Unset, data)

        sync_enabled = _parse_sync_enabled(d.pop("sync_enabled", UNSET))

        def _parse_sync_interval(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        sync_interval = _parse_sync_interval(d.pop("sync_interval", UNSET))

        def _parse_last_sync_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                last_sync_at_type_0 = isoparse(data)

                return last_sync_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        last_sync_at = _parse_last_sync_at(d.pop("last_sync_at", UNSET))

        def _parse_last_sync_status(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        last_sync_status = _parse_last_sync_status(d.pop("last_sync_status", UNSET))

        def _parse_last_sync_items_count(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        last_sync_items_count = _parse_last_sync_items_count(d.pop("last_sync_items_count", UNSET))

        def _parse_last_sync_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        last_sync_error = _parse_last_sync_error(d.pop("last_sync_error", UNSET))

        def _parse_next_sync_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                next_sync_at_type_0 = isoparse(data)

                return next_sync_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        next_sync_at = _parse_next_sync_at(d.pop("next_sync_at", UNSET))

        instance = cls(
            id=id,
            template_id=template_id,
            name=name,
            description=description,
            config=config,
            deployment_target=deployment_target,
            status=status,
            outputs=outputs,
            container_id=container_id,
            container_name=container_name,
            deployment_id=deployment_id,
            created_at=created_at,
            deployed_at=deployed_at,
            updated_at=updated_at,
            error=error,
            integration_type=integration_type,
            sync_enabled=sync_enabled,
            sync_interval=sync_interval,
            last_sync_at=last_sync_at,
            last_sync_status=last_sync_status,
            last_sync_items_count=last_sync_items_count,
            last_sync_error=last_sync_error,
            next_sync_at=next_sync_at,
        )

        instance.additional_properties = d
        return instance

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
