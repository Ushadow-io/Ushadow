"""Relay one Chronicle audio v2 phone connection.

The phone speaks ``chronicle.audio.v2`` to the Ushadow relay:

- The Chronicle destination (protocol ``chronicle.audio.v2``) gets every frame
  unchanged, except the ClientHello: its Casdoor bearer token is swapped for a
  bridged service token. Every Chronicle frame goes back to the phone unchanged.
- Every other destination (Mycelia) still speaks Wyoming. The relay unwraps each
  capture MediaEnvelope and sends its raw Opus packet as a Wyoming audio-chunk.

Only v2 frames ever reach the phone. AudioV2Socket decodes every text frame as a
ServerControl, so a relay_status or error JSON would break the session.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import websockets
from fastapi import WebSocket
from google.protobuf import json_format
from google.protobuf.message import DecodeError

from ..auth import generate_jwt_for_service, get_user_from_token
from . import audio_pb2

# Returns the destination URLs the server itself exposes (scheme://host:port/path).
AllowedUrls = Callable[[], Awaitable[set[str]]]

logger = logging.getLogger(__name__)

SUBPROTOCOL = "chronicle.audio.v2"
_AUDIENCES = ["ushadow", "chronicle"]
_HELLO_TIMEOUT_S = 10.0
_OPUS_FORMAT = {"rate": 16000, "width": 0, "channels": 1, "codec": "opus"}
# Close codes that must never be sent on the wire (RFC 6455 section 7.4.1).
_RESERVED_CLOSE_CODES = {1005, 1006, 1015}
_MAX_CLOSE_REASON = 120


class RelayRefusedError(Exception):
    """The relay cannot start. Close the phone with this code and reason."""

    def __init__(self, code: int, reason: str) -> None:
        super().__init__(reason)
        self.code = code
        self.reason = reason


def split_destinations(destinations: list[dict]) -> tuple[dict, list[dict]]:
    """Return (the one Chronicle v2 destination, the Wyoming destinations)."""
    v2 = [d for d in destinations if d.get("protocol") == SUBPROTOCOL]
    if len(v2) != 1:
        raise RelayRefusedError(1008, f"audio v2 needs exactly one {SUBPROTOCOL} destination")
    return v2[0], [d for d in destinations if d.get("protocol") != SUBPROTOCOL]


def url_key(url: str) -> str:
    """scheme://host:port/path, without query or fragment, for allowlist checks."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", ""))


def check_allowed(destinations: list[dict], allowed: set[str]) -> None:
    """Refuse any destination the server does not expose itself (SSRF, token leak)."""
    allowed_keys = {url_key(url) for url in allowed}
    for dest in destinations:
        if url_key(str(dest.get("url", ""))) not in allowed_keys:
            raise RelayRefusedError(1008, f"destination {dest.get('name')!r} is not allowed")


def _with_query(url: str, drop: set[str], add: dict[str, str]) -> str:
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k not in drop and k not in add]
    query.extend(add.items())
    return urlunsplit(parts._replace(query=urlencode(query)))


async def _receive_hello(phone: WebSocket) -> str:
    try:
        message = await asyncio.wait_for(phone.receive(), _HELLO_TIMEOUT_S)
    except TimeoutError as error:
        raise RelayRefusedError(1008, "no ClientHello received") from error
    text = message.get("text")
    if text is None:
        raise RelayRefusedError(1008, "first frame must be a ClientHello")
    return text


async def _bridged_hello(text: str) -> tuple[str, str]:
    """Swap the ClientHello bearer token. Return (new hello JSON, service token)."""
    message = audio_pb2.ClientControl()
    try:
        json_format.Parse(text, message)
    except json_format.ParseError as error:
        raise RelayRefusedError(1008, "first frame must be a ClientHello") from error
    if message.WhichOneof("event") != "hello":
        raise RelayRefusedError(1008, "first frame must be a ClientHello")
    # Fail closed: only a valid Casdoor user gets a service token. Unknown tokens
    # are never passed through, because the relay opens outbound connections.
    user = await get_user_from_token(message.hello.bearer_token)
    if not user:
        raise RelayRefusedError(1008, "invalid or expired token")
    token = generate_jwt_for_service(str(user.id), user.email, audiences=_AUDIENCES)
    message.hello.bearer_token = token
    rendered = json_format.MessageToJson(message, preserving_proto_field_name=True, indent=None)
    return rendered, token


async def _drain(ws: websockets.ClientConnection) -> None:
    """Read and drop Wyoming replies so the destination never blocks on send."""
    try:
        async for _ in ws:
            pass
    except websockets.ConnectionClosed:
        pass


