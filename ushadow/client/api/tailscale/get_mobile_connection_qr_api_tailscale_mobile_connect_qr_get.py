from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.mobile_connection_qr import MobileConnectionQR
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/tailscale/mobile/connect-qr",
    }

    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> MobileConnectionQR | None:
    if response.status_code == 200:
        response_200 = MobileConnectionQR.from_dict(response.json())

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[MobileConnectionQR]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[MobileConnectionQR]:
    """Get Mobile Connection Qr

     Generate QR code for mobile app to connect to this leader.

    The QR code contains minimal connection details (hostname, Tailscale IP, port)
    plus an auth token for automatic authentication with ushadow and chronicle.
    After scanning, the mobile app fetches full details from /api/unodes/leader/info

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[MobileConnectionQR]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
) -> MobileConnectionQR | None:
    """Get Mobile Connection Qr

     Generate QR code for mobile app to connect to this leader.

    The QR code contains minimal connection details (hostname, Tailscale IP, port)
    plus an auth token for automatic authentication with ushadow and chronicle.
    After scanning, the mobile app fetches full details from /api/unodes/leader/info

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        MobileConnectionQR
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[MobileConnectionQR]:
    """Get Mobile Connection Qr

     Generate QR code for mobile app to connect to this leader.

    The QR code contains minimal connection details (hostname, Tailscale IP, port)
    plus an auth token for automatic authentication with ushadow and chronicle.
    After scanning, the mobile app fetches full details from /api/unodes/leader/info

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[MobileConnectionQR]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
) -> MobileConnectionQR | None:
    """Get Mobile Connection Qr

     Generate QR code for mobile app to connect to this leader.

    The QR code contains minimal connection details (hostname, Tailscale IP, port)
    plus an auth token for automatic authentication with ushadow and chronicle.
    After scanning, the mobile app fetches full details from /api/unodes/leader/info

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        MobileConnectionQR
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
