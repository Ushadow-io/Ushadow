from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.set_default_api_instances_wiring_defaults_capability_put_response_set_default_api_instances_wiring_defaults_capability_put import (
    SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut,
)
from ...types import UNSET, Response


def _get_kwargs(
    capability: str,
    *,
    instance_id: str,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["instance_id"] = instance_id

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": "/api/instances/wiring/defaults/{capability}".format(
            capability=quote(str(capability), safe=""),
        ),
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    HTTPValidationError
    | SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut
    | None
):
    if response.status_code == 200:
        response_200 = SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut.from_dict(
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
    | SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut
]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    capability: str,
    *,
    client: AuthenticatedClient,
    instance_id: str,
) -> Response[
    HTTPValidationError
    | SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut
]:
    """Set Default

     Set default instance for a capability.

    Args:
        capability (str):
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut]
    """

    kwargs = _get_kwargs(
        capability=capability,
        instance_id=instance_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    capability: str,
    *,
    client: AuthenticatedClient,
    instance_id: str,
) -> (
    HTTPValidationError
    | SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut
    | None
):
    """Set Default

     Set default instance for a capability.

    Args:
        capability (str):
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut
    """

    return sync_detailed(
        capability=capability,
        client=client,
        instance_id=instance_id,
    ).parsed


async def asyncio_detailed(
    capability: str,
    *,
    client: AuthenticatedClient,
    instance_id: str,
) -> Response[
    HTTPValidationError
    | SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut
]:
    """Set Default

     Set default instance for a capability.

    Args:
        capability (str):
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut]
    """

    kwargs = _get_kwargs(
        capability=capability,
        instance_id=instance_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    capability: str,
    *,
    client: AuthenticatedClient,
    instance_id: str,
) -> (
    HTTPValidationError
    | SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut
    | None
):
    """Set Default

     Set default instance for a capability.

    Args:
        capability (str):
        instance_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | SetDefaultApiInstancesWiringDefaultsCapabilityPutResponseSetDefaultApiInstancesWiringDefaultsCapabilityPut
    """

    return (
        await asyncio_detailed(
            capability=capability,
            client=client,
            instance_id=instance_id,
        )
    ).parsed
