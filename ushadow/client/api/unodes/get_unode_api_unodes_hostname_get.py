from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.u_node import UNode
from ...types import Response


def _get_kwargs(
    hostname: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/unodes/{hostname}".format(
            hostname=quote(str(hostname), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | UNode | None:
    if response.status_code == 200:
        response_200 = UNode.from_dict(response.json())

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
) -> Response[HTTPValidationError | UNode]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    hostname: str,
    *,
    client: AuthenticatedClient,
) -> Response[HTTPValidationError | UNode]:
    """Get Unode

     Get details of a specific u-node.

    Args:
        hostname (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UNode]
    """

    kwargs = _get_kwargs(
        hostname=hostname,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    hostname: str,
    *,
    client: AuthenticatedClient,
) -> HTTPValidationError | UNode | None:
    """Get Unode

     Get details of a specific u-node.

    Args:
        hostname (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UNode
    """

    return sync_detailed(
        hostname=hostname,
        client=client,
    ).parsed


async def asyncio_detailed(
    hostname: str,
    *,
    client: AuthenticatedClient,
) -> Response[HTTPValidationError | UNode]:
    """Get Unode

     Get details of a specific u-node.

    Args:
        hostname (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UNode]
    """

    kwargs = _get_kwargs(
        hostname=hostname,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    hostname: str,
    *,
    client: AuthenticatedClient,
) -> HTTPValidationError | UNode | None:
    """Get Unode

     Get details of a specific u-node.

    Args:
        hostname (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UNode
    """

    return (
        await asyncio_detailed(
            hostname=hostname,
            client=client,
        )
    ).parsed
