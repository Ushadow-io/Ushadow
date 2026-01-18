from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.deployment import Deployment
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    deployment_id: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/deployments/{deployment_id}/restart".format(
            deployment_id=quote(str(deployment_id), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Deployment | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = Deployment.from_dict(response.json())

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
) -> Response[Deployment | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    deployment_id: str,
    *,
    client: AuthenticatedClient,
) -> Response[Deployment | HTTPValidationError]:
    """Restart Deployment

     Restart a deployment.

    Args:
        deployment_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Deployment | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        deployment_id=deployment_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    deployment_id: str,
    *,
    client: AuthenticatedClient,
) -> Deployment | HTTPValidationError | None:
    """Restart Deployment

     Restart a deployment.

    Args:
        deployment_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Deployment | HTTPValidationError
    """

    return sync_detailed(
        deployment_id=deployment_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    deployment_id: str,
    *,
    client: AuthenticatedClient,
) -> Response[Deployment | HTTPValidationError]:
    """Restart Deployment

     Restart a deployment.

    Args:
        deployment_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Deployment | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        deployment_id=deployment_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    deployment_id: str,
    *,
    client: AuthenticatedClient,
) -> Deployment | HTTPValidationError | None:
    """Restart Deployment

     Restart a deployment.

    Args:
        deployment_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Deployment | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            deployment_id=deployment_id,
            client=client,
        )
    ).parsed
