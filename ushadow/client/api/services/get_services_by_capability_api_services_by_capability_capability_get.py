from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.get_services_by_capability_api_services_by_capability_capability_get_response_200_item import (
    GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    capability: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/services/by-capability/{capability}".format(
            capability=quote(str(capability), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | list[GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item] | None:
    if response.status_code == 200:
        response_200 = []
        _response_200 = response.json()
        for response_200_item_data in _response_200:
            response_200_item = GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item.from_dict(
                response_200_item_data
            )

            response_200.append(response_200_item)

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
) -> Response[HTTPValidationError | list[GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    capability: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | list[GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item]]:
    """Get Services By Capability

     Get all services that require a specific capability.

    Args:
        capability: Capability name (e.g., 'llm', 'transcription')

    Args:
        capability (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | list[GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item]]
    """

    kwargs = _get_kwargs(
        capability=capability,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    capability: str,
    *,
    client: AuthenticatedClient | Client,
) -> HTTPValidationError | list[GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item] | None:
    """Get Services By Capability

     Get all services that require a specific capability.

    Args:
        capability: Capability name (e.g., 'llm', 'transcription')

    Args:
        capability (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | list[GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item]
    """

    return sync_detailed(
        capability=capability,
        client=client,
    ).parsed


async def asyncio_detailed(
    capability: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | list[GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item]]:
    """Get Services By Capability

     Get all services that require a specific capability.

    Args:
        capability: Capability name (e.g., 'llm', 'transcription')

    Args:
        capability (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | list[GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item]]
    """

    kwargs = _get_kwargs(
        capability=capability,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    capability: str,
    *,
    client: AuthenticatedClient | Client,
) -> HTTPValidationError | list[GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item] | None:
    """Get Services By Capability

     Get all services that require a specific capability.

    Args:
        capability: Capability name (e.g., 'llm', 'transcription')

    Args:
        capability (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | list[GetServicesByCapabilityApiServicesByCapabilityCapabilityGetResponse200Item]
    """

    return (
        await asyncio_detailed(
            capability=capability,
            client=client,
        )
    ).parsed
