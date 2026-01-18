from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.get_service_connection_info_api_services_name_connection_info_get_response_get_service_connection_info_api_services_name_connection_info_get import (
    GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    name: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/services/{name}/connection-info".format(
            name=quote(str(name), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet
    | HTTPValidationError
    | None
):
    if response.status_code == 200:
        response_200 = GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet.from_dict(
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
    GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet
    | HTTPValidationError
]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    name: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[
    GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet
    | HTTPValidationError
]:
    """Get Service Connection Info

     Get connection info for a service with both proxy and direct URLs.

    Returns TWO connection patterns for flexible service integration:

    1. proxy_url (Recommended for REST APIs):
       - Goes through ushadow backend proxy (/api/services/{name}/proxy/*)
       - Unified authentication (single JWT)
       - No CORS issues
       - Centralized logging/monitoring

    2. direct_url (For WebSocket/Streaming):
       - Direct connection to service (http://localhost:{port})
       - Low latency for real-time data
       - Use for: WebSocket, SSE, audio streaming (ws_pcm)

    Example:
        const info = await api.get('/api/services/chronicle-backend/connection-info')

        // For REST APIs (conversations, queue, config)
        axios.get(`${info.proxy_url}/api/conversations`)  // -> /api/services/chronicle-
    backend/proxy/api/conversations

        // For WebSocket streaming (ws_pcm)
        new WebSocket(`ws://localhost:${info.port}/ws_pcm`)  // -> ws://localhost:8082/ws_pcm

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    name: str,
    *,
    client: AuthenticatedClient | Client,
) -> (
    GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet
    | HTTPValidationError
    | None
):
    """Get Service Connection Info

     Get connection info for a service with both proxy and direct URLs.

    Returns TWO connection patterns for flexible service integration:

    1. proxy_url (Recommended for REST APIs):
       - Goes through ushadow backend proxy (/api/services/{name}/proxy/*)
       - Unified authentication (single JWT)
       - No CORS issues
       - Centralized logging/monitoring

    2. direct_url (For WebSocket/Streaming):
       - Direct connection to service (http://localhost:{port})
       - Low latency for real-time data
       - Use for: WebSocket, SSE, audio streaming (ws_pcm)

    Example:
        const info = await api.get('/api/services/chronicle-backend/connection-info')

        // For REST APIs (conversations, queue, config)
        axios.get(`${info.proxy_url}/api/conversations`)  // -> /api/services/chronicle-
    backend/proxy/api/conversations

        // For WebSocket streaming (ws_pcm)
        new WebSocket(`ws://localhost:${info.port}/ws_pcm`)  // -> ws://localhost:8082/ws_pcm

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet | HTTPValidationError
    """

    return sync_detailed(
        name=name,
        client=client,
    ).parsed


async def asyncio_detailed(
    name: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[
    GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet
    | HTTPValidationError
]:
    """Get Service Connection Info

     Get connection info for a service with both proxy and direct URLs.

    Returns TWO connection patterns for flexible service integration:

    1. proxy_url (Recommended for REST APIs):
       - Goes through ushadow backend proxy (/api/services/{name}/proxy/*)
       - Unified authentication (single JWT)
       - No CORS issues
       - Centralized logging/monitoring

    2. direct_url (For WebSocket/Streaming):
       - Direct connection to service (http://localhost:{port})
       - Low latency for real-time data
       - Use for: WebSocket, SSE, audio streaming (ws_pcm)

    Example:
        const info = await api.get('/api/services/chronicle-backend/connection-info')

        // For REST APIs (conversations, queue, config)
        axios.get(`${info.proxy_url}/api/conversations`)  // -> /api/services/chronicle-
    backend/proxy/api/conversations

        // For WebSocket streaming (ws_pcm)
        new WebSocket(`ws://localhost:${info.port}/ws_pcm`)  // -> ws://localhost:8082/ws_pcm

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    name: str,
    *,
    client: AuthenticatedClient | Client,
) -> (
    GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet
    | HTTPValidationError
    | None
):
    """Get Service Connection Info

     Get connection info for a service with both proxy and direct URLs.

    Returns TWO connection patterns for flexible service integration:

    1. proxy_url (Recommended for REST APIs):
       - Goes through ushadow backend proxy (/api/services/{name}/proxy/*)
       - Unified authentication (single JWT)
       - No CORS issues
       - Centralized logging/monitoring

    2. direct_url (For WebSocket/Streaming):
       - Direct connection to service (http://localhost:{port})
       - Low latency for real-time data
       - Use for: WebSocket, SSE, audio streaming (ws_pcm)

    Example:
        const info = await api.get('/api/services/chronicle-backend/connection-info')

        // For REST APIs (conversations, queue, config)
        axios.get(`${info.proxy_url}/api/conversations`)  // -> /api/services/chronicle-
    backend/proxy/api/conversations

        // For WebSocket streaming (ws_pcm)
        new WebSocket(`ws://localhost:${info.port}/ws_pcm`)  // -> ws://localhost:8082/ws_pcm

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetServiceConnectionInfoApiServicesNameConnectionInfoGetResponseGetServiceConnectionInfoApiServicesNameConnectionInfoGet | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            name=name,
            client=client,
        )
    ).parsed
