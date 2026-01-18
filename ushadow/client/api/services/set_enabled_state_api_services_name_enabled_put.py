from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.enabled_request import EnabledRequest
from ...models.http_validation_error import HTTPValidationError
from ...models.set_enabled_state_api_services_name_enabled_put_response_set_enabled_state_api_services_name_enabled_put import (
    SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut,
)
from ...types import Response


def _get_kwargs(
    name: str,
    *,
    body: EnabledRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": "/api/services/{name}/enabled".format(
            name=quote(str(name), safe=""),
        ),
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    HTTPValidationError
    | SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut
    | None
):
    if response.status_code == 200:
        response_200 = (
            SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut.from_dict(
                response.json()
            )
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
) -> Response[
    HTTPValidationError | SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut
]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    name: str,
    *,
    client: AuthenticatedClient | Client,
    body: EnabledRequest,
) -> Response[
    HTTPValidationError | SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut
]:
    """Set Enabled State

     Enable or disable a service.

    Args:
        name (str):
        body (EnabledRequest): Request to enable/disable a service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut]
    """

    kwargs = _get_kwargs(
        name=name,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    name: str,
    *,
    client: AuthenticatedClient | Client,
    body: EnabledRequest,
) -> (
    HTTPValidationError
    | SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut
    | None
):
    """Set Enabled State

     Enable or disable a service.

    Args:
        name (str):
        body (EnabledRequest): Request to enable/disable a service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut
    """

    return sync_detailed(
        name=name,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    name: str,
    *,
    client: AuthenticatedClient | Client,
    body: EnabledRequest,
) -> Response[
    HTTPValidationError | SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut
]:
    """Set Enabled State

     Enable or disable a service.

    Args:
        name (str):
        body (EnabledRequest): Request to enable/disable a service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut]
    """

    kwargs = _get_kwargs(
        name=name,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    name: str,
    *,
    client: AuthenticatedClient | Client,
    body: EnabledRequest,
) -> (
    HTTPValidationError
    | SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut
    | None
):
    """Set Enabled State

     Enable or disable a service.

    Args:
        name (str):
        body (EnabledRequest): Request to enable/disable a service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | SetEnabledStateApiServicesNameEnabledPutResponseSetEnabledStateApiServicesNameEnabledPut
    """

    return (
        await asyncio_detailed(
            name=name,
            client=client,
            body=body,
        )
    ).parsed
