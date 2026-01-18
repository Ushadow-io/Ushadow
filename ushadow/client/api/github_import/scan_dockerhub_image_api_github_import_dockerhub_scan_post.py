from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.docker_hub_import_request import DockerHubImportRequest
from ...models.docker_hub_scan_response import DockerHubScanResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    *,
    body: DockerHubImportRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/github-import/dockerhub/scan",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> DockerHubScanResponse | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = DockerHubScanResponse.from_dict(response.json())

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
) -> Response[DockerHubScanResponse | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: DockerHubImportRequest,
) -> Response[DockerHubScanResponse | HTTPValidationError]:
    """Scan Dockerhub Image

     Scan a Docker Hub image for information.

    Accepts a Docker Hub URL or image reference and returns
    image details and available tags.

    Args:
        body (DockerHubImportRequest): Request to import from Docker Hub.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DockerHubScanResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    body: DockerHubImportRequest,
) -> DockerHubScanResponse | HTTPValidationError | None:
    """Scan Dockerhub Image

     Scan a Docker Hub image for information.

    Accepts a Docker Hub URL or image reference and returns
    image details and available tags.

    Args:
        body (DockerHubImportRequest): Request to import from Docker Hub.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DockerHubScanResponse | HTTPValidationError
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: DockerHubImportRequest,
) -> Response[DockerHubScanResponse | HTTPValidationError]:
    """Scan Dockerhub Image

     Scan a Docker Hub image for information.

    Accepts a Docker Hub URL or image reference and returns
    image details and available tags.

    Args:
        body (DockerHubImportRequest): Request to import from Docker Hub.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DockerHubScanResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: DockerHubImportRequest,
) -> DockerHubScanResponse | HTTPValidationError | None:
    """Scan Dockerhub Image

     Scan a Docker Hub image for information.

    Accepts a Docker Hub URL or image reference and returns
    image details and available tags.

    Args:
        body (DockerHubImportRequest): Request to import from Docker Hub.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DockerHubScanResponse | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
