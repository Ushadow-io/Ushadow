from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.u_node_action_response import UNodeActionResponse
from ...models.u_node_status import UNodeStatus
from ...types import UNSET, Response


def _get_kwargs(
    hostname: str,
    *,
    status: UNodeStatus,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    json_status = status.value
    params["status"] = json_status

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/unodes/{hostname}/status".format(
            hostname=quote(str(hostname), safe=""),
        ),
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | UNodeActionResponse | None:
    if response.status_code == 200:
        response_200 = UNodeActionResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | UNodeActionResponse]:
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
    status: UNodeStatus,
) -> Response[HTTPValidationError | UNodeActionResponse]:
    """Update Unode Status

     Manually update a u-node's status.

    Args:
        hostname (str):
        status (UNodeStatus): Connection status of a u-node.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UNodeActionResponse]
    """

    kwargs = _get_kwargs(
        hostname=hostname,
        status=status,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    hostname: str,
    *,
    client: AuthenticatedClient,
    status: UNodeStatus,
) -> HTTPValidationError | UNodeActionResponse | None:
    """Update Unode Status

     Manually update a u-node's status.

    Args:
        hostname (str):
        status (UNodeStatus): Connection status of a u-node.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UNodeActionResponse
    """

    return sync_detailed(
        hostname=hostname,
        client=client,
        status=status,
    ).parsed


async def asyncio_detailed(
    hostname: str,
    *,
    client: AuthenticatedClient,
    status: UNodeStatus,
) -> Response[HTTPValidationError | UNodeActionResponse]:
    """Update Unode Status

     Manually update a u-node's status.

    Args:
        hostname (str):
        status (UNodeStatus): Connection status of a u-node.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UNodeActionResponse]
    """

    kwargs = _get_kwargs(
        hostname=hostname,
        status=status,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    hostname: str,
    *,
    client: AuthenticatedClient,
    status: UNodeStatus,
) -> HTTPValidationError | UNodeActionResponse | None:
    """Update Unode Status

     Manually update a u-node's status.

    Args:
        hostname (str):
        status (UNodeStatus): Connection status of a u-node.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UNodeActionResponse
    """

    return (
        await asyncio_detailed(
            hostname=hostname,
            client=client,
            status=status,
        )
    ).parsed
