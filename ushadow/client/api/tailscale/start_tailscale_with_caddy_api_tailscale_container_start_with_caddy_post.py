from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.start_tailscale_with_caddy_api_tailscale_container_start_with_caddy_post_response_start_tailscale_with_caddy_api_tailscale_container_start_with_caddy_post import (
    StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost,
)
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/tailscale/container/start-with-caddy",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost
    | None
):
    if response.status_code == 200:
        response_200 = StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost.from_dict(
            response.json()
        )

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[
    StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost
]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[
    StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost
]:
    """Start Tailscale With Caddy

     Start both Tailscale and Caddy containers, then configure routing.

    This sets up the full reverse proxy architecture:
    - Tailscale handles secure HTTPS access via MagicDNS
    - Caddy handles path-based routing to services

    Route configuration:
    - /chronicle/* -> Chronicle backend (strips prefix)
    - /api/* -> Ushadow backend
    - /auth/* -> Ushadow backend
    - /ws_pcm -> Ushadow WebSocket
    - /* -> Ushadow frontend

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
) -> (
    StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost
    | None
):
    """Start Tailscale With Caddy

     Start both Tailscale and Caddy containers, then configure routing.

    This sets up the full reverse proxy architecture:
    - Tailscale handles secure HTTPS access via MagicDNS
    - Caddy handles path-based routing to services

    Route configuration:
    - /chronicle/* -> Chronicle backend (strips prefix)
    - /api/* -> Ushadow backend
    - /auth/* -> Ushadow backend
    - /ws_pcm -> Ushadow WebSocket
    - /* -> Ushadow frontend

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[
    StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost
]:
    """Start Tailscale With Caddy

     Start both Tailscale and Caddy containers, then configure routing.

    This sets up the full reverse proxy architecture:
    - Tailscale handles secure HTTPS access via MagicDNS
    - Caddy handles path-based routing to services

    Route configuration:
    - /chronicle/* -> Chronicle backend (strips prefix)
    - /api/* -> Ushadow backend
    - /auth/* -> Ushadow backend
    - /ws_pcm -> Ushadow WebSocket
    - /* -> Ushadow frontend

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
) -> (
    StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost
    | None
):
    """Start Tailscale With Caddy

     Start both Tailscale and Caddy containers, then configure routing.

    This sets up the full reverse proxy architecture:
    - Tailscale handles secure HTTPS access via MagicDNS
    - Caddy handles path-based routing to services

    Route configuration:
    - /chronicle/* -> Chronicle backend (strips prefix)
    - /api/* -> Ushadow backend
    - /auth/* -> Ushadow backend
    - /ws_pcm -> Ushadow WebSocket
    - /* -> Ushadow frontend

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        StartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPostResponseStartTailscaleWithCaddyApiTailscaleContainerStartWithCaddyPost
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
