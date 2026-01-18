from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="UNodeCapabilities")


@_attrs_define
class UNodeCapabilities:
    """Capabilities of a u-node.

    Attributes:
        can_run_docker (bool | Unset):  Default: True.
        can_run_gpu (bool | Unset):  Default: False.
        can_become_leader (bool | Unset):  Default: False.
        available_memory_mb (int | Unset):  Default: 0.
        available_cpu_cores (float | Unset):  Default: 0.0.
        available_disk_gb (float | Unset):  Default: 0.0.
    """

    can_run_docker: bool | Unset = True
    can_run_gpu: bool | Unset = False
    can_become_leader: bool | Unset = False
    available_memory_mb: int | Unset = 0
    available_cpu_cores: float | Unset = 0.0
    available_disk_gb: float | Unset = 0.0
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        can_run_docker = self.can_run_docker

        can_run_gpu = self.can_run_gpu

        can_become_leader = self.can_become_leader

        available_memory_mb = self.available_memory_mb

        available_cpu_cores = self.available_cpu_cores

        available_disk_gb = self.available_disk_gb

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if can_run_docker is not UNSET:
            field_dict["can_run_docker"] = can_run_docker
        if can_run_gpu is not UNSET:
            field_dict["can_run_gpu"] = can_run_gpu
        if can_become_leader is not UNSET:
            field_dict["can_become_leader"] = can_become_leader
        if available_memory_mb is not UNSET:
            field_dict["available_memory_mb"] = available_memory_mb
        if available_cpu_cores is not UNSET:
            field_dict["available_cpu_cores"] = available_cpu_cores
        if available_disk_gb is not UNSET:
            field_dict["available_disk_gb"] = available_disk_gb

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        can_run_docker = d.pop("can_run_docker", UNSET)

        can_run_gpu = d.pop("can_run_gpu", UNSET)

        can_become_leader = d.pop("can_become_leader", UNSET)

        available_memory_mb = d.pop("available_memory_mb", UNSET)

        available_cpu_cores = d.pop("available_cpu_cores", UNSET)

        available_disk_gb = d.pop("available_disk_gb", UNSET)

        u_node_capabilities = cls(
            can_run_docker=can_run_docker,
            can_run_gpu=can_run_gpu,
            can_become_leader=can_become_leader,
            available_memory_mb=available_memory_mb,
            available_cpu_cores=available_cpu_cores,
            available_disk_gb=available_disk_gb,
        )

        u_node_capabilities.additional_properties = d
        return u_node_capabilities

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
