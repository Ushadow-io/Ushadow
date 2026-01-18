from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.get_all_statuses_api_services_status_get_response_get_all_statuses_api_services_status_get import (
    GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet,
)
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/services/status",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet | None:
    if response.status_code == 200:
        response_200 = GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet.from_dict(
            response.json()
        )

        return response_200

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet]:
    """Get All Statuses

     Get lightweight status for all services.

    Returns only name, status, and health - optimized for polling.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
) -> GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet | None:
    """Get All Statuses

     Get lightweight status for all services.

    Returns only name, status, and health - optimized for polling.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
) -> Response[GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet]:
    """Get All Statuses

     Get lightweight status for all services.

    Returns only name, status, and health - optimized for polling.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
) -> GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet | None:
    """Get All Statuses

     Get lightweight status for all services.

    Returns only name, status, and health - optimized for polling.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetAllStatusesApiServicesStatusGetResponseGetAllStatusesApiServicesStatusGet
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
