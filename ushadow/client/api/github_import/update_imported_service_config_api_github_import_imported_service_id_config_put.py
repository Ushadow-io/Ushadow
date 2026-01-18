from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.imported_service_config import ImportedServiceConfig
from ...models.update_imported_service_config_api_github_import_imported_service_id_config_put_response_update_imported_service_config_api_github_import_imported_service_id_config_put import (
    UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut,
)
from ...types import Response


def _get_kwargs(
    service_id: str,
    *,
    body: ImportedServiceConfig,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": "/api/github-import/imported/{service_id}/config".format(
            service_id=quote(str(service_id), safe=""),
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
    | UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut
    | None
):
    if response.status_code == 200:
        response_200 = UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut.from_dict(
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
) -> Response[
    HTTPValidationError
    | UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut
]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    service_id: str,
    *,
    client: AuthenticatedClient,
    body: ImportedServiceConfig,
) -> Response[
    HTTPValidationError
    | UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut
]:
    """Update Imported Service Config

     Update configuration for an imported service.

    Args:
        service_id (str):
        body (ImportedServiceConfig): Full configuration for an imported service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut]
    """

    kwargs = _get_kwargs(
        service_id=service_id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    service_id: str,
    *,
    client: AuthenticatedClient,
    body: ImportedServiceConfig,
) -> (
    HTTPValidationError
    | UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut
    | None
):
    """Update Imported Service Config

     Update configuration for an imported service.

    Args:
        service_id (str):
        body (ImportedServiceConfig): Full configuration for an imported service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut
    """

    return sync_detailed(
        service_id=service_id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    service_id: str,
    *,
    client: AuthenticatedClient,
    body: ImportedServiceConfig,
) -> Response[
    HTTPValidationError
    | UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut
]:
    """Update Imported Service Config

     Update configuration for an imported service.

    Args:
        service_id (str):
        body (ImportedServiceConfig): Full configuration for an imported service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut]
    """

    kwargs = _get_kwargs(
        service_id=service_id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    service_id: str,
    *,
    client: AuthenticatedClient,
    body: ImportedServiceConfig,
) -> (
    HTTPValidationError
    | UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut
    | None
):
    """Update Imported Service Config

     Update configuration for an imported service.

    Args:
        service_id (str):
        body (ImportedServiceConfig): Full configuration for an imported service.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPutResponseUpdateImportedServiceConfigApiGithubImportImportedServiceIdConfigPut
    """

    return (
        await asyncio_detailed(
            service_id=service_id,
            client=client,
            body=body,
        )
    ).parsed
