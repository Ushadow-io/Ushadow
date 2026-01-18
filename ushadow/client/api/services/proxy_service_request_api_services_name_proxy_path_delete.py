from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    name: str,
    path: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "patch",
        "url": "/api/services/{name}/proxy/{path}".format(
            name=quote(str(name), safe=""),
            path=quote(str(path), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Any | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = response.json()
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
) -> Response[Any | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    name: str,
    path: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[Any | HTTPValidationError]:
    """Proxy Service Request

     Generic proxy endpoint for service REST APIs.

    Routes frontend requests through ushadow backend to any managed service.
    This provides:
    - Unified authentication (JWT forwarded to service)
    - No CORS issues
    - Centralized logging/monitoring
    - Service discovery (no hardcoded ports)

    Usage:
        Frontend: axios.get('/api/services/chronicle-backend/proxy/api/conversations')
        Backend: Forwards to http://chronicle-backend:8000/api/conversations

    For WebSocket/streaming, use direct_url from connection-info instead.

    Args:
        name (str):
        path (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
        path=path,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    name: str,
    path: str,
    *,
    client: AuthenticatedClient | Client,
) -> Any | HTTPValidationError | None:
    """Proxy Service Request

     Generic proxy endpoint for service REST APIs.

    Routes frontend requests through ushadow backend to any managed service.
    This provides:
    - Unified authentication (JWT forwarded to service)
    - No CORS issues
    - Centralized logging/monitoring
    - Service discovery (no hardcoded ports)

    Usage:
        Frontend: axios.get('/api/services/chronicle-backend/proxy/api/conversations')
        Backend: Forwards to http://chronicle-backend:8000/api/conversations

    For WebSocket/streaming, use direct_url from connection-info instead.

    Args:
        name (str):
        path (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | HTTPValidationError
    """

    return sync_detailed(
        name=name,
        path=path,
        client=client,
    ).parsed


async def asyncio_detailed(
    name: str,
    path: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[Any | HTTPValidationError]:
    """Proxy Service Request

     Generic proxy endpoint for service REST APIs.

    Routes frontend requests through ushadow backend to any managed service.
    This provides:
    - Unified authentication (JWT forwarded to service)
    - No CORS issues
    - Centralized logging/monitoring
    - Service discovery (no hardcoded ports)

    Usage:
        Frontend: axios.get('/api/services/chronicle-backend/proxy/api/conversations')
        Backend: Forwards to http://chronicle-backend:8000/api/conversations

    For WebSocket/streaming, use direct_url from connection-info instead.

    Args:
        name (str):
        path (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
        path=path,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    name: str,
    path: str,
    *,
    client: AuthenticatedClient | Client,
) -> Any | HTTPValidationError | None:
    """Proxy Service Request

     Generic proxy endpoint for service REST APIs.

    Routes frontend requests through ushadow backend to any managed service.
    This provides:
    - Unified authentication (JWT forwarded to service)
    - No CORS issues
    - Centralized logging/monitoring
    - Service discovery (no hardcoded ports)

    Usage:
        Frontend: axios.get('/api/services/chronicle-backend/proxy/api/conversations')
        Backend: Forwards to http://chronicle-backend:8000/api/conversations

    For WebSocket/streaming, use direct_url from connection-info instead.

    Args:
        name (str):
        path (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            name=name,
            path=path,
            client=client,
        )
    ).parsed
