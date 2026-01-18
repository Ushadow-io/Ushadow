from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.start_caddy_container_api_tailscale_container_start_caddy_post_response_start_caddy_container_api_tailscale_container_start_caddy_post import (
    StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost,
)
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/tailscale/container/start-caddy",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost
    | None
):
    if response.status_code == 200:
        response_200 = StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost.from_dict(
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
    StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost
]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
) -> Response[
    StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost
]:
    """Start Caddy Container

     Start or create Caddy reverse proxy container.

    Creates the Caddy container for path-based routing to services.
    Must be called before configuring Tailscale Serve routes.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
) -> (
    StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost
    | None
):
    """Start Caddy Container

     Start or create Caddy reverse proxy container.

    Creates the Caddy container for path-based routing to services.
    Must be called before configuring Tailscale Serve routes.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
) -> Response[
    StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost
]:
    """Start Caddy Container

     Start or create Caddy reverse proxy container.

    Creates the Caddy container for path-based routing to services.
    Must be called before configuring Tailscale Serve routes.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
) -> (
    StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost
    | None
):
    """Start Caddy Container

     Start or create Caddy reverse proxy container.

    Creates the Caddy container for path-based routing to services.
    Must be called before configuring Tailscale Serve routes.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        StartCaddyContainerApiTailscaleContainerStartCaddyPostResponseStartCaddyContainerApiTailscaleContainerStartCaddyPost
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
