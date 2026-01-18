from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.delete_instance_api_instances_instance_id_delete_response_delete_instance_api_instances_instance_id_delete import (
    DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    instance_id: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "delete",
        "url": "/api/instances/{instance_id}".format(
            instance_id=quote(str(instance_id), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete
    | HTTPValidationError
    | None
):
    if response.status_code == 200:
        response_200 = (
            DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete.from_dict(
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
    DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete | HTTPValidationError
]:
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
) -> Response[
    DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete | HTTPValidationError
]:
    """Delete Instance

     Delete an instance.

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        instance_id=instance_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    instance_id: str,
    *,
    client: AuthenticatedClient,
) -> (
    DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete
    | HTTPValidationError
    | None
):
    """Delete Instance

     Delete an instance.

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete | HTTPValidationError
    """

    return sync_detailed(
        instance_id=instance_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    instance_id: str,
    *,
    client: AuthenticatedClient,
) -> Response[
    DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete | HTTPValidationError
]:
    """Delete Instance

     Delete an instance.

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        instance_id=instance_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    instance_id: str,
    *,
    client: AuthenticatedClient,
) -> (
    DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete
    | HTTPValidationError
    | None
):
    """Delete Instance

     Delete an instance.

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeleteInstanceApiInstancesInstanceIdDeleteResponseDeleteInstanceApiInstancesInstanceIdDelete | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            instance_id=instance_id,
            client=client,
        )
    ).parsed
