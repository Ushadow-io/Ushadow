from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.env_config_update_request import EnvConfigUpdateRequest
from ...models.http_validation_error import HTTPValidationError
from ...models.update_env_config_api_services_name_env_put_response_update_env_config_api_services_name_env_put import (
    UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut,
)
from ...types import Response


def _get_kwargs(
    name: str,
    *,
    body: EnvConfigUpdateRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": "/api/services/{name}/env".format(
            name=quote(str(name), safe=""),
        ),
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut | None:
    if response.status_code == 200:
        response_200 = UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut.from_dict(
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
) -> Response[HTTPValidationError | UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut]:
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
    body: EnvConfigUpdateRequest,
) -> Response[HTTPValidationError | UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut]:
    r"""Update Env Config

     Save environment variable configuration for a service.

    Source types:
    - \"setting\": Use value from an existing settings path
    - \"new_setting\": Create a new setting and map to it
    - \"literal\": Use a directly entered value
    - \"default\": Use the compose file's default

    Args:
        name (str):
        body (EnvConfigUpdateRequest): Request to update all env var configs for a service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut]
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
    body: EnvConfigUpdateRequest,
) -> HTTPValidationError | UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut | None:
    r"""Update Env Config

     Save environment variable configuration for a service.

    Source types:
    - \"setting\": Use value from an existing settings path
    - \"new_setting\": Create a new setting and map to it
    - \"literal\": Use a directly entered value
    - \"default\": Use the compose file's default

    Args:
        name (str):
        body (EnvConfigUpdateRequest): Request to update all env var configs for a service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut
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
    body: EnvConfigUpdateRequest,
) -> Response[HTTPValidationError | UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut]:
    r"""Update Env Config

     Save environment variable configuration for a service.

    Source types:
    - \"setting\": Use value from an existing settings path
    - \"new_setting\": Create a new setting and map to it
    - \"literal\": Use a directly entered value
    - \"default\": Use the compose file's default

    Args:
        name (str):
        body (EnvConfigUpdateRequest): Request to update all env var configs for a service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut]
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
    body: EnvConfigUpdateRequest,
) -> HTTPValidationError | UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut | None:
    r"""Update Env Config

     Save environment variable configuration for a service.

    Source types:
    - \"setting\": Use value from an existing settings path
    - \"new_setting\": Create a new setting and map to it
    - \"literal\": Use a directly entered value
    - \"default\": Use the compose file's default

    Args:
        name (str):
        body (EnvConfigUpdateRequest): Request to update all env var configs for a service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UpdateEnvConfigApiServicesNameEnvPutResponseUpdateEnvConfigApiServicesNameEnvPut
    """

    return (
        await asyncio_detailed(
            name=name,
            client=client,
            body=body,
        )
    ).parsed