@dataclass
class WyomingOpusFanout:
    """Turns v2 capture packets into Wyoming Opus events for non-v2 destinations."""

    destinations: list[dict]
    token: str
    _sockets: dict[str, websockets.ClientConnection] = field(default_factory=dict)
    _drains: list[asyncio.Task] = field(default_factory=list)
    _capturing: bool = False

    async def connect(self) -> None:
        results = await asyncio.gather(
            *[self._connect_one(dest) for dest in self.destinations],
            return_exceptions=True,
        )
        for dest, result in zip(self.destinations, results, strict=True):
            if isinstance(result, BaseException):
                logger.warning("[AudioRelayV2:%s] Connect failed: %s", dest.get("name"), result)

    async def _connect_one(self, dest: dict) -> None:
        url = _with_query(dest["url"], drop=set(), add={"token": self.token})
        ws = await websockets.connect(url, ping_interval=None)
        self._sockets[dest["name"]] = ws
        self._drains.append(asyncio.create_task(_drain(ws)))
        logger.info("[AudioRelayV2:%s] Connected (Wyoming opus)", dest["name"])

    async def on_control(self, text: str) -> None:
        message = audio_pb2.ClientControl()
        try:
            json_format.Parse(text, message)
        except json_format.ParseError:
            return  # Chronicle rejects it; nothing to fan out.
        event = message.WhichOneof("event")
        if event == "start_capture":
            if self._capturing:
                await self._send("audio-stop", {})
            self._capturing = True
            await self._send("audio-start", {**_OPUS_FORMAT, "mode": "streaming"})
        elif event == "stop_capture" and self._capturing:
            self._capturing = False
            await self._send("audio-stop", {})

    async def on_media(self, data: bytes) -> None:
        envelope = audio_pb2.MediaEnvelope()
        try:
            envelope.ParseFromString(data)
        except DecodeError:
            return
        if envelope.WhichOneof("media") == "capture" and envelope.capture.opus_payload:
            await self._send("audio-chunk", _OPUS_FORMAT, envelope.capture.opus_payload)

    async def _send(self, event_type: str, data: dict, payload: bytes | None = None) -> None:
        header = {
            "type": event_type,
            "data": data,
            "payload_length": len(payload) if payload else None,
        }
        line = json.dumps(header) + "\n"
        for name, ws in list(self._sockets.items()):
            try:
                await ws.send(line)
                if payload:
                    await ws.send(payload)
            except websockets.ConnectionClosed:
                logger.warning("[AudioRelayV2:%s] Disconnected", name)
                self._sockets.pop(name, None)

    async def close(self) -> None:
        if self._capturing:
            self._capturing = False
            await self._send("audio-stop", {})
        await asyncio.gather(*[ws.close() for ws in self._sockets.values()])
        for task in self._drains:
            task.cancel()
        await asyncio.gather(*self._drains, return_exceptions=True)
        self._sockets.clear()


async def _open(
    phone: WebSocket,
    destinations: list[dict],
    allowed_urls: AllowedUrls,
) -> tuple[websockets.ClientConnection, WyomingOpusFanout]:
    target, wyoming = split_destinations(destinations)
    hello, token = await _bridged_hello(await _receive_hello(phone))
    check_allowed(destinations, await allowed_urls())
    url = _with_query(target["url"], drop={"codec", "token"}, add={})
    try:
        chronicle = await websockets.connect(url, subprotocols=[SUBPROTOCOL], ping_interval=None)
    except (OSError, TimeoutError, websockets.InvalidHandshake) as error:
        logger.error("[AudioRelayV2] Chronicle connect failed (%s): %s", url, error)
        raise RelayRefusedError(1011, "Chronicle is not reachable") from error
    logger.info("[AudioRelayV2] Connected to Chronicle %s", url)
    await chronicle.send(hello)
    fanout = WyomingOpusFanout(wyoming, token)
    await fanout.connect()
    return chronicle, fanout


async def _phone_to_chronicle(
    phone: WebSocket,
    chronicle: websockets.ClientConnection,
    fanout: WyomingOpusFanout,
) -> None:
    while True:
        message = await phone.receive()
        if message["type"] == "websocket.disconnect":
            return
        if (text := message.get("text")) is not None:
            await chronicle.send(text)
            await fanout.on_control(text)
        elif (data := message.get("bytes")) is not None:
            await chronicle.send(data)
            await fanout.on_media(data)


async def _chronicle_to_phone(chronicle: websockets.ClientConnection, phone: WebSocket) -> None:
    try:
        async for message in chronicle:
            if isinstance(message, str):
                await phone.send_text(message)
            else:
                await phone.send_bytes(message)
    except websockets.ConnectionClosed:
        pass


async def _close_phone(phone: WebSocket, code: int, reason: str) -> None:
    if code in _RESERVED_CLOSE_CODES:
        code = 1011
    with contextlib.suppress(RuntimeError):  # Already closed.
        await phone.close(code=code, reason=reason[:_MAX_CLOSE_REASON])


async def _pump(
    phone: WebSocket,
    chronicle: websockets.ClientConnection,
    fanout: WyomingOpusFanout,
) -> None:
    uplink = asyncio.create_task(_phone_to_chronicle(phone, chronicle, fanout))
    downlink = asyncio.create_task(_chronicle_to_phone(chronicle, phone))
    done, pending = await asyncio.wait({uplink, downlink}, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    for task in done:
        error = task.exception()
        if error and not isinstance(error, (websockets.ConnectionClosed, RuntimeError)):
            logger.error("[AudioRelayV2] Relay error: %s", error, exc_info=error)
    if downlink in done:
        # Chronicle ended the session: pass its close code and reason to the phone.
        code = chronicle.close_code or 1011
        reason = chronicle.close_reason or "Chronicle closed the connection"
        logger.info("[AudioRelayV2] Chronicle closed: %s %s", code, reason)
        await _close_phone(phone, code, reason)


async def run_v2_relay(
    phone: WebSocket,
    destinations: list[dict],
    allowed_urls: AllowedUrls,
) -> None:
    """Relay one v2 session. The caller has accepted `phone` with SUBPROTOCOL.

    `allowed_urls` returns the audio URLs this server exposes. The relay checks
    every client-supplied destination against it after the user is authenticated
    and before any outbound connection.
    """
    try:
        chronicle, fanout = await _open(phone, destinations, allowed_urls)
    except RelayRefusedError as refused:
        logger.warning("[AudioRelayV2] Refused: %s", refused.reason)
        await _close_phone(phone, refused.code, refused.reason)
        return
    try:
        await _pump(phone, chronicle, fanout)
    finally:
        await fanout.close()
        await chronicle.close()
        logger.info("[AudioRelayV2] Session ended")
