from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.hugging_face_models_response import HuggingFaceModelsResponse
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/wizard/huggingface/models",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HuggingFaceModelsResponse | None:
    if response.status_code == 200:
        response_200 = HuggingFaceModelsResponse.from_dict(response.json())

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[HuggingFaceModelsResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
) -> Response[HuggingFaceModelsResponse]:
    """Check Huggingface Models

     Check if user has access to required PyAnnote models.

    Uses the stored HF token to check model access.
    Returns access status for each required model.

    For gated models (like PyAnnote), we verify actual access by attempting
    to resolve a file, not just checking model metadata.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HuggingFaceModelsResponse]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
) -> HuggingFaceModelsResponse | None:
    """Check Huggingface Models

     Check if user has access to required PyAnnote models.

    Uses the stored HF token to check model access.
    Returns access status for each required model.

    For gated models (like PyAnnote), we verify actual access by attempting
    to resolve a file, not just checking model metadata.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HuggingFaceModelsResponse
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
) -> Response[HuggingFaceModelsResponse]:
    """Check Huggingface Models

     Check if user has access to required PyAnnote models.

    Uses the stored HF token to check model access.
    Returns access status for each required model.

    For gated models (like PyAnnote), we verify actual access by attempting
    to resolve a file, not just checking model metadata.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HuggingFaceModelsResponse]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
) -> HuggingFaceModelsResponse | None:
    """Check Huggingface Models

     Check if user has access to required PyAnnote models.

    Uses the stored HF token to check model access.
    Returns access status for each required model.

    For gated models (like PyAnnote), we verify actual access by attempting
    to resolve a file, not just checking model metadata.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HuggingFaceModelsResponse
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
