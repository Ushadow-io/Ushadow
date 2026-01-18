from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.docker_hub_image_info import DockerHubImageInfo


T = TypeVar("T", bound="DockerHubScanResponse")


@_attrs_define
class DockerHubScanResponse:
    """Response from scanning a Docker Hub image.

    Attributes:
        success (bool):
        image_info (DockerHubImageInfo | None | Unset):
        description (None | str | Unset):
        stars (int | Unset):  Default: 0.
        pulls (int | Unset):  Default: 0.
        available_tags (list[str] | Unset):
        message (None | str | Unset):
        error (None | str | Unset):
    """

    success: bool
    image_info: DockerHubImageInfo | None | Unset = UNSET
    description: None | str | Unset = UNSET
    stars: int | Unset = 0
    pulls: int | Unset = 0
    available_tags: list[str] | Unset = UNSET
    message: None | str | Unset = UNSET
    error: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.docker_hub_image_info import DockerHubImageInfo

        success = self.success

        image_info: dict[str, Any] | None | Unset
        if isinstance(self.image_info, Unset):
            image_info = UNSET
        elif isinstance(self.image_info, DockerHubImageInfo):
            image_info = self.image_info.to_dict()
        else:
            image_info = self.image_info

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        stars = self.stars

        pulls = self.pulls

        available_tags: list[str] | Unset = UNSET
        if not isinstance(self.available_tags, Unset):
            available_tags = self.available_tags

        message: None | str | Unset
        if isinstance(self.message, Unset):
            message = UNSET
        else:
            message = self.message

        error: None | str | Unset
        if isinstance(self.error, Unset):
            error = UNSET
        else:
            error = self.error

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
            }
        )
        if image_info is not UNSET:
            field_dict["image_info"] = image_info
        if description is not UNSET:
            field_dict["description"] = description
        if stars is not UNSET:
            field_dict["stars"] = stars
        if pulls is not UNSET:
            field_dict["pulls"] = pulls
        if available_tags is not UNSET:
            field_dict["available_tags"] = available_tags
        if message is not UNSET:
            field_dict["message"] = message
        if error is not UNSET:
            field_dict["error"] = error

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.docker_hub_image_info import DockerHubImageInfo

        d = dict(src_dict)
        success = d.pop("success")

        def _parse_image_info(data: object) -> DockerHubImageInfo | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                image_info_type_0 = DockerHubImageInfo.from_dict(data)

                return image_info_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(DockerHubImageInfo | None | Unset, data)

        image_info = _parse_image_info(d.pop("image_info", UNSET))

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        stars = d.pop("stars", UNSET)

        pulls = d.pop("pulls", UNSET)

        available_tags = cast(list[str], d.pop("available_tags", UNSET))

        def _parse_message(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        message = _parse_message(d.pop("message", UNSET))

        def _parse_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        error = _parse_error(d.pop("error", UNSET))

        docker_hub_scan_response = cls(
            success=success,
            image_info=image_info,
            description=description,
            stars=stars,
            pulls=pulls,
            available_tags=available_tags,
            message=message,
            error=error,
        )

        docker_hub_scan_response.additional_properties = d
        return docker_hub_scan_response

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
