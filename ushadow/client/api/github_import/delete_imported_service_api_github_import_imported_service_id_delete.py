from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.delete_imported_service_api_github_import_imported_service_id_delete_response_delete_imported_service_api_github_import_imported_service_id_delete import (
    DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    service_id: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "delete",
        "url": "/api/github-import/imported/{service_id}".format(
            service_id=quote(str(service_id), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete
    | HTTPValidationError
    | None
):
    if response.status_code == 200:
        response_200 = DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete.from_dict(
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
    DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete
    | HTTPValidationError
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
) -> Response[
    DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete
    | HTTPValidationError
]:
    """Delete Imported Service

     Delete an imported service.

    Args:
        service_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        service_id=service_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    service_id: str,
    *,
    client: AuthenticatedClient,
) -> (
    DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete
    | HTTPValidationError
    | None
):
    """Delete Imported Service

     Delete an imported service.

    Args:
        service_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete | HTTPValidationError
    """

    return sync_detailed(
        service_id=service_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    service_id: str,
    *,
    client: AuthenticatedClient,
) -> Response[
    DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete
    | HTTPValidationError
]:
    """Delete Imported Service

     Delete an imported service.

    Args:
        service_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        service_id=service_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    service_id: str,
    *,
    client: AuthenticatedClient,
) -> (
    DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete
    | HTTPValidationError
    | None
):
    """Delete Imported Service

     Delete an imported service.

    Args:
        service_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeleteImportedServiceApiGithubImportImportedServiceIdDeleteResponseDeleteImportedServiceApiGithubImportImportedServiceIdDelete | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            service_id=service_id,
            client=client,
        )
    ).parsed
