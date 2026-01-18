from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.get_provider_api_providers_provider_id_get_response_get_provider_api_providers_provider_id_get import (
    GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    provider_id: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/providers/{provider_id}".format(
            provider_id=quote(str(provider_id), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet.from_dict(
            response.json()
        )

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
) -> Response[GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    provider_id: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet | HTTPValidationError]:
    """Get Provider

     Get full provider details.

    Args:
        provider_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        provider_id=provider_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    provider_id: str,
    *,
    client: AuthenticatedClient | Client,
) -> GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet | HTTPValidationError | None:
    """Get Provider

     Get full provider details.

    Args:
        provider_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet | HTTPValidationError
    """

    return sync_detailed(
        provider_id=provider_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    provider_id: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet | HTTPValidationError]:
    """Get Provider

     Get full provider details.

    Args:
        provider_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        provider_id=provider_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    provider_id: str,
    *,
    client: AuthenticatedClient | Client,
) -> GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet | HTTPValidationError | None:
    """Get Provider

     Get full provider details.

    Args:
        provider_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetProviderApiProvidersProviderIdGetResponseGetProviderApiProvidersProviderIdGet | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            provider_id=provider_id,
            client=client,
        )
    ).parsed
