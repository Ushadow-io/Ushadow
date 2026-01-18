from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.compose_parse_response import ComposeParseResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response


def _get_kwargs(
    *,
    github_url: str,
    compose_path: str,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["github_url"] = github_url

    params["compose_path"] = compose_path

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/github-import/parse",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ComposeParseResponse | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = ComposeParseResponse.from_dict(response.json())

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
) -> Response[ComposeParseResponse | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    github_url: str,
    compose_path: str,
) -> Response[ComposeParseResponse | HTTPValidationError]:
    """Parse Compose File

     Parse a docker-compose file and extract service/environment information.

    Returns structured information about services, including environment variables
    that need to be configured.

    Args:
        github_url (str):
        compose_path (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ComposeParseResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        github_url=github_url,
        compose_path=compose_path,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    github_url: str,
    compose_path: str,
) -> ComposeParseResponse | HTTPValidationError | None:
    """Parse Compose File

     Parse a docker-compose file and extract service/environment information.

    Returns structured information about services, including environment variables
    that need to be configured.

    Args:
        github_url (str):
        compose_path (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ComposeParseResponse | HTTPValidationError
    """

    return sync_detailed(
        client=client,
        github_url=github_url,
        compose_path=compose_path,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    github_url: str,
    compose_path: str,
) -> Response[ComposeParseResponse | HTTPValidationError]:
    """Parse Compose File

     Parse a docker-compose file and extract service/environment information.

    Returns structured information about services, including environment variables
    that need to be configured.

    Args:
        github_url (str):
        compose_path (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ComposeParseResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        github_url=github_url,
        compose_path=compose_path,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    github_url: str,
    compose_path: str,
) -> ComposeParseResponse | HTTPValidationError | None:
    """Parse Compose File

     Parse a docker-compose file and extract service/environment information.

    Returns structured information about services, including environment variables
    that need to be configured.

    Args:
        github_url (str):
        compose_path (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ComposeParseResponse | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            client=client,
            github_url=github_url,
            compose_path=compose_path,
        )
    ).parsed
