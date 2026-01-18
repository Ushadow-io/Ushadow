from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.detected_compose_file import DetectedComposeFile
    from ..models.git_hub_url_info import GitHubUrlInfo


T = TypeVar("T", bound="GitHubScanResponse")


@_attrs_define
class GitHubScanResponse:
    """Response from scanning a GitHub repository.

    Attributes:
        success (bool):
        github_info (GitHubUrlInfo | None | Unset):
        compose_files (list[DetectedComposeFile] | Unset):
        message (None | str | Unset):
        error (None | str | Unset):
    """

    success: bool
    github_info: GitHubUrlInfo | None | Unset = UNSET
    compose_files: list[DetectedComposeFile] | Unset = UNSET
    message: None | str | Unset = UNSET
    error: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.git_hub_url_info import GitHubUrlInfo

        success = self.success

        github_info: dict[str, Any] | None | Unset
        if isinstance(self.github_info, Unset):
            github_info = UNSET
        elif isinstance(self.github_info, GitHubUrlInfo):
            github_info = self.github_info.to_dict()
        else:
            github_info = self.github_info

        compose_files: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.compose_files, Unset):
            compose_files = []
            for compose_files_item_data in self.compose_files:
                compose_files_item = compose_files_item_data.to_dict()
                compose_files.append(compose_files_item)

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
        if github_info is not UNSET:
            field_dict["github_info"] = github_info
        if compose_files is not UNSET:
            field_dict["compose_files"] = compose_files
        if message is not UNSET:
            field_dict["message"] = message
        if error is not UNSET:
            field_dict["error"] = error

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.detected_compose_file import DetectedComposeFile
        from ..models.git_hub_url_info import GitHubUrlInfo

        d = dict(src_dict)
        success = d.pop("success")

        def _parse_github_info(data: object) -> GitHubUrlInfo | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                github_info_type_0 = GitHubUrlInfo.from_dict(data)

                return github_info_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(GitHubUrlInfo | None | Unset, data)

        github_info = _parse_github_info(d.pop("github_info", UNSET))

        _compose_files = d.pop("compose_files", UNSET)
        compose_files: list[DetectedComposeFile] | Unset = UNSET
        if _compose_files is not UNSET:
            compose_files = []
            for compose_files_item_data in _compose_files:
                compose_files_item = DetectedComposeFile.from_dict(compose_files_item_data)

                compose_files.append(compose_files_item)

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

        git_hub_scan_response = cls(
            success=success,
            github_info=github_info,
            compose_files=compose_files,
            message=message,
            error=error,
        )

        git_hub_scan_response.additional_properties = d
        return git_hub_scan_response

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
