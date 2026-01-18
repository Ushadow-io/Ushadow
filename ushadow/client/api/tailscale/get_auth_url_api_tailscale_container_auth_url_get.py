from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.auth_url_response import AuthUrlResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    regenerate: bool | Unset = False,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["regenerate"] = regenerate

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/tailscale/container/auth-url",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> AuthUrlResponse | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = AuthUrlResponse.from_dict(response.json())

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
) -> Response[AuthUrlResponse | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    regenerate: bool | Unset = False,
) -> Response[AuthUrlResponse | HTTPValidationError]:
    """Get Auth Url

     Get Tailscale authentication URL with QR code.

    Args:
        regenerate: If True, logout first to force a new auth URL

    Args:
        regenerate (bool | Unset):  Default: False.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[AuthUrlResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        regenerate=regenerate,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    regenerate: bool | Unset = False,
) -> AuthUrlResponse | HTTPValidationError | None:
    """Get Auth Url

     Get Tailscale authentication URL with QR code.

    Args:
        regenerate: If True, logout first to force a new auth URL

    Args:
        regenerate (bool | Unset):  Default: False.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        AuthUrlResponse | HTTPValidationError
    """

    return sync_detailed(
        client=client,
        regenerate=regenerate,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    regenerate: bool | Unset = False,
) -> Response[AuthUrlResponse | HTTPValidationError]:
    """Get Auth Url

     Get Tailscale authentication URL with QR code.

    Args:
        regenerate: If True, logout first to force a new auth URL

    Args:
        regenerate (bool | Unset):  Default: False.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[AuthUrlResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        regenerate=regenerate,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    regenerate: bool | Unset = False,
) -> AuthUrlResponse | HTTPValidationError | None:
    """Get Auth Url

     Get Tailscale authentication URL with QR code.

    Args:
        regenerate: If True, logout first to force a new auth URL

    Args:
        regenerate (bool | Unset):  Default: False.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        AuthUrlResponse | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            client=client,
            regenerate=regenerate,
        )
    ).parsed
