from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.unified_import_request import UnifiedImportRequest
from ...models.unified_scan_response import UnifiedScanResponse
from ...types import Response


def _get_kwargs(
    *,
    body: UnifiedImportRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/github-import/unified/scan",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | UnifiedScanResponse | None:
    if response.status_code == 200:
        response_200 = UnifiedScanResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | UnifiedScanResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: UnifiedImportRequest,
) -> Response[HTTPValidationError | UnifiedScanResponse]:
    """Unified Scan

     Scan any supported source (GitHub or Docker Hub).

    Automatically detects the source type and returns appropriate information.

    Args:
        body (UnifiedImportRequest): Unified request for importing from any supported source.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UnifiedScanResponse]
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
    body: UnifiedImportRequest,
) -> HTTPValidationError | UnifiedScanResponse | None:
    """Unified Scan

     Scan any supported source (GitHub or Docker Hub).

    Automatically detects the source type and returns appropriate information.

    Args:
        body (UnifiedImportRequest): Unified request for importing from any supported source.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UnifiedScanResponse
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: UnifiedImportRequest,
) -> Response[HTTPValidationError | UnifiedScanResponse]:
    """Unified Scan

     Scan any supported source (GitHub or Docker Hub).

    Automatically detects the source type and returns appropriate information.

    Args:
        body (UnifiedImportRequest): Unified request for importing from any supported source.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UnifiedScanResponse]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: UnifiedImportRequest,
) -> HTTPValidationError | UnifiedScanResponse | None:
    """Unified Scan

     Scan any supported source (GitHub or Docker Hub).

    Automatically detects the source type and returns appropriate information.

    Args:
        body (UnifiedImportRequest): Unified request for importing from any supported source.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UnifiedScanResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
