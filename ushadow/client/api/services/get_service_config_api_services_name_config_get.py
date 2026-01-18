from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.get_service_config_api_services_name_config_get_response_get_service_config_api_services_name_config_get import (
    GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    name: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/services/{name}/config".format(
            name=quote(str(name), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet
    | HTTPValidationError
    | None
):
    if response.status_code == 200:
        response_200 = (
            GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet.from_dict(
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
    GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet | HTTPValidationError
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
) -> Response[
    GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet | HTTPValidationError
]:
    """Get Service Config

     Get full service configuration.

    Returns enabled state, env config, and preferences.

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    name: str,
    *,
    client: AuthenticatedClient | Client,
) -> (
    GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet
    | HTTPValidationError
    | None
):
    """Get Service Config

     Get full service configuration.

    Returns enabled state, env config, and preferences.

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet | HTTPValidationError
    """

    return sync_detailed(
        name=name,
        client=client,
    ).parsed


async def asyncio_detailed(
    name: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[
    GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet | HTTPValidationError
]:
    """Get Service Config

     Get full service configuration.

    Returns enabled state, env config, and preferences.

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    name: str,
    *,
    client: AuthenticatedClient | Client,
) -> (
    GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet
    | HTTPValidationError
    | None
):
    """Get Service Config

     Get full service configuration.

    Returns enabled state, env config, and preferences.

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetServiceConfigApiServicesNameConfigGetResponseGetServiceConfigApiServicesNameConfigGet | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            name=name,
            client=client,
        )
    ).parsed
