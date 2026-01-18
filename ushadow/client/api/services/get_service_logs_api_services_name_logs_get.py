from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.logs_response import LogsResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    name: str,
    *,
    tail: int | Unset = 100,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["tail"] = tail

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/services/{name}/logs".format(
            name=quote(str(name), safe=""),
        ),
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | LogsResponse | None:
    if response.status_code == 200:
        response_200 = LogsResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | LogsResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    name: str,
    *,
    client: AuthenticatedClient,
    tail: int | Unset = 100,
) -> Response[HTTPValidationError | LogsResponse]:
    """Get Service Logs

     Get logs from a service container.

    Args:
        name: Service name
        tail: Number of lines to retrieve (default 100)

    Args:
        name (str):
        tail (int | Unset):  Default: 100.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | LogsResponse]
    """

    kwargs = _get_kwargs(
        name=name,
        tail=tail,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    name: str,
    *,
    client: AuthenticatedClient,
    tail: int | Unset = 100,
) -> HTTPValidationError | LogsResponse | None:
    """Get Service Logs

     Get logs from a service container.

    Args:
        name: Service name
        tail: Number of lines to retrieve (default 100)

    Args:
        name (str):
        tail (int | Unset):  Default: 100.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | LogsResponse
    """

    return sync_detailed(
        name=name,
        client=client,
        tail=tail,
    ).parsed


async def asyncio_detailed(
    name: str,
    *,
    client: AuthenticatedClient,
    tail: int | Unset = 100,
) -> Response[HTTPValidationError | LogsResponse]:
    """Get Service Logs

     Get logs from a service container.

    Args:
        name: Service name
        tail: Number of lines to retrieve (default 100)

    Args:
        name (str):
        tail (int | Unset):  Default: 100.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | LogsResponse]
    """

    kwargs = _get_kwargs(
        name=name,
        tail=tail,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    name: str,
    *,
    client: AuthenticatedClient,
    tail: int | Unset = 100,
) -> HTTPValidationError | LogsResponse | None:
    """Get Service Logs

     Get logs from a service container.

    Args:
        name: Service name
        tail: Number of lines to retrieve (default 100)

    Args:
        name (str):
        tail (int | Unset):  Default: 100.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | LogsResponse
    """

    return (
        await asyncio_detailed(
            name=name,
            client=client,
            tail=tail,
        )
    ).parsed
