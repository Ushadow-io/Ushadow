"""
Keycloak Admin Router

Admin endpoints for managing Keycloak configuration.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging

from src.services.keycloak_admin import get_keycloak_admin

router = APIRouter()
logger = logging.getLogger(__name__)


class ClientUpdateResponse(BaseModel):
    """Response for client update operations"""
    success: bool
    message: str
    client_id: str


@router.post("/clients/{client_id}/enable-pkce", response_model=ClientUpdateResponse)
async def enable_pkce_for_client(client_id: str):
    """
    Enable PKCE (Proof Key for Code Exchange) for a Keycloak client.

    This updates the client configuration to require PKCE with S256 code challenge method.
    PKCE is required for secure authentication in public clients (like SPAs).

    Args:
        client_id: The Keycloak client ID (e.g., "ushadow-frontend")

    Returns:
        Success status and message
    """
    admin_client = get_keycloak_admin()

    try:
        # Get current client configuration
        client = await admin_client.get_client_by_client_id(client_id)
        if not client:
            raise HTTPException(
                status_code=404,
                detail=f"Client '{client_id}' not found in Keycloak"
            )

        client_uuid = client["id"]
        logger.info(f"[KC-ADMIN] Enabling PKCE for client: {client_id} ({client_uuid})")

        # Update client attributes to require PKCE
        import httpx
        import os

        token = await admin_client._get_admin_token()
        keycloak_url = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
        realm = os.getenv("KEYCLOAK_REALM", "ushadow")

        # Get full client config first
        async with httpx.AsyncClient() as http_client:
            get_response = await http_client.get(
                f"{keycloak_url}/admin/realms/{realm}/clients/{client_uuid}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0
            )

            if get_response.status_code != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to get client config: {get_response.text}"
                )

            full_client_config = get_response.json()

            # Update attributes
            if "attributes" not in full_client_config:
                full_client_config["attributes"] = {}

            full_client_config["attributes"]["pkce.code.challenge.method"] = "S256"

            # Update client
            update_response = await http_client.put(
                f"{keycloak_url}/admin/realms/{realm}/clients/{client_uuid}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                json=full_client_config,
                timeout=10.0
            )

            if update_response.status_code != 204:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update client: {update_response.text}"
                )

        logger.info(f"[KC-ADMIN] ✓ PKCE enabled for client: {client_id}")

        return ClientUpdateResponse(
            success=True,
            message=f"PKCE (S256) enabled for client '{client_id}'",
            client_id=client_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[KC-ADMIN] Failed to enable PKCE: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to enable PKCE: {str(e)}"
        )


@router.get("/clients/{client_id}/config")
async def get_client_config(client_id: str):
    """
    Get Keycloak client configuration.

    Args:
        client_id: The Keycloak client ID

    Returns:
        Client configuration including attributes
    """
    admin_client = get_keycloak_admin()

    client = await admin_client.get_client_by_client_id(client_id)
    if not client:
        raise HTTPException(
            status_code=404,
            detail=f"Client '{client_id}' not found"
        )

    return {
        "client_id": client.get("clientId"),
        "id": client.get("id"),
        "enabled": client.get("enabled"),
        "publicClient": client.get("publicClient"),
        "standardFlowEnabled": client.get("standardFlowEnabled"),
        "attributes": client.get("attributes", {}),
        "redirectUris": client.get("redirectUris", []),
    }
