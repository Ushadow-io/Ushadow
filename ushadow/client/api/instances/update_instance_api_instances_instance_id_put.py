from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.instance import Instance
from ...models.instance_update import InstanceUpdate
from ...types import Response


def _get_kwargs(
    instance_id: str,
    *,
    body: InstanceUpdate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": "/api/instances/{instance_id}".format(
            instance_id=quote(str(instance_id), safe=""),
        ),
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | Instance | None:
    if response.status_code == 200:
        response_200 = Instance.from_dict(response.json())

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
) -> Response[HTTPValidationError | Instance]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    instance_id: str,
    *,
    client: AuthenticatedClient,
    body: InstanceUpdate,
) -> Response[HTTPValidationError | Instance]:
    """Update Instance

     Update an instance.

    Config values that match template defaults are filtered out,
    so only actual overrides are stored.

    Args:
        instance_id (str):
        body (InstanceUpdate): Request to update an instance.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | Instance]
    """

    kwargs = _get_kwargs(
        instance_id=instance_id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    instance_id: str,
    *,
    client: AuthenticatedClient,
    body: InstanceUpdate,
) -> HTTPValidationError | Instance | None:
    """Update Instance

     Update an instance.

    Config values that match template defaults are filtered out,
    so only actual overrides are stored.

    Args:
        instance_id (str):
        body (InstanceUpdate): Request to update an instance.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | Instance
    """

    return sync_detailed(
        instance_id=instance_id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    instance_id: str,
    *,
    client: AuthenticatedClient,
    body: InstanceUpdate,
) -> Response[HTTPValidationError | Instance]:
    """Update Instance

     Update an instance.

    Config values that match template defaults are filtered out,
    so only actual overrides are stored.

    Args:
        instance_id (str):
        body (InstanceUpdate): Request to update an instance.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | Instance]
    """

    kwargs = _get_kwargs(
        instance_id=instance_id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    instance_id: str,
    *,
    client: AuthenticatedClient,
    body: InstanceUpdate,
) -> HTTPValidationError | Instance | None:
    """Update Instance

     Update an instance.

    Config values that match template defaults are filtered out,
    so only actual overrides are stored.

    Args:
        instance_id (str):
        body (InstanceUpdate): Request to update an instance.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | Instance
    """

    return (
        await asyncio_detailed(
            instance_id=instance_id,
            client=client,
            body=body,
        )
    ).parsed
