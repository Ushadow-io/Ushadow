from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.complete_setup_api_tailscale_complete_post_response_complete_setup_api_tailscale_complete_post import (
    CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost,
)
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/tailscale/complete",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost | None:
    if response.status_code == 200:
        response_200 = CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost.from_dict(
            response.json()
        )

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost]:
    """Complete Setup

     Mark Tailscale setup as complete

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
) -> CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost | None:
    """Complete Setup

     Mark Tailscale setup as complete

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost]:
    """Complete Setup

     Mark Tailscale setup as complete

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
) -> CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost | None:
    """Complete Setup

     Mark Tailscale setup as complete

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        CompleteSetupApiTailscaleCompletePostResponseCompleteSetupApiTailscaleCompletePost
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
