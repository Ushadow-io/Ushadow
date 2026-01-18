from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ApiKeysStep")


@_attrs_define
class ApiKeysStep:
    """API Keys configuration step.

    Attributes:
        openai_api_key (None | str | Unset):
        deepgram_api_key (None | str | Unset):
        mistral_api_key (None | str | Unset):
        anthropic_api_key (None | str | Unset):
        hf_token (None | str | Unset):
    """

    openai_api_key: None | str | Unset = UNSET
    deepgram_api_key: None | str | Unset = UNSET
    mistral_api_key: None | str | Unset = UNSET
    anthropic_api_key: None | str | Unset = UNSET
    hf_token: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        openai_api_key: None | str | Unset
        if isinstance(self.openai_api_key, Unset):
            openai_api_key = UNSET
        else:
            openai_api_key = self.openai_api_key

        deepgram_api_key: None | str | Unset
        if isinstance(self.deepgram_api_key, Unset):
            deepgram_api_key = UNSET
        else:
            deepgram_api_key = self.deepgram_api_key

        mistral_api_key: None | str | Unset
        if isinstance(self.mistral_api_key, Unset):
            mistral_api_key = UNSET
        else:
            mistral_api_key = self.mistral_api_key

        anthropic_api_key: None | str | Unset
        if isinstance(self.anthropic_api_key, Unset):
            anthropic_api_key = UNSET
        else:
            anthropic_api_key = self.anthropic_api_key

        hf_token: None | str | Unset
        if isinstance(self.hf_token, Unset):
            hf_token = UNSET
        else:
            hf_token = self.hf_token

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if openai_api_key is not UNSET:
            field_dict["openai_api_key"] = openai_api_key
        if deepgram_api_key is not UNSET:
            field_dict["deepgram_api_key"] = deepgram_api_key
        if mistral_api_key is not UNSET:
            field_dict["mistral_api_key"] = mistral_api_key
        if anthropic_api_key is not UNSET:
            field_dict["anthropic_api_key"] = anthropic_api_key
        if hf_token is not UNSET:
            field_dict["hf_token"] = hf_token

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_openai_api_key(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        openai_api_key = _parse_openai_api_key(d.pop("openai_api_key", UNSET))

        def _parse_deepgram_api_key(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        deepgram_api_key = _parse_deepgram_api_key(d.pop("deepgram_api_key", UNSET))

        def _parse_mistral_api_key(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        mistral_api_key = _parse_mistral_api_key(d.pop("mistral_api_key", UNSET))

        def _parse_anthropic_api_key(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        anthropic_api_key = _parse_anthropic_api_key(d.pop("anthropic_api_key", UNSET))

        def _parse_hf_token(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        hf_token = _parse_hf_token(d.pop("hf_token", UNSET))

        api_keys_step = cls(
            openai_api_key=openai_api_key,
            deepgram_api_key=deepgram_api_key,
            mistral_api_key=mistral_api_key,
            anthropic_api_key=anthropic_api_key,
            hf_token=hf_token,
        )

        api_keys_step.additional_properties = d
        return api_keys_step

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
