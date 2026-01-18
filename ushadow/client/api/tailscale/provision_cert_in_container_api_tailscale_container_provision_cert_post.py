from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.certificate_status import CertificateStatus
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response


def _get_kwargs(
    *,
    hostname: str,
) -> dict[str, Any]:
    params: dict[str, Any] = {}

    params["hostname"] = hostname

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/tailscale/container/provision-cert",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> CertificateStatus | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = CertificateStatus.from_dict(response.json())

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
) -> Response[CertificateStatus | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    hostname: str,
) -> Response[CertificateStatus | HTTPValidationError]:
    """Provision Cert In Container

     Provision certificate via Tailscale container

    Args:
        hostname (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[CertificateStatus | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        hostname=hostname,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    hostname: str,
) -> CertificateStatus | HTTPValidationError | None:
    """Provision Cert In Container

     Provision certificate via Tailscale container

    Args:
        hostname (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        CertificateStatus | HTTPValidationError
    """

    return sync_detailed(
        client=client,
        hostname=hostname,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    hostname: str,
) -> Response[CertificateStatus | HTTPValidationError]:
    """Provision Cert In Container

     Provision certificate via Tailscale container

    Args:
        hostname (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[CertificateStatus | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        hostname=hostname,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    hostname: str,
) -> CertificateStatus | HTTPValidationError | None:
    """Provision Cert In Container

     Provision certificate via Tailscale container

    Args:
        hostname (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        CertificateStatus | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            client=client,
            hostname=hostname,
        )
    ).parsed
