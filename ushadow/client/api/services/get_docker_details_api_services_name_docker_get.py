from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.get_docker_details_api_services_name_docker_get_response_get_docker_details_api_services_name_docker_get import (
    GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    name: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/services/{name}/docker".format(
            name=quote(str(name), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet
    | HTTPValidationError
    | None
):
    if response.status_code == 200:
        response_200 = (
            GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet.from_dict(
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
    GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet | HTTPValidationError
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
    client: AuthenticatedClient,
) -> Response[
    GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet | HTTPValidationError
]:
    """Get Docker Details

     Get Docker container details for a service.

    Returns container_id, status, image, ports, health, endpoints, etc.

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet | HTTPValidationError]
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
    client: AuthenticatedClient,
) -> (
    GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet
    | HTTPValidationError
    | None
):
    """Get Docker Details

     Get Docker container details for a service.

    Returns container_id, status, image, ports, health, endpoints, etc.

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet | HTTPValidationError
    """

    return sync_detailed(
        name=name,
        client=client,
    ).parsed


async def asyncio_detailed(
    name: str,
    *,
    client: AuthenticatedClient,
) -> Response[
    GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet | HTTPValidationError
]:
    """Get Docker Details

     Get Docker container details for a service.

    Returns container_id, status, image, ports, health, endpoints, etc.

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    name: str,
    *,
    client: AuthenticatedClient,
) -> (
    GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet
    | HTTPValidationError
    | None
):
    """Get Docker Details

     Get Docker container details for a service.

    Returns container_id, status, image, ports, health, endpoints, etc.

    Args:
        name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GetDockerDetailsApiServicesNameDockerGetResponseGetDockerDetailsApiServicesNameDockerGet | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            name=name,
            client=client,
        )
    ).parsed
