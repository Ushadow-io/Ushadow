from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.refresh_config_api_settings_refresh_post_response_refresh_config_api_settings_refresh_post import (
    RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost,
)
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/settings/refresh",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost | None:
    if response.status_code == 200:
        response_200 = RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost.from_dict(
            response.json()
        )

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
) -> Response[RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost]:
    """Refresh Config

     Refresh all cached configuration.

    Reloads:
    - OmegaConf settings cache
    - Compose service registry (compose files)
    - Provider registry (capabilities and providers)

    Use after editing YAML config files to pick up changes without restart.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
) -> RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost | None:
    """Refresh Config

     Refresh all cached configuration.

    Reloads:
    - OmegaConf settings cache
    - Compose service registry (compose files)
    - Provider registry (capabilities and providers)

    Use after editing YAML config files to pick up changes without restart.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
) -> Response[RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost]:
    """Refresh Config

     Refresh all cached configuration.

    Reloads:
    - OmegaConf settings cache
    - Compose service registry (compose files)
    - Provider registry (capabilities and providers)

    Use after editing YAML config files to pick up changes without restart.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
) -> RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost | None:
    """Refresh Config

     Refresh all cached configuration.

    Reloads:
    - OmegaConf settings cache
    - Compose service registry (compose files)
    - Provider registry (capabilities and providers)

    Use after editing YAML config files to pick up changes without restart.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        RefreshConfigApiSettingsRefreshPostResponseRefreshConfigApiSettingsRefreshPost
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
