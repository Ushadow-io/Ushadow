from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.get_service_api_services_name_get_response_get_service_api_services_name_get import (
    GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(
    name: str,
    *,
    include_env: bool | Unset = False,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["include_env"] = include_env

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/services/{name}".format(
            name=quote(str(name), safe=""),
        ),
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet.from_dict(response.json())

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
) -> Response[GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet | HTTPValidationError]:
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
    include_env: bool | Unset = False,
) -> Response[GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet | HTTPValidationError]:
    """Get Service

     Get details for a specific service.

    Args:
        name: Service name (e.g., 'chronicle')
        include_env: Include environment variable definitions

    Args:
        name (str):
        include_env (bool | Unset):  Default: False.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
        include_env=include_env,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    name: str,
    *,
    client: AuthenticatedClient | Client,
    include_env: bool | Unset = False,
) -> GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet | HTTPValidationError | None:
    """Get Service

     Get details for a specific service.

    Args:
        name: Service name (e.g., 'chronicle')
        include_env: Include environment variable definitions

    Args:
        name (str):
        include_env (bool | Unset):  Default: False.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet | HTTPValidationError
    """

    return sync_detailed(
        name=name,
        client=client,
        include_env=include_env,
    ).parsed


async def asyncio_detailed(
    name: str,
    *,
    client: AuthenticatedClient | Client,
    include_env: bool | Unset = False,
) -> Response[GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet | HTTPValidationError]:
    """Get Service

     Get details for a specific service.

    Args:
        name: Service name (e.g., 'chronicle')
        include_env: Include environment variable definitions

    Args:
        name (str):
        include_env (bool | Unset):  Default: False.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
        include_env=include_env,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    name: str,
    *,
    client: AuthenticatedClient | Client,
    include_env: bool | Unset = False,
) -> GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet | HTTPValidationError | None:
    """Get Service

     Get details for a specific service.

    Args:
        name: Service name (e.g., 'chronicle')
        include_env: Include environment variable definitions

    Args:
        name (str):
        include_env (bool | Unset):  Default: False.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetServiceApiServicesNameGetResponseGetServiceApiServicesNameGet | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            name=name,
            client=client,
            include_env=include_env,
        )
    ).parsed
