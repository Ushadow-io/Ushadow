from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.leader_info_response import LeaderInfoResponse
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/unodes/leader/info",
    }

    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> LeaderInfoResponse | None:
    if response.status_code == 200:
        response_200 = LeaderInfoResponse.from_dict(response.json())

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[LeaderInfoResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
) -> Response[LeaderInfoResponse]:
    """Get Leader Info

     Get full leader information for mobile app connection.

    This is an unauthenticated endpoint that returns leader details
    for mobile apps that have just connected via QR code.
    The mobile app uses this to display cluster status and capabilities.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[LeaderInfoResponse]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
) -> LeaderInfoResponse | None:
    """Get Leader Info

     Get full leader information for mobile app connection.

    This is an unauthenticated endpoint that returns leader details
    for mobile apps that have just connected via QR code.
    The mobile app uses this to display cluster status and capabilities.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        LeaderInfoResponse
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
) -> Response[LeaderInfoResponse]:
    """Get Leader Info

     Get full leader information for mobile app connection.

    This is an unauthenticated endpoint that returns leader details
    for mobile apps that have just connected via QR code.
    The mobile app uses this to display cluster status and capabilities.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[LeaderInfoResponse]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
) -> LeaderInfoResponse | None:
    """Get Leader Info

     Get full leader information for mobile app connection.

    This is an unauthenticated endpoint that returns leader details
    for mobile apps that have just connected via QR code.
    The mobile app uses this to display cluster status and capabilities.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        LeaderInfoResponse
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
