from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.undeploy_instance_api_instances_instance_id_undeploy_post_response_undeploy_instance_api_instances_instance_id_undeploy_post import (
    UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost,
)
from ...types import Response


def _get_kwargs(
    instance_id: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/instances/{instance_id}/undeploy".format(
            instance_id=quote(str(instance_id), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    HTTPValidationError
    | UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost
    | None
):
    if response.status_code == 200:
        response_200 = UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost.from_dict(
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
    | UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost
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
    HTTPValidationError
    | UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost
]:
    """Undeploy Instance

     Stop/undeploy an instance.

    For compose services, this stops the docker container.
    For cloud providers, this marks the instance as inactive.

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost]
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
    HTTPValidationError
    | UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost
    | None
):
    """Undeploy Instance

     Stop/undeploy an instance.

    For compose services, this stops the docker container.
    For cloud providers, this marks the instance as inactive.

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost
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
    HTTPValidationError
    | UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost
]:
    """Undeploy Instance

     Stop/undeploy an instance.

    For compose services, this stops the docker container.
    For cloud providers, this marks the instance as inactive.

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost]
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
    HTTPValidationError
    | UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost
    | None
):
    """Undeploy Instance

     Stop/undeploy an instance.

    For compose services, this stops the docker container.
    For cloud providers, this marks the instance as inactive.

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UndeployInstanceApiInstancesInstanceIdUndeployPostResponseUndeployInstanceApiInstancesInstanceIdUndeployPost
    """

    return (
        await asyncio_detailed(
            instance_id=instance_id,
            client=client,
        )
    ).parsed
