from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.get_tailnet_settings_api_tailscale_container_tailnet_settings_get_response_get_tailnet_settings_api_tailscale_container_tailnet_settings_get import (
    GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet,
)
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/tailscale/container/tailnet-settings",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet
    | None
):
    if response.status_code == 200:
        response_200 = GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet.from_dict(
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
    GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet
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
    GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet
]:
    """Get Tailnet Settings

     Check Tailscale tailnet settings like MagicDNS and HTTPS.

    Returns information about which features are enabled and links to enable them.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet]
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
    GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet
    | None
):
    """Get Tailnet Settings

     Check Tailscale tailnet settings like MagicDNS and HTTPS.

    Returns information about which features are enabled and links to enable them.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[
    GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet
]:
    """Get Tailnet Settings

     Check Tailscale tailnet settings like MagicDNS and HTTPS.

    Returns information about which features are enabled and links to enable them.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
) -> (
    GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet
    | None
):
    """Get Tailnet Settings

     Check Tailscale tailnet settings like MagicDNS and HTTPS.

    Returns information about which features are enabled and links to enable them.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetTailnetSettingsApiTailscaleContainerTailnetSettingsGetResponseGetTailnetSettingsApiTailscaleContainerTailnetSettingsGet
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
