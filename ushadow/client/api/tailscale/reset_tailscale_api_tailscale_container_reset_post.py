from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.reset_tailscale_api_tailscale_container_reset_post_response_reset_tailscale_api_tailscale_container_reset_post import (
    ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost,
)
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/tailscale/container/reset",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost | None:
    if response.status_code == 200:
        response_200 = (
            ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost.from_dict(
                response.json()
            )
        )

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost]:
    """Reset Tailscale

     Complete Tailscale reset - returns everything to defaults.

    This performs a comprehensive cleanup:
    1. Clears all Tailscale Serve routes
    2. Removes certificates
    3. Logs out from Tailscale
    4. Stops and removes the container
    5. Deletes the state volume
    6. Removes Tailscale configuration files

    Note: The machine will still appear in your Tailscale admin panel
    until you manually delete it at https://login.tailscale.com/admin/machines

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
) -> ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost | None:
    """Reset Tailscale

     Complete Tailscale reset - returns everything to defaults.

    This performs a comprehensive cleanup:
    1. Clears all Tailscale Serve routes
    2. Removes certificates
    3. Logs out from Tailscale
    4. Stops and removes the container
    5. Deletes the state volume
    6. Removes Tailscale configuration files

    Note: The machine will still appear in your Tailscale admin panel
    until you manually delete it at https://login.tailscale.com/admin/machines

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost]:
    """Reset Tailscale

     Complete Tailscale reset - returns everything to defaults.

    This performs a comprehensive cleanup:
    1. Clears all Tailscale Serve routes
    2. Removes certificates
    3. Logs out from Tailscale
    4. Stops and removes the container
    5. Deletes the state volume
    6. Removes Tailscale configuration files

    Note: The machine will still appear in your Tailscale admin panel
    until you manually delete it at https://login.tailscale.com/admin/machines

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
) -> ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost | None:
    """Reset Tailscale

     Complete Tailscale reset - returns everything to defaults.

    This performs a comprehensive cleanup:
    1. Clears all Tailscale Serve routes
    2. Removes certificates
    3. Logs out from Tailscale
    4. Stops and removes the container
    5. Deletes the state volume
    6. Removes Tailscale configuration files

    Note: The machine will still appear in your Tailscale admin panel
    until you manually delete it at https://login.tailscale.com/admin/machines

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ResetTailscaleApiTailscaleContainerResetPostResponseResetTailscaleApiTailscaleContainerResetPost
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
