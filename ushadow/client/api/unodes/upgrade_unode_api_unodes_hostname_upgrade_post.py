from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.upgrade_request import UpgradeRequest
from ...models.upgrade_response import UpgradeResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    hostname: str,
    *,
    body: UpgradeRequest | Unset = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/unodes/{hostname}/upgrade".format(
            hostname=quote(str(hostname), safe=""),
        ),
    }

    if not isinstance(body, Unset):
        _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | UpgradeResponse | None:
    if response.status_code == 200:
        response_200 = UpgradeResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | UpgradeResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    hostname: str,
    *,
    client: AuthenticatedClient,
    body: UpgradeRequest | Unset = UNSET,
) -> Response[HTTPValidationError | UpgradeResponse]:
    """Upgrade Unode

     Upgrade a u-node's manager to a new version.

    This triggers the remote node to:
    1. Pull the new manager image
    2. Stop and remove its current container
    3. Start a new container with the new image

    The node will be briefly offline during the upgrade (~10 seconds).

    Args:
        hostname (str):
        body (UpgradeRequest | Unset): Request to upgrade a u-node's manager.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UpgradeResponse]
    """

    kwargs = _get_kwargs(
        hostname=hostname,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    hostname: str,
    *,
    client: AuthenticatedClient,
    body: UpgradeRequest | Unset = UNSET,
) -> HTTPValidationError | UpgradeResponse | None:
    """Upgrade Unode

     Upgrade a u-node's manager to a new version.

    This triggers the remote node to:
    1. Pull the new manager image
    2. Stop and remove its current container
    3. Start a new container with the new image

    The node will be briefly offline during the upgrade (~10 seconds).

    Args:
        hostname (str):
        body (UpgradeRequest | Unset): Request to upgrade a u-node's manager.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UpgradeResponse
    """

    return sync_detailed(
        hostname=hostname,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    hostname: str,
    *,
    client: AuthenticatedClient,
    body: UpgradeRequest | Unset = UNSET,
) -> Response[HTTPValidationError | UpgradeResponse]:
    """Upgrade Unode

     Upgrade a u-node's manager to a new version.

    This triggers the remote node to:
    1. Pull the new manager image
    2. Stop and remove its current container
    3. Start a new container with the new image

    The node will be briefly offline during the upgrade (~10 seconds).

    Args:
        hostname (str):
        body (UpgradeRequest | Unset): Request to upgrade a u-node's manager.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UpgradeResponse]
    """

    kwargs = _get_kwargs(
        hostname=hostname,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    hostname: str,
    *,
    client: AuthenticatedClient,
    body: UpgradeRequest | Unset = UNSET,
) -> HTTPValidationError | UpgradeResponse | None:
    """Upgrade Unode

     Upgrade a u-node's manager to a new version.

    This triggers the remote node to:
    1. Pull the new manager image
    2. Stop and remove its current container
    3. Start a new container with the new image

    The node will be briefly offline during the upgrade (~10 seconds).

    Args:
        hostname (str):
        body (UpgradeRequest | Unset): Request to upgrade a u-node's manager.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UpgradeResponse
    """

    return (
        await asyncio_detailed(
            hostname=hostname,
            client=client,
            body=body,
        )
    ).parsed
