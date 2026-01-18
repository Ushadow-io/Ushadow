from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.u_node_list_response import UNodeListResponse
from ...models.u_node_role import UNodeRole
from ...models.u_node_status import UNodeStatus
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    status: None | UNodeStatus | Unset = UNSET,
    role: None | UNodeRole | Unset = UNSET,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    json_status: None | str | Unset
    if isinstance(status, Unset):
        json_status = UNSET
    elif isinstance(status, UNodeStatus):
        json_status = status.value
    else:
        json_status = status
    params["status"] = json_status

    json_role: None | str | Unset
    if isinstance(role, Unset):
        json_role = UNSET
    elif isinstance(role, UNodeRole):
        json_role = role.value
    else:
        json_role = role
    params["role"] = json_role

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/unodes",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | UNodeListResponse | None:
    if response.status_code == 200:
        response_200 = UNodeListResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | UNodeListResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    status: None | UNodeStatus | Unset = UNSET,
    role: None | UNodeRole | Unset = UNSET,
) -> Response[HTTPValidationError | UNodeListResponse]:
    """List Unodes

     List all u-nodes in the cluster.

    Args:
        status (None | UNodeStatus | Unset):
        role (None | UNodeRole | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UNodeListResponse]
    """

    kwargs = _get_kwargs(
        status=status,
        role=role,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    status: None | UNodeStatus | Unset = UNSET,
    role: None | UNodeRole | Unset = UNSET,
) -> HTTPValidationError | UNodeListResponse | None:
    """List Unodes

     List all u-nodes in the cluster.

    Args:
        status (None | UNodeStatus | Unset):
        role (None | UNodeRole | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UNodeListResponse
    """

    return sync_detailed(
        client=client,
        status=status,
        role=role,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    status: None | UNodeStatus | Unset = UNSET,
    role: None | UNodeRole | Unset = UNSET,
) -> Response[HTTPValidationError | UNodeListResponse]:
    """List Unodes

     List all u-nodes in the cluster.

    Args:
        status (None | UNodeStatus | Unset):
        role (None | UNodeRole | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UNodeListResponse]
    """

    kwargs = _get_kwargs(
        status=status,
        role=role,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    status: None | UNodeStatus | Unset = UNSET,
    role: None | UNodeRole | Unset = UNSET,
) -> HTTPValidationError | UNodeListResponse | None:
    """List Unodes

     List all u-nodes in the cluster.

    Args:
        status (None | UNodeStatus | Unset):
        role (None | UNodeRole | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UNodeListResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            status=status,
            role=role,
        )
    ).parsed
