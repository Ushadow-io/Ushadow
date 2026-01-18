from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.save_quickstart_config_api_wizard_quickstart_post_key_values import (
    SaveQuickstartConfigApiWizardQuickstartPostKeyValues,
)
from ...models.save_quickstart_config_api_wizard_quickstart_post_response_save_quickstart_config_api_wizard_quickstart_post import (
    SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost,
)
from ...types import Response


def _get_kwargs(
    *,
    body: SaveQuickstartConfigApiWizardQuickstartPostKeyValues,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/wizard/quickstart",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    HTTPValidationError
    | SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost
    | None
):
    if response.status_code == 200:
        response_200 = (
            SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost.from_dict(
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
    HTTPValidationError | SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost
]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: SaveQuickstartConfigApiWizardQuickstartPostKeyValues,
) -> Response[
    HTTPValidationError | SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost
]:
    """Save Quickstart Config

     Save key values from quickstart wizard.

    Accepts a dict of settings_path -> value (e.g., api_keys.openai_api_key -> sk-xxx).
    Saves directly to the settings store.

    Args:
        body (SaveQuickstartConfigApiWizardQuickstartPostKeyValues):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost]
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
    body: SaveQuickstartConfigApiWizardQuickstartPostKeyValues,
) -> (
    HTTPValidationError
    | SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost
    | None
):
    """Save Quickstart Config

     Save key values from quickstart wizard.

    Accepts a dict of settings_path -> value (e.g., api_keys.openai_api_key -> sk-xxx).
    Saves directly to the settings store.

    Args:
        body (SaveQuickstartConfigApiWizardQuickstartPostKeyValues):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: SaveQuickstartConfigApiWizardQuickstartPostKeyValues,
) -> Response[
    HTTPValidationError | SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost
]:
    """Save Quickstart Config

     Save key values from quickstart wizard.

    Accepts a dict of settings_path -> value (e.g., api_keys.openai_api_key -> sk-xxx).
    Saves directly to the settings store.

    Args:
        body (SaveQuickstartConfigApiWizardQuickstartPostKeyValues):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: SaveQuickstartConfigApiWizardQuickstartPostKeyValues,
) -> (
    HTTPValidationError
    | SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost
    | None
):
    """Save Quickstart Config

     Save key values from quickstart wizard.

    Accepts a dict of settings_path -> value (e.g., api_keys.openai_api_key -> sk-xxx).
    Saves directly to the settings store.

    Args:
        body (SaveQuickstartConfigApiWizardQuickstartPostKeyValues):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | SaveQuickstartConfigApiWizardQuickstartPostResponseSaveQuickstartConfigApiWizardQuickstartPost
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
