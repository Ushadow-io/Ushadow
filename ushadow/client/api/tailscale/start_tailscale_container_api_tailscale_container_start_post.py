from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.start_tailscale_container_api_tailscale_container_start_post_response_start_tailscale_container_api_tailscale_container_start_post import (
    StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost,
)
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/tailscale/container/start",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost
    | None
):
    if response.status_code == 200:
        response_200 = StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost.from_dict(
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
    StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost
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
    StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost
]:
    """Start Tailscale Container

     Start or create Tailscale container using Docker SDK.

    Creates a per-environment Tailscale container using COMPOSE_PROJECT_NAME.
    The container will be named {env}-tailscale and use {env} as its hostname.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost]
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
    StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost
    | None
):
    """Start Tailscale Container

     Start or create Tailscale container using Docker SDK.

    Creates a per-environment Tailscale container using COMPOSE_PROJECT_NAME.
    The container will be named {env}-tailscale and use {env} as its hostname.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[
    StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost
]:
    """Start Tailscale Container

     Start or create Tailscale container using Docker SDK.

    Creates a per-environment Tailscale container using COMPOSE_PROJECT_NAME.
    The container will be named {env}-tailscale and use {env} as its hostname.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
) -> (
    StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost
    | None
):
    """Start Tailscale Container

     Start or create Tailscale container using Docker SDK.

    Creates a per-environment Tailscale container using COMPOSE_PROJECT_NAME.
    The container will be named {env}-tailscale and use {env} as its hostname.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        StartTailscaleContainerApiTailscaleContainerStartPostResponseStartTailscaleContainerApiTailscaleContainerStartPost
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
