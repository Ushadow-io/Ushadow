from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.manager_versions_response import ManagerVersionsResponse
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/unodes/versions",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ManagerVersionsResponse | None:
    if response.status_code == 200:
        response_200 = ManagerVersionsResponse.from_dict(response.json())

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ManagerVersionsResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[ManagerVersionsResponse]:
    """Get Manager Versions

     Get available ushadow-manager versions from the container registry.

    Fetches tags from ghcr.io/ushadow-io/ushadow-manager and returns
    them sorted with semantic versioning (latest first).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ManagerVersionsResponse]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
) -> ManagerVersionsResponse | None:
    """Get Manager Versions

     Get available ushadow-manager versions from the container registry.

    Fetches tags from ghcr.io/ushadow-io/ushadow-manager and returns
    them sorted with semantic versioning (latest first).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ManagerVersionsResponse
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[ManagerVersionsResponse]:
    """Get Manager Versions

     Get available ushadow-manager versions from the container registry.

    Fetches tags from ghcr.io/ushadow-io/ushadow-manager and returns
    them sorted with semantic versioning (latest first).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ManagerVersionsResponse]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
) -> ManagerVersionsResponse | None:
    """Get Manager Versions

     Get available ushadow-manager versions from the container registry.

    Fetches tags from ghcr.io/ushadow-io/ushadow-manager and returns
    them sorted with semantic versioning (latest first).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ManagerVersionsResponse
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
