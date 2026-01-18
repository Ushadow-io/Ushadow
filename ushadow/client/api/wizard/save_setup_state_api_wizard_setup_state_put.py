from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.save_setup_state_api_wizard_setup_state_put_response_save_setup_state_api_wizard_setup_state_put import (
    SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut,
)
from ...models.save_setup_state_api_wizard_setup_state_put_state import SaveSetupStateApiWizardSetupStatePutState
from ...types import Response


def _get_kwargs(
    *,
    body: SaveSetupStateApiWizardSetupStatePutState,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": "/api/wizard/setup-state",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut | None:
    if response.status_code == 200:
        response_200 = SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut.from_dict(
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
) -> Response[HTTPValidationError | SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: SaveSetupStateApiWizardSetupStatePutState,
) -> Response[HTTPValidationError | SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut]:
    """Save Setup State

     Save wizard state to config.overrides.yaml → wizard section.

    Args:
        body (SaveSetupStateApiWizardSetupStatePutState):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut]
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
    client: AuthenticatedClient | Client,
    body: SaveSetupStateApiWizardSetupStatePutState,
) -> HTTPValidationError | SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut | None:
    """Save Setup State

     Save wizard state to config.overrides.yaml → wizard section.

    Args:
        body (SaveSetupStateApiWizardSetupStatePutState):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: SaveSetupStateApiWizardSetupStatePutState,
) -> Response[HTTPValidationError | SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut]:
    """Save Setup State

     Save wizard state to config.overrides.yaml → wizard section.

    Args:
        body (SaveSetupStateApiWizardSetupStatePutState):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: SaveSetupStateApiWizardSetupStatePutState,
) -> HTTPValidationError | SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut | None:
    """Save Setup State

     Save wizard state to config.overrides.yaml → wizard section.

    Args:
        body (SaveSetupStateApiWizardSetupStatePutState):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | SaveSetupStateApiWizardSetupStatePutResponseSaveSetupStateApiWizardSetupStatePut
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
