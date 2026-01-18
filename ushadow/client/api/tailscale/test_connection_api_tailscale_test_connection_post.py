from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.test_connection_api_tailscale_test_connection_post_response_test_connection_api_tailscale_test_connection_post import (
    TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost,
)
from ...types import UNSET, Response


def _get_kwargs(
    *,
    url_query: str,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["url"] = url_query

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/tailscale/test-connection",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    HTTPValidationError
    | TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost
    | None
):
    if response.status_code == 200:
        response_200 = (
            TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost.from_dict(
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
    HTTPValidationError
    | TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost
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
    url_query: str,
) -> Response[
    HTTPValidationError
    | TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost
]:
    """Test Connection

     Test connection to a specific URL

    Args:
        url_query (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost]
    """

    kwargs = _get_kwargs(
        url_query=url_query,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    url_query: str,
) -> (
    HTTPValidationError
    | TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost
    | None
):
    """Test Connection

     Test connection to a specific URL

    Args:
        url_query (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost
    """

    return sync_detailed(
        client=client,
        url_query=url_query,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    url_query: str,
) -> Response[
    HTTPValidationError
    | TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost
]:
    """Test Connection

     Test connection to a specific URL

    Args:
        url_query (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost]
    """

    kwargs = _get_kwargs(
        url_query=url_query,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    url_query: str,
) -> (
    HTTPValidationError
    | TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost
    | None
):
    """Test Connection

     Test connection to a specific URL

    Args:
        url_query (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | TestConnectionApiTailscaleTestConnectionPostResponseTestConnectionApiTailscaleTestConnectionPost
    """

    return (
        await asyncio_detailed(
            client=client,
            url_query=url_query,
        )
    ).parsed
