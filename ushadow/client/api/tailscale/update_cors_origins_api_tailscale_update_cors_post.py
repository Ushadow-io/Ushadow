from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.update_cors_origins_api_tailscale_update_cors_post_response_update_cors_origins_api_tailscale_update_cors_post import (
    UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost,
)
from ...models.update_cors_request import UpdateCorsRequest
from ...types import Response


def _get_kwargs(
    *,
    body: UpdateCorsRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/tailscale/update-cors",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    HTTPValidationError
    | UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost
    | None
):
    if response.status_code == 200:
        response_200 = (
            UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost.from_dict(
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
    HTTPValidationError | UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost
]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: UpdateCorsRequest,
) -> Response[
    HTTPValidationError | UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost
]:
    """Update Cors Origins

     Add Tailscale hostname to CORS allowed origins.

    This endpoint appends the Tailscale HTTPS origin to the security.cors_origins
    setting so the frontend can make requests from the Tailscale URL.

    Note: The CORS middleware reads origins at startup. A server restart may be
    needed for the new origin to take effect.

    Args:
        body (UpdateCorsRequest): Request to update CORS origins with Tailscale hostname

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost]
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
    client: AuthenticatedClient,
    body: UpdateCorsRequest,
) -> (
    HTTPValidationError
    | UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost
    | None
):
    """Update Cors Origins

     Add Tailscale hostname to CORS allowed origins.

    This endpoint appends the Tailscale HTTPS origin to the security.cors_origins
    setting so the frontend can make requests from the Tailscale URL.

    Note: The CORS middleware reads origins at startup. A server restart may be
    needed for the new origin to take effect.

    Args:
        body (UpdateCorsRequest): Request to update CORS origins with Tailscale hostname

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: UpdateCorsRequest,
) -> Response[
    HTTPValidationError | UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost
]:
    """Update Cors Origins

     Add Tailscale hostname to CORS allowed origins.

    This endpoint appends the Tailscale HTTPS origin to the security.cors_origins
    setting so the frontend can make requests from the Tailscale URL.

    Note: The CORS middleware reads origins at startup. A server restart may be
    needed for the new origin to take effect.

    Args:
        body (UpdateCorsRequest): Request to update CORS origins with Tailscale hostname

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: UpdateCorsRequest,
) -> (
    HTTPValidationError
    | UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost
    | None
):
    """Update Cors Origins

     Add Tailscale hostname to CORS allowed origins.

    This endpoint appends the Tailscale HTTPS origin to the security.cors_origins
    setting so the frontend can make requests from the Tailscale URL.

    Note: The CORS middleware reads origins at startup. A server restart may be
    needed for the new origin to take effect.

    Args:
        body (UpdateCorsRequest): Request to update CORS origins with Tailscale hostname

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UpdateCorsOriginsApiTailscaleUpdateCorsPostResponseUpdateCorsOriginsApiTailscaleUpdateCorsPost
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
