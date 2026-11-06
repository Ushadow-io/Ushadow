"""
Audio Relay Router - one Chronicle audio v2 connection, many destinations.

Clients (phone mic, OMI via the phone, web) connect once to /ws/audio/relay with
the chronicle.audio.v2 subprotocol. The relay passes v2 through to Chronicle and
unwraps the Opus packets as Wyoming for other destinations (Mycelia). See
services/audio_v2/relay.py.
"""
import json
import logging

from fastapi import APIRouter, WebSocket

from ..services.audio_v2 import SUBPROTOCOL as V2_SUBPROTOCOL
from ..services.audio_v2 import run_v2_relay

router = APIRouter(prefix="/ws/audio", tags=["audio"])
logger = logging.getLogger(__name__)


@router.websocket("/relay")
async def audio_relay_websocket(websocket: WebSocket):
    """
    Audio v2 relay WebSocket endpoint.

    Subprotocol: chronicle.audio.v2 (required). The login token travels in the
    v2 ClientHello, not in the URL.

    Query parameters:
    - destinations: JSON array of {"name", "url", "protocol"?}. Exactly one must
      have protocol "chronicle.audio.v2"; each url must be an audio_intake URL
      this server exposes.
    """
    if V2_SUBPROTOCOL not in websocket.scope.get("subprotocols", []):
        await websocket.accept()
        await websocket.close(code=1002, reason=f"subprotocol {V2_SUBPROTOCOL} is required")
        return

    await websocket.accept(subprotocol=V2_SUBPROTOCOL)
    try:
        destinations = json.loads(websocket.query_params.get("destinations") or "[]")
    except json.JSONDecodeError:
        destinations = None
    if not isinstance(destinations, list) or not destinations:
        await websocket.close(code=1008, reason="destinations must be a non-empty array")
        return
    logger.info(f"[AudioRelay] v2 session, destinations: {[d.get('name') for d in destinations]}")
    await run_v2_relay(websocket, destinations, _exposed_audio_urls)


async def _exposed_audio_urls() -> set[str]:
    """Audio intake URLs this server exposes; the relay connects only to these."""
    # Imported here: routers.deployments imports many services; keep relay import light.
    from .deployments import get_exposed_urls

    exposed = await get_exposed_urls(
        url_type="audio", url_name="audio_intake", audio_format=None, status=None,
        current_user=None,
    )
    return {entry["url"] for entry in exposed}


@router.get("/relay/status")
async def relay_status():
    """Get relay endpoint information"""
    return {
        "endpoint": "/ws/audio/relay",
        "protocol": V2_SUBPROTOCOL,
        "description": "Chronicle audio v2 relay; Opus fan-out to Wyoming destinations",
        "parameters": {
            "destinations": 'JSON array of {"name", "url", "protocol"?}',
        },
        "auth": "bearer_token in the v2 ClientHello",
    }
