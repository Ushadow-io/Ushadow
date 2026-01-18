from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.apply_defaults_api_providers_apply_defaults_mode_post_response_apply_defaults_api_providers_apply_defaults_mode_post import (
    ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    mode: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/providers/apply-defaults/{mode}".format(
            mode=quote(str(mode), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost
    | HTTPValidationError
    | None
):
    if response.status_code == 200:
        response_200 = ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost.from_dict(
            response.json()
        )

        return response_200

    if response.status_code == 422:
        response_422 = HTTPValidationError.from_dict(response.json())

        return response_422

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[
    ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost
    | HTTPValidationError
]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    mode: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[
    ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost
    | HTTPValidationError
]:
    """Apply Defaults

     Apply default providers for a mode.

    Args:
        mode (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        mode=mode,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    mode: str,
    *,
    client: AuthenticatedClient | Client,
) -> (
    ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost
    | HTTPValidationError
    | None
):
    """Apply Defaults

     Apply default providers for a mode.

    Args:
        mode (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost | HTTPValidationError
    """

    return sync_detailed(
        mode=mode,
        client=client,
    ).parsed


async def asyncio_detailed(
    mode: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[
    ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost
    | HTTPValidationError
]:
    """Apply Defaults

     Apply default providers for a mode.

    Args:
        mode (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        mode=mode,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    mode: str,
    *,
    client: AuthenticatedClient | Client,
) -> (
    ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost
    | HTTPValidationError
    | None
):
    """Apply Defaults

     Apply default providers for a mode.

    Args:
        mode (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApplyDefaultsApiProvidersApplyDefaultsModePostResponseApplyDefaultsApiProvidersApplyDefaultsModePost | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            mode=mode,
            client=client,
        )
    ).parsed
