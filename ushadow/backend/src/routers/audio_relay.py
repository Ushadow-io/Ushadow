"""
Audio Relay Router - WebSocket relay to multiple destinations

Accepts Wyoming protocol audio from mobile app and forwards to:
- Chronicle (/ws?codec=pcm)
- Mycelia (/ws?codec=pcm)
- Any other configured endpoints

Mobile connects once to /ws/audio/relay, server handles fanout.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from typing import List, Dict, Optional
import asyncio
import json
import logging
from datetime import datetime

from ..services.auth import get_current_user

router = APIRouter(prefix="/ws/audio", tags=["audio"])
logger = logging.getLogger(__name__)


class AudioRelayConnection:
    """Manages a single relay destination connection"""

    def __init__(self, name: str, url: str, token: str):
        self.name = name
        self.url = url
        self.token = token
        self.ws: Optional[WebSocket] = None
        self.connected = False
        self.error_count = 0
        self.max_errors = 5

    async def connect(self):
        """Connect to the destination WebSocket"""
        try:
            import websockets

            # Add token to URL (use & if URL already has query params)
            separator = '&' if '?' in self.url else '?'
            url_with_token = f"{self.url}{separator}token={self.token}"

            # Detect endpoint type for logging
            # Note: /ws endpoint accepts codec via query parameter
            if "codec=opus" in self.url:
                endpoint_type = "Opus"
            elif "codec=pcm" in self.url:
                endpoint_type = "PCM"
            elif "/ws" in self.url:
                endpoint_type = "Unified (codec via query param)"
            else:
                endpoint_type = "Unknown"
            logger.info(f"[AudioRelay:{self.name}] Connecting to {self.url} [{endpoint_type}]")

            self.ws = await websockets.connect(url_with_token)
            self.connected = True
            self.error_count = 0
            logger.info(f"[AudioRelay:{self.name}] Connected")

        except Exception as e:
            logger.error(f"[AudioRelay:{self.name}] Connection failed: {e}")
            self.connected = False
            raise

    async def send_text(self, message: str):
        """Send text message to destination"""
        if not self.connected or not self.ws:
            return

        try:
            await self.ws.send(message)
        except Exception as e:
            self.error_count += 1
            logger.error(f"[AudioRelay:{self.name}] Send text error ({self.error_count}/{self.max_errors}): {e}")

            if self.error_count >= self.max_errors:
                logger.warning(f"[AudioRelay:{self.name}] Too many errors, disconnecting")
                await self.disconnect()

    async def send_binary(self, data: bytes):
        """Send binary data to destination"""
        if not self.connected or not self.ws:
            return

        try:
            await self.ws.send(data)
        except Exception as e:
            self.error_count += 1
            logger.error(f"[AudioRelay:{self.name}] Send binary error ({self.error_count}/{self.max_errors}): {e}")

            if self.error_count >= self.max_errors:
                logger.warning(f"[AudioRelay:{self.name}] Too many errors, disconnecting")
                await self.disconnect()

    async def disconnect(self):
        """Disconnect from destination"""
        if self.ws:
            try:
                await self.ws.close()
            except:
                pass
        self.connected = False
        self.ws = None
        logger.info(f"[AudioRelay:{self.name}] Disconnected")


class AudioRelaySession:
    """Manages a relay session with multiple destinations"""

    def __init__(self, destinations: List[Dict[str, str]], token: str):
        self.destinations: List[AudioRelayConnection] = [
            AudioRelayConnection(
                name=dest["name"],
                url=dest["url"],
                token=token
            )
            for dest in destinations
        ]
        self.bytes_relayed = 0
        self.chunks_relayed = 0

    async def connect_all(self):
        """Connect to all destinations"""
        results = await asyncio.gather(
            *[dest.connect() for dest in self.destinations],
            return_exceptions=True
        )

        # Log connection results
        for dest, result in zip(self.destinations, results):
            if isinstance(result, Exception):
                logger.error(f"[AudioRelay:{dest.name}] Failed to connect: {result}")

        # Return number of successful connections
        connected = sum(1 for dest in self.destinations if dest.connected)
        logger.info(f"[AudioRelay] Connected to {connected}/{len(self.destinations)} destinations")
        return connected

    async def relay_text(self, message: str):
        """Relay text message to all connected destinations"""
        await asyncio.gather(
            *[dest.send_text(message) for dest in self.destinations if dest.connected],
            return_exceptions=True
        )

    async def relay_binary(self, data: bytes):
        """Relay binary data to all connected destinations"""
        self.bytes_relayed += len(data)
        self.chunks_relayed += 1

        if self.chunks_relayed % 50 == 0:
            logger.info(f"[AudioRelay] Relayed {self.chunks_relayed} chunks, {self.bytes_relayed} bytes")

        await asyncio.gather(
            *[dest.send_binary(data) for dest in self.destinations if dest.connected],
            return_exceptions=True
        )

    async def disconnect_all(self):
        """Disconnect from all destinations"""
        await asyncio.gather(
            *[dest.disconnect() for dest in self.destinations],
            return_exceptions=True
        )
        logger.info(f"[AudioRelay] Session ended. Total: {self.chunks_relayed} chunks, {self.bytes_relayed} bytes")

    def get_status(self) -> Dict:
        """Get current relay status"""
        return {
            "destinations": [
                {
                    "name": dest.name,
                    "connected": dest.connected,
                    "errors": dest.error_count,
                }
                for dest in self.destinations
            ],
            "bytes_relayed": self.bytes_relayed,
            "chunks_relayed": self.chunks_relayed,
        }


@router.websocket("/relay")
async def audio_relay_websocket(
    websocket: WebSocket,
    # TODO: Implement your auth - this is a placeholder
    # user = Depends(get_current_user)
):
    """
    Audio relay WebSocket endpoint.

    Query parameters:
    - destinations: JSON array of {"name": "chronicle", "url": "ws://host/ws?codec=pcm"}
    - token: JWT token for authenticating to destinations

    Example:
    ws://localhost:8000/ws/audio/relay?destinations=[{"name":"chronicle","url":"ws://host/ws?codec=pcm"},{"name":"mycelia","url":"ws://host/ws?codec=pcm"}]&token=YOUR_JWT
    """
    await websocket.accept()
    logger.info("[AudioRelay] Client connected")

    # Parse destinations from query params
    try:
        destinations_param = websocket.query_params.get("destinations")
        token = websocket.query_params.get("token")

        if not destinations_param or not token:
            await websocket.close(code=1008, reason="Missing destinations or token parameter")
            return

        # Bridge Keycloak token to service token for destinations
        from src.services.token_bridge import bridge_to_service_token
        service_token = await bridge_to_service_token(
            token,
            audiences=["ushadow", "chronicle", "mycelia"]
        )

        if not service_token:
            logger.error("[AudioRelay] Token bridging failed")
            await websocket.close(code=1008, reason="Authentication failed")
            return

        logger.info("[AudioRelay] ✓ Token bridged successfully")
        # Use service token for downstream connections
        token = service_token

        destinations = json.loads(destinations_param)
        if not isinstance(destinations, list) or len(destinations) == 0:
            await websocket.close(code=1008, reason="destinations must be a non-empty array")
            return

        logger.info(f"[AudioRelay] Destinations: {[d['name'] for d in destinations]}")
        # Log exact URLs received from client for debugging
        for dest in destinations:
            # Detect endpoint type (check for old formats first, then new)
            if "/ws_omi" in dest['url']:
                endpoint_type = "Opus (LEGACY - use /ws?codec=opus)"
            elif "/ws_pcm" in dest['url']:
                endpoint_type = "PCM (LEGACY - use /ws?codec=pcm)"
            elif "codec=opus" in dest['url']:
                endpoint_type = "Opus"
            elif "codec=pcm" in dest['url']:
                endpoint_type = "PCM"
            elif "/ws" in dest['url']:
                endpoint_type = "Unified (missing codec parameter)"
            else:
                endpoint_type = "Unknown"
            logger.info(f"[AudioRelay] Client requested: {dest['name']} -> {dest['url']} [{endpoint_type}]")

    except json.JSONDecodeError as e:
        await websocket.close(code=1008, reason=f"Invalid destinations JSON: {e}")
        return
    except Exception as e:
        await websocket.close(code=1011, reason=f"Error parsing parameters: {e}")
        return

    # Create relay session
    session = AudioRelaySession(destinations, token)

    try:
        # Connect to all destinations
        connected_count = await session.connect_all()

        if connected_count == 0:
            await websocket.send_json({
                "type": "error",
                "message": "Failed to connect to any destinations"
            })
            await websocket.close(code=1011, reason="No destinations available")
            return

        # Send status to client
        await websocket.send_json({
            "type": "relay_status",
            "data": session.get_status()
        })

        # Relay loop
        while True:
            # Receive from mobile client
            try:
                message = await websocket.receive()
            except WebSocketDisconnect:
                logger.info("[AudioRelay] Client disconnected")
                break

            # Relay text messages (Wyoming protocol headers)
            if "text" in message:
                text_data = message["text"]
                logger.debug(f"[AudioRelay] Relaying text: {text_data[:100]}")
                await session.relay_text(text_data)

            # Relay binary messages (audio chunks)
            elif "bytes" in message:
                binary_data = message["bytes"]
                await session.relay_binary(binary_data)

    except Exception as e:
        logger.error(f"[AudioRelay] Error: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except:
            pass

    finally:
        # Cleanup
        await session.disconnect_all()
        try:
            await websocket.close()
        except:
            pass


@router.get("/relay/status")
async def relay_status():
    """Get relay endpoint information"""
    return {
        "endpoint": "/ws/audio/relay",
        "protocol": "Wyoming",
        "description": "Multi-destination audio relay",
        "parameters": {
            "destinations": "JSON array of destination configs",
            "token": "JWT token for destination authentication"
        },
        "example_url": 'ws://localhost:8000/ws/audio/relay?destinations=[{"name":"chronicle","url":"ws://host/ws?codec=pcm"}]&token=JWT'
    }
