from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.debug_docker_ports_api_services_debug_docker_ports_get_response_debug_docker_ports_api_services_debug_docker_ports_get import (
    DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet,
)
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/services/debug/docker-ports",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet | None:
    if response.status_code == 200:
        response_200 = DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet.from_dict(
            response.json()
        )

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet]:
    """Debug Docker Ports

     Debug endpoint to show all Docker container port bindings.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
) -> DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet | None:
    """Debug Docker Ports

     Debug endpoint to show all Docker container port bindings.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet]:
    """Debug Docker Ports

     Debug endpoint to show all Docker container port bindings.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
) -> DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet | None:
    """Debug Docker Ports

     Debug endpoint to show all Docker container port bindings.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DebugDockerPortsApiServicesDebugDockerPortsGetResponseDebugDockerPortsApiServicesDebugDockerPortsGet
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
