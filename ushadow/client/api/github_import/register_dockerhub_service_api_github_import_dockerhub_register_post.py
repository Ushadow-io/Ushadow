from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.body_register_dockerhub_service_api_github_import_dockerhub_register_post import (
    BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost,
)
from ...models.http_validation_error import HTTPValidationError
from ...models.import_service_response import ImportServiceResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    body: BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost | Unset = UNSET,
    service_name: str,
    dockerhub_url: str,
    tag: None | str | Unset = UNSET,
    display_name: None | str | Unset = UNSET,
    description: None | str | Unset = UNSET,
    shadow_header_enabled: bool | Unset = True,
    shadow_header_name: str | Unset = "X-Shadow-Service",
    shadow_header_value: None | str | Unset = UNSET,
    route_path: None | str | Unset = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    params: dict[str, Any] = {}

    params["service_name"] = service_name

    params["dockerhub_url"] = dockerhub_url

    json_tag: None | str | Unset
    if isinstance(tag, Unset):
        json_tag = UNSET
    else:
        json_tag = tag
    params["tag"] = json_tag

    json_display_name: None | str | Unset
    if isinstance(display_name, Unset):
        json_display_name = UNSET
    else:
        json_display_name = display_name
    params["display_name"] = json_display_name

    json_description: None | str | Unset
    if isinstance(description, Unset):
        json_description = UNSET
    else:
        json_description = description
    params["description"] = json_description

    params["shadow_header_enabled"] = shadow_header_enabled

    params["shadow_header_name"] = shadow_header_name

    json_shadow_header_value: None | str | Unset
    if isinstance(shadow_header_value, Unset):
        json_shadow_header_value = UNSET
    else:
        json_shadow_header_value = shadow_header_value
    params["shadow_header_value"] = json_shadow_header_value

    json_route_path: None | str | Unset
    if isinstance(route_path, Unset):
        json_route_path = UNSET
    else:
        json_route_path = route_path
    params["route_path"] = json_route_path

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/github-import/dockerhub/register",
        "params": params,
    }

    if not isinstance(body, Unset):
        _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | ImportServiceResponse | None:
    if response.status_code == 200:
        response_200 = ImportServiceResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | ImportServiceResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost | Unset = UNSET,
    service_name: str,
    dockerhub_url: str,
    tag: None | str | Unset = UNSET,
    display_name: None | str | Unset = UNSET,
    description: None | str | Unset = UNSET,
    shadow_header_enabled: bool | Unset = True,
    shadow_header_name: str | Unset = "X-Shadow-Service",
    shadow_header_value: None | str | Unset = UNSET,
    route_path: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | ImportServiceResponse]:
    """Register Dockerhub Service

     Register a service from Docker Hub by generating a compose file.

    Creates a docker-compose file for the specified Docker Hub image
    with the provided configuration.

    Args:
        service_name (str):
        dockerhub_url (str):
        tag (None | str | Unset):
        display_name (None | str | Unset):
        description (None | str | Unset):
        shadow_header_enabled (bool | Unset):  Default: True.
        shadow_header_name (str | Unset):  Default: 'X-Shadow-Service'.
        shadow_header_value (None | str | Unset):
        route_path (None | str | Unset):
        body (BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ImportServiceResponse]
    """

    kwargs = _get_kwargs(
        body=body,
        service_name=service_name,
        dockerhub_url=dockerhub_url,
        tag=tag,
        display_name=display_name,
        description=description,
        shadow_header_enabled=shadow_header_enabled,
        shadow_header_name=shadow_header_name,
        shadow_header_value=shadow_header_value,
        route_path=route_path,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    body: BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost | Unset = UNSET,
    service_name: str,
    dockerhub_url: str,
    tag: None | str | Unset = UNSET,
    display_name: None | str | Unset = UNSET,
    description: None | str | Unset = UNSET,
    shadow_header_enabled: bool | Unset = True,
    shadow_header_name: str | Unset = "X-Shadow-Service",
    shadow_header_value: None | str | Unset = UNSET,
    route_path: None | str | Unset = UNSET,
) -> HTTPValidationError | ImportServiceResponse | None:
    """Register Dockerhub Service

     Register a service from Docker Hub by generating a compose file.

    Creates a docker-compose file for the specified Docker Hub image
    with the provided configuration.

    Args:
        service_name (str):
        dockerhub_url (str):
        tag (None | str | Unset):
        display_name (None | str | Unset):
        description (None | str | Unset):
        shadow_header_enabled (bool | Unset):  Default: True.
        shadow_header_name (str | Unset):  Default: 'X-Shadow-Service'.
        shadow_header_value (None | str | Unset):
        route_path (None | str | Unset):
        body (BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ImportServiceResponse
    """

    return sync_detailed(
        client=client,
        body=body,
        service_name=service_name,
        dockerhub_url=dockerhub_url,
        tag=tag,
        display_name=display_name,
        description=description,
        shadow_header_enabled=shadow_header_enabled,
        shadow_header_name=shadow_header_name,
        shadow_header_value=shadow_header_value,
        route_path=route_path,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost | Unset = UNSET,
    service_name: str,
    dockerhub_url: str,
    tag: None | str | Unset = UNSET,
    display_name: None | str | Unset = UNSET,
    description: None | str | Unset = UNSET,
    shadow_header_enabled: bool | Unset = True,
    shadow_header_name: str | Unset = "X-Shadow-Service",
    shadow_header_value: None | str | Unset = UNSET,
    route_path: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | ImportServiceResponse]:
    """Register Dockerhub Service

     Register a service from Docker Hub by generating a compose file.

    Creates a docker-compose file for the specified Docker Hub image
    with the provided configuration.

    Args:
        service_name (str):
        dockerhub_url (str):
        tag (None | str | Unset):
        display_name (None | str | Unset):
        description (None | str | Unset):
        shadow_header_enabled (bool | Unset):  Default: True.
        shadow_header_name (str | Unset):  Default: 'X-Shadow-Service'.
        shadow_header_value (None | str | Unset):
        route_path (None | str | Unset):
        body (BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ImportServiceResponse]
    """

    kwargs = _get_kwargs(
        body=body,
        service_name=service_name,
        dockerhub_url=dockerhub_url,
        tag=tag,
        display_name=display_name,
        description=description,
        shadow_header_enabled=shadow_header_enabled,
        shadow_header_name=shadow_header_name,
        shadow_header_value=shadow_header_value,
        route_path=route_path,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost | Unset = UNSET,
    service_name: str,
    dockerhub_url: str,
    tag: None | str | Unset = UNSET,
    display_name: None | str | Unset = UNSET,
    description: None | str | Unset = UNSET,
    shadow_header_enabled: bool | Unset = True,
    shadow_header_name: str | Unset = "X-Shadow-Service",
    shadow_header_value: None | str | Unset = UNSET,
    route_path: None | str | Unset = UNSET,
) -> HTTPValidationError | ImportServiceResponse | None:
    """Register Dockerhub Service

     Register a service from Docker Hub by generating a compose file.

    Creates a docker-compose file for the specified Docker Hub image
    with the provided configuration.

    Args:
        service_name (str):
        dockerhub_url (str):
        tag (None | str | Unset):
        display_name (None | str | Unset):
        description (None | str | Unset):
        shadow_header_enabled (bool | Unset):  Default: True.
        shadow_header_name (str | Unset):  Default: 'X-Shadow-Service'.
        shadow_header_value (None | str | Unset):
        route_path (None | str | Unset):
        body (BodyRegisterDockerhubServiceApiGithubImportDockerhubRegisterPost | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ImportServiceResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
            service_name=service_name,
            dockerhub_url=dockerhub_url,
            tag=tag,
            display_name=display_name,
            description=description,
            shadow_header_enabled=shadow_header_enabled,
            shadow_header_name=shadow_header_name,
            shadow_header_value=shadow_header_value,
            route_path=route_path,
        )
    ).parsed
