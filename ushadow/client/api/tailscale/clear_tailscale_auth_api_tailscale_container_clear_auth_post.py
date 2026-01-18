from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.clear_tailscale_auth_api_tailscale_container_clear_auth_post_response_clear_tailscale_auth_api_tailscale_container_clear_auth_post import (
    ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost,
)
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/tailscale/container/clear-auth",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost
    | None
):
    if response.status_code == 200:
        response_200 = ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost.from_dict(
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
    ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost
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
    ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost
]:
    """Clear Tailscale Auth

     Clear local Tailscale authentication state.

    This does a complete local cleanup:
    1. Logs out from Tailscale locally
    2. Stops and removes the container
    3. Deletes the state volume (clears all cached auth)

    Note: The machine will still appear in your Tailscale admin panel
    until you manually delete it at https://login.tailscale.com/admin/machines

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost]
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
    ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost
    | None
):
    """Clear Tailscale Auth

     Clear local Tailscale authentication state.

    This does a complete local cleanup:
    1. Logs out from Tailscale locally
    2. Stops and removes the container
    3. Deletes the state volume (clears all cached auth)

    Note: The machine will still appear in your Tailscale admin panel
    until you manually delete it at https://login.tailscale.com/admin/machines

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[
    ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost
]:
    """Clear Tailscale Auth

     Clear local Tailscale authentication state.

    This does a complete local cleanup:
    1. Logs out from Tailscale locally
    2. Stops and removes the container
    3. Deletes the state volume (clears all cached auth)

    Note: The machine will still appear in your Tailscale admin panel
    until you manually delete it at https://login.tailscale.com/admin/machines

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
) -> (
    ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost
    | None
):
    """Clear Tailscale Auth

     Clear local Tailscale authentication state.

    This does a complete local cleanup:
    1. Logs out from Tailscale locally
    2. Stops and removes the container
    3. Deletes the state volume (clears all cached auth)

    Note: The machine will still appear in your Tailscale admin panel
    until you manually delete it at https://login.tailscale.com/admin/machines

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ClearTailscaleAuthApiTailscaleContainerClearAuthPostResponseClearTailscaleAuthApiTailscaleContainerClearAuthPost
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
