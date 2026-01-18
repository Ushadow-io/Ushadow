from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.service_token_request import ServiceTokenRequest
from ...models.service_token_response import ServiceTokenResponse
from ...types import Response


def _get_kwargs(
    *,
    body: ServiceTokenRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/auth/service-token",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | ServiceTokenResponse | None:
    if response.status_code == 200:
        response_200 = ServiceTokenResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | ServiceTokenResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: ServiceTokenRequest,
) -> Response[HTTPValidationError | ServiceTokenResponse]:
    r"""Get Service Token

     Generate a JWT token for cross-service authentication.

    This token can be used to authenticate with other services
    (like chronicle) that share the same AUTH_SECRET_KEY.

    The token includes issuer (\"ushadow\") and audience claims
    so receiving services can validate the token's intended use.

    Args:
        body (ServiceTokenRequest): Request for generating a cross-service token.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ServiceTokenResponse]
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
    body: ServiceTokenRequest,
) -> HTTPValidationError | ServiceTokenResponse | None:
    r"""Get Service Token

     Generate a JWT token for cross-service authentication.

    This token can be used to authenticate with other services
    (like chronicle) that share the same AUTH_SECRET_KEY.

    The token includes issuer (\"ushadow\") and audience claims
    so receiving services can validate the token's intended use.

    Args:
        body (ServiceTokenRequest): Request for generating a cross-service token.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ServiceTokenResponse
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: ServiceTokenRequest,
) -> Response[HTTPValidationError | ServiceTokenResponse]:
    r"""Get Service Token

     Generate a JWT token for cross-service authentication.

    This token can be used to authenticate with other services
    (like chronicle) that share the same AUTH_SECRET_KEY.

    The token includes issuer (\"ushadow\") and audience claims
    so receiving services can validate the token's intended use.

    Args:
        body (ServiceTokenRequest): Request for generating a cross-service token.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ServiceTokenResponse]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: ServiceTokenRequest,
) -> HTTPValidationError | ServiceTokenResponse | None:
    r"""Get Service Token

     Generate a JWT token for cross-service authentication.

    This token can be used to authenticate with other services
    (like chronicle) that share the same AUTH_SECRET_KEY.

    The token includes issuer (\"ushadow\") and audience claims
    so receiving services can validate the token's intended use.

    Args:
        body (ServiceTokenRequest): Request for generating a cross-service token.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ServiceTokenResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
