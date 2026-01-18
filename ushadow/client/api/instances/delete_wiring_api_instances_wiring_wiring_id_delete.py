from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.delete_wiring_api_instances_wiring_wiring_id_delete_response_delete_wiring_api_instances_wiring_wiring_id_delete import (
    DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    wiring_id: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "delete",
        "url": "/api/instances/wiring/{wiring_id}".format(
            wiring_id=quote(str(wiring_id), safe=""),
        ),
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete
    | HTTPValidationError
    | None
):
    if response.status_code == 200:
        response_200 = (
            DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete.from_dict(
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
    DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete
    | HTTPValidationError
]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    wiring_id: str,
    *,
    client: AuthenticatedClient,
) -> Response[
    DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete
    | HTTPValidationError
]:
    """Delete Wiring

     Delete a wiring connection.

    Args:
        wiring_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        wiring_id=wiring_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    wiring_id: str,
    *,
    client: AuthenticatedClient,
) -> (
    DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete
    | HTTPValidationError
    | None
):
    """Delete Wiring

     Delete a wiring connection.

    Args:
        wiring_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete | HTTPValidationError
    """

    return sync_detailed(
        wiring_id=wiring_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    wiring_id: str,
    *,
    client: AuthenticatedClient,
) -> Response[
    DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete
    | HTTPValidationError
]:
    """Delete Wiring

     Delete a wiring connection.

    Args:
        wiring_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        wiring_id=wiring_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    wiring_id: str,
    *,
    client: AuthenticatedClient,
) -> (
    DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete
    | HTTPValidationError
    | None
):
    """Delete Wiring

     Delete a wiring connection.

    Args:
        wiring_id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeleteWiringApiInstancesWiringWiringIdDeleteResponseDeleteWiringApiInstancesWiringWiringIdDelete | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            wiring_id=wiring_id,
            client=client,
        )
    ).parsed
