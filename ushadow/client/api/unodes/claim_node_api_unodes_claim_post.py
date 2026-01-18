from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.claim_node_api_unodes_claim_post_request import ClaimNodeApiUnodesClaimPostRequest
from ...models.http_validation_error import HTTPValidationError
from ...models.u_node_registration_response import UNodeRegistrationResponse
from ...types import Response


def _get_kwargs(
    *,
    body: ClaimNodeApiUnodesClaimPostRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/unodes/claim",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | UNodeRegistrationResponse | None:
    if response.status_code == 200:
        response_200 = UNodeRegistrationResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | UNodeRegistrationResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: ClaimNodeApiUnodesClaimPostRequest,
) -> Response[HTTPValidationError | UNodeRegistrationResponse]:
    """Claim Node

     Claim an available u-node by registering it to this leader.

    This endpoint allows claiming nodes that are:
    - Discovered on Tailscale network
    - Running u-node manager
    - Either unregistered or released from another leader

    Args:
        body (ClaimNodeApiUnodesClaimPostRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UNodeRegistrationResponse]
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
    body: ClaimNodeApiUnodesClaimPostRequest,
) -> HTTPValidationError | UNodeRegistrationResponse | None:
    """Claim Node

     Claim an available u-node by registering it to this leader.

    This endpoint allows claiming nodes that are:
    - Discovered on Tailscale network
    - Running u-node manager
    - Either unregistered or released from another leader

    Args:
        body (ClaimNodeApiUnodesClaimPostRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UNodeRegistrationResponse
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: ClaimNodeApiUnodesClaimPostRequest,
) -> Response[HTTPValidationError | UNodeRegistrationResponse]:
    """Claim Node

     Claim an available u-node by registering it to this leader.

    This endpoint allows claiming nodes that are:
    - Discovered on Tailscale network
    - Running u-node manager
    - Either unregistered or released from another leader

    Args:
        body (ClaimNodeApiUnodesClaimPostRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | UNodeRegistrationResponse]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: ClaimNodeApiUnodesClaimPostRequest,
) -> HTTPValidationError | UNodeRegistrationResponse | None:
    """Claim Node

     Claim an available u-node by registering it to this leader.

    This endpoint allows claiming nodes that are:
    - Discovered on Tailscale network
    - Running u-node manager
    - Either unregistered or released from another leader

    Args:
        body (ClaimNodeApiUnodesClaimPostRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | UNodeRegistrationResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
