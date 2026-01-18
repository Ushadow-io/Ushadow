from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.api_keys_step import ApiKeysStep
from ...models.api_keys_update_response import ApiKeysUpdateResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    *,
    body: ApiKeysStep,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": "/api/wizard/api-keys",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ApiKeysUpdateResponse | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = ApiKeysUpdateResponse.from_dict(response.json())

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
) -> Response[ApiKeysUpdateResponse | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: ApiKeysStep,
) -> Response[ApiKeysUpdateResponse | HTTPValidationError]:
    """Update Wizard Api Keys

     Update API keys configuration via OmegaConf.

    Only updates keys that are provided (non-None values).
    Saves to secrets.yaml for persistence.

    Args:
        body (ApiKeysStep): API Keys configuration step.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApiKeysUpdateResponse | HTTPValidationError]
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
    body: ApiKeysStep,
) -> ApiKeysUpdateResponse | HTTPValidationError | None:
    """Update Wizard Api Keys

     Update API keys configuration via OmegaConf.

    Only updates keys that are provided (non-None values).
    Saves to secrets.yaml for persistence.

    Args:
        body (ApiKeysStep): API Keys configuration step.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApiKeysUpdateResponse | HTTPValidationError
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: ApiKeysStep,
) -> Response[ApiKeysUpdateResponse | HTTPValidationError]:
    """Update Wizard Api Keys

     Update API keys configuration via OmegaConf.

    Only updates keys that are provided (non-None values).
    Saves to secrets.yaml for persistence.

    Args:
        body (ApiKeysStep): API Keys configuration step.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApiKeysUpdateResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: ApiKeysStep,
) -> ApiKeysUpdateResponse | HTTPValidationError | None:
    """Update Wizard Api Keys

     Update API keys configuration via OmegaConf.

    Only updates keys that are provided (non-None values).
    Saves to secrets.yaml for persistence.

    Args:
        body (ApiKeysStep): API Keys configuration step.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApiKeysUpdateResponse | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
