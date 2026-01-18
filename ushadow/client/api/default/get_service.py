from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.service import Service
from ...types import Response


def _get_kwargs(
    service_name: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/services/{service_name}".format(
            service_name=quote(str(service_name), safe=""),
        ),
    }

    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Service | None:
    if response.status_code == 200:
        response_200 = Service.from_dict(response.json())

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[Service]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    service_name: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[Service]:
    """Get Service

    Args:
        service_name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Service]
    """

    kwargs = _get_kwargs(
        service_name=service_name,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    service_name: str,
    *,
    client: AuthenticatedClient | Client,
) -> Service | None:
    """Get Service

    Args:
        service_name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Service
    """

    return sync_detailed(
        service_name=service_name,
        client=client,
    ).parsed


async def asyncio_detailed(
    service_name: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[Service]:
    """Get Service

    Args:
        service_name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Service]
    """

    kwargs = _get_kwargs(
        service_name=service_name,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    service_name: str,
    *,
    client: AuthenticatedClient | Client,
) -> Service | None:
    """Get Service

    Args:
        service_name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Service
    """

    return (
        await asyncio_detailed(
            service_name=service_name,
            client=client,
        )
    ).parsed
