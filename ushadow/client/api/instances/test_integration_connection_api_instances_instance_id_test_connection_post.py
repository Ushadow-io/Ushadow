from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.test_integration_connection_api_instances_instance_id_test_connection_post_response_test_integration_connection_api_instances_instance_id_test_connection_post import (
    TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost,
)
from ...types import Response


def _get_kwargs(
    instance_id: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/instances/{instance_id}/test-connection".format(
            instance_id=quote(str(instance_id), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    HTTPValidationError
    | TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost
    | None
):
    if response.status_code == 200:
        response_200 = TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost.from_dict(
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
    | TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost
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
    | TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost
]:
    """Test Integration Connection

     Test connection to an integration.

    Only works for integration instances (instances with integration_type set).

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost]
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
    | TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost
    | None
):
    """Test Integration Connection

     Test connection to an integration.

    Only works for integration instances (instances with integration_type set).

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost
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
    | TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost
]:
    """Test Integration Connection

     Test connection to an integration.

    Only works for integration instances (instances with integration_type set).

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost]
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
    | TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost
    | None
):
    """Test Integration Connection

     Test connection to an integration.

    Only works for integration instances (instances with integration_type set).

    Args:
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | TestIntegrationConnectionApiInstancesInstanceIdTestConnectionPostResponseTestIntegrationConnectionApiInstancesInstanceIdTestConnectionPost
    """

    return (
        await asyncio_detailed(
            instance_id=instance_id,
            client=client,
        )
    ).parsed
