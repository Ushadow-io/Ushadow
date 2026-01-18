from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.action_response import ActionResponse
from ...models.http_validation_error import HTTPValidationError
from ...models.port_override_request import PortOverrideRequest
from ...types import Response


def _get_kwargs(
    name: str,
    *,
    body: PortOverrideRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/services/{name}/port-override".format(
            name=quote(str(name), safe=""),
        ),
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ActionResponse | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = ActionResponse.from_dict(response.json())

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
) -> Response[ActionResponse | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    name: str,
    *,
    client: AuthenticatedClient,
    body: PortOverrideRequest,
) -> Response[ActionResponse | HTTPValidationError]:
    """Set Port Override

     Set a port override for a service.

    This saves the port to service_preferences and sets the environment variable
    so that subsequent service starts will use the new port.

    Args:
        name (str):
        body (PortOverrideRequest): Request to override a service's port.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ActionResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    name: str,
    *,
    client: AuthenticatedClient,
    body: PortOverrideRequest,
) -> ActionResponse | HTTPValidationError | None:
    """Set Port Override

     Set a port override for a service.

    This saves the port to service_preferences and sets the environment variable
    so that subsequent service starts will use the new port.

    Args:
        name (str):
        body (PortOverrideRequest): Request to override a service's port.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ActionResponse | HTTPValidationError
    """

    return sync_detailed(
        name=name,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    name: str,
    *,
    client: AuthenticatedClient,
    body: PortOverrideRequest,
) -> Response[ActionResponse | HTTPValidationError]:
    """Set Port Override

     Set a port override for a service.

    This saves the port to service_preferences and sets the environment variable
    so that subsequent service starts will use the new port.

    Args:
        name (str):
        body (PortOverrideRequest): Request to override a service's port.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ActionResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        name=name,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    name: str,
    *,
    client: AuthenticatedClient,
    body: PortOverrideRequest,
) -> ActionResponse | HTTPValidationError | None:
    """Set Port Override

     Set a port override for a service.

    This saves the port to service_preferences and sets the environment variable
    so that subsequent service starts will use the new port.

    Args:
        name (str):
        body (PortOverrideRequest): Request to override a service's port.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ActionResponse | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            name=name,
            client=client,
            body=body,
        )
    ).parsed
