from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.deployment import Deployment
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    service_id: None | str | Unset = UNSET,
    unode_hostname: None | str | Unset = UNSET,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    json_service_id: None | str | Unset
    if isinstance(service_id, Unset):
        json_service_id = UNSET
    else:
        json_service_id = service_id
    params["service_id"] = json_service_id

    json_unode_hostname: None | str | Unset
    if isinstance(unode_hostname, Unset):
        json_unode_hostname = UNSET
    else:
        json_unode_hostname = unode_hostname
    params["unode_hostname"] = json_unode_hostname

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/deployments",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | list[Deployment] | None:
    if response.status_code == 200:
        response_200 = []
        _response_200 = response.json()
        for response_200_item_data in _response_200:
            response_200_item = Deployment.from_dict(response_200_item_data)

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
) -> Response[HTTPValidationError | list[Deployment]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    service_id: None | str | Unset = UNSET,
    unode_hostname: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | list[Deployment]]:
    """List Deployments

     List all deployments with optional filters.

    Args:
        service_id (None | str | Unset):
        unode_hostname (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | list[Deployment]]
    """

    kwargs = _get_kwargs(
        service_id=service_id,
        unode_hostname=unode_hostname,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    service_id: None | str | Unset = UNSET,
    unode_hostname: None | str | Unset = UNSET,
) -> HTTPValidationError | list[Deployment] | None:
    """List Deployments

     List all deployments with optional filters.

    Args:
        service_id (None | str | Unset):
        unode_hostname (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | list[Deployment]
    """

    return sync_detailed(
        client=client,
        service_id=service_id,
        unode_hostname=unode_hostname,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    service_id: None | str | Unset = UNSET,
    unode_hostname: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | list[Deployment]]:
    """List Deployments

     List all deployments with optional filters.

    Args:
        service_id (None | str | Unset):
        unode_hostname (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | list[Deployment]]
    """

    kwargs = _get_kwargs(
        service_id=service_id,
        unode_hostname=unode_hostname,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    service_id: None | str | Unset = UNSET,
    unode_hostname: None | str | Unset = UNSET,
) -> HTTPValidationError | list[Deployment] | None:
    """List Deployments

     List all deployments with optional filters.

    Args:
        service_id (None | str | Unset):
        unode_hostname (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | list[Deployment]
    """

    return (
        await asyncio_detailed(
            client=client,
            service_id=service_id,
            unode_hostname=unode_hostname,
        )
    ).parsed
