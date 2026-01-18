from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.installation_guide import InstallationGuide
from ...types import UNSET, Response


def _get_kwargs(
    *,
    os_type: str,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["os_type"] = os_type

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/tailscale/installation-guide",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | InstallationGuide | None:
    if response.status_code == 200:
        response_200 = InstallationGuide.from_dict(response.json())

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
) -> Response[HTTPValidationError | InstallationGuide]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    os_type: str,
) -> Response[HTTPValidationError | InstallationGuide]:
    """Get Installation Guide

     Get platform-specific Tailscale installation instructions

    Args:
        os_type (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | InstallationGuide]
    """

    kwargs = _get_kwargs(
        os_type=os_type,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    os_type: str,
) -> HTTPValidationError | InstallationGuide | None:
    """Get Installation Guide

     Get platform-specific Tailscale installation instructions

    Args:
        os_type (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | InstallationGuide
    """

    return sync_detailed(
        client=client,
        os_type=os_type,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    os_type: str,
) -> Response[HTTPValidationError | InstallationGuide]:
    """Get Installation Guide

     Get platform-specific Tailscale installation instructions

    Args:
        os_type (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | InstallationGuide]
    """

    kwargs = _get_kwargs(
        os_type=os_type,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    os_type: str,
) -> HTTPValidationError | InstallationGuide | None:
    """Get Installation Guide

     Get platform-specific Tailscale installation instructions

    Args:
        os_type (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | InstallationGuide
    """

    return (
        await asyncio_detailed(
            client=client,
            os_type=os_type,
        )
    ).parsed
