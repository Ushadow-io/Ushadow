"""End-to-end test of the Chronicle audio v2 relay against fake servers.

A fake Chronicle (v2) and a fake Mycelia (Wyoming) run as real WebSocket servers.
The phone side is the FastAPI TestClient speaking v2 to /ws/audio/relay.
"""

import json
import threading
import time
from urllib.parse import quote

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.protobuf import json_format
from starlette.websockets import WebSocketDisconnect
from websockets.sync.server import serve

from src.routers import audio_relay
from src.services.audio_v2 import SUBPROTOCOL, audio_pb2, relay

SERVICE_TOKEN = "service-token"  # noqa: S105 - test value


def _control(**event) -> str:
    message = audio_pb2.ClientControl(**event)
    message.event_id.value = "e1"
    message.sent_at.GetCurrentTime()
    return json_format.MessageToJson(message, indent=None)


def _server(**event) -> str:
    return json_format.MessageToJson(audio_pb2.ServerControl(**event), indent=None)


def _binding() -> audio_pb2.CaptureBinding:
    binding = audio_pb2.CaptureBinding(capture_epoch=1)
    binding.capture_session_id.value = "cap-1"
    return binding


def _fake_chronicle(log: list, reject_media: bool):
    def handler(ws):
        for frame in ws:
            log.append(frame)
            if isinstance(frame, bytes):
                if reject_media:
                    ws.close(1008, "INVALID_MEDIA")
                    return
                ack = audio_pb2.CapturePacketAccepted(binding=_binding(), sequence=1)
                ws.send(_server(capture_packet_accepted=ack))
                continue
            control = audio_pb2.ClientControl()
            json_format.Parse(frame, control)
            event = control.WhichOneof("event")
            if event == "hello":
                ws.send(_server(hello=audio_pb2.ServerHello()))
            elif event == "start_capture":
                ws.send(_server(capture_started=audio_pb2.CaptureStarted(binding=_binding())))
            elif event == "stop_capture":
                ws.send(_server(capture_stopped=audio_pb2.CaptureStopped(binding=_binding())))

    return handler


def _fake_mycelia(log: list, paths: list):
    def handler(ws):
        paths.append(ws.request.path)
        for frame in ws:
            log.append(frame)

    return handler


@pytest.fixture
def servers():
    state = {"chronicle": [], "mycelia": [], "mycelia_paths": [], "reject_media": False}
    chronicle = serve(
        lambda ws: _fake_chronicle(state["chronicle"], state["reject_media"])(ws),
        "127.0.0.1",
        0,
        subprotocols=[SUBPROTOCOL],
    )
    mycelia = serve(_fake_mycelia(state["mycelia"], state["mycelia_paths"]), "127.0.0.1", 0)
    for server in (chronicle, mycelia):
        threading.Thread(target=server.serve_forever, daemon=True).start()
    state["chronicle_port"] = chronicle.socket.getsockname()[1]
    state["mycelia_port"] = mycelia.socket.getsockname()[1]
    yield state
    chronicle.shutdown()
    mycelia.shutdown()


class _User:
    id = "user-1"
    email = "user@example.com"


@pytest.fixture
def client(monkeypatch, servers):
    async def fake_user(token):
        return _User() if token == "casdoor-token" else None  # noqa: S105

    async def fake_allowed():
        return {
            f"ws://127.0.0.1:{servers['chronicle_port']}/ws/audio",
            f"ws://127.0.0.1:{servers['mycelia_port']}/ws/audio",
        }

    monkeypatch.setattr(relay, "get_user_from_token", fake_user)
    monkeypatch.setattr(relay, "generate_jwt_for_service", lambda *_, **__: SERVICE_TOKEN)
    # The old Wyoming path in the router does the same checks.
    monkeypatch.setattr(audio_relay, "get_user_from_token", fake_user)
    monkeypatch.setattr(audio_relay, "generate_jwt_for_service", lambda *_, **__: SERVICE_TOKEN)
    monkeypatch.setattr(audio_relay, "_exposed_audio_urls", fake_allowed)
    app = FastAPI()
    app.include_router(audio_relay.router)
    return TestClient(app)


def _relay_url(state, extra: list | None = None) -> str:
    destinations = [*(extra or []),
        {
            "name": "chronicle",
            "url": f"ws://127.0.0.1:{state['chronicle_port']}/ws/audio",
            "protocol": SUBPROTOCOL,
        },
        {"name": "mycelia", "url": f"ws://127.0.0.1:{state['mycelia_port']}/ws/audio?codec=opus"},
    ]
    return f"/ws/audio/relay?destinations={quote(json.dumps(destinations))}"


def _hello(token: str = "casdoor-token") -> str:
    hello = audio_pb2.ClientHello(bearer_token=token, device_kind=audio_pb2.DEVICE_KIND_OMI)
    hello.source_id.value = "omi"
    return _control(hello=hello)


def _media(payload: bytes) -> bytes:
    packet = audio_pb2.CaptureMediaPacket(binding=_binding(), sequence=1, opus_payload=payload)
    return audio_pb2.MediaEnvelope(capture=packet).SerializeToString()


def _server_event(text: str) -> str:
    message = audio_pb2.ServerControl()
    json_format.Parse(text, message)
    return message.WhichOneof("event")


def _wait_for(predicate, timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while not predicate() and time.monotonic() < deadline:
        time.sleep(0.02)


def test_relays_v2_to_chronicle_and_wyoming_to_mycelia(servers, client):
    stop = audio_pb2.StopCapture(binding=_binding(), reason=audio_pb2.STOP_REASON_USER_REQUESTED)
    with client.websocket_connect(_relay_url(servers), subprotocols=[SUBPROTOCOL]) as phone:
        assert phone.accepted_subprotocol == SUBPROTOCOL
        phone.send_text(_hello())
        assert _server_event(phone.receive_text()) == "hello"
        phone.send_text(_control(start_capture=audio_pb2.StartCapture(capture_epoch=1)))
        assert _server_event(phone.receive_text()) == "capture_started"
        phone.send_bytes(_media(b"OPUS"))
        assert _server_event(phone.receive_text()) == "capture_packet_accepted"
        phone.send_text(_control(stop_capture=stop))
        assert _server_event(phone.receive_text()) == "capture_stopped"
        # Close like a real phone, so the relay closes its upstreams cleanly
        # before TestClient tears the app down.
        phone.close()
        time.sleep(0.3)

    # Chronicle got the bridged token, not the Casdoor one.
    hello = audio_pb2.ClientControl()
    json_format.Parse(servers["chronicle"][0], hello)
    assert hello.hello.bearer_token == SERVICE_TOKEN
    assert servers["chronicle"][2] == _media(b"OPUS")

    # Mycelia got Wyoming: start, one Opus chunk header + payload, stop.
    _wait_for(lambda: len(servers["mycelia"]) >= 4)
    assert f"token={SERVICE_TOKEN}" in servers["mycelia_paths"][0]
    start, chunk, payload, end = servers["mycelia"][:4]
    assert json.loads(start)["type"] == "audio-start"
    assert json.loads(chunk) == {
        "type": "audio-chunk",
        "data": {"rate": 16000, "width": 0, "channels": 1, "codec": "opus"},
        "payload_length": 4,
    }
    assert payload == b"OPUS"
    assert json.loads(end)["type"] == "audio-stop"


def test_bad_token_closes_phone_with_1008(servers, client):
    with client.websocket_connect(_relay_url(servers), subprotocols=[SUBPROTOCOL]) as phone:
        phone.send_text(_hello(token="bad"))
        with pytest.raises(WebSocketDisconnect) as closed:
            phone.receive_text()
    assert closed.value.code == 1008
    assert servers["chronicle"] == []


def test_chronicle_close_code_reaches_phone(servers, client):
    servers["reject_media"] = True
    with client.websocket_connect(_relay_url(servers), subprotocols=[SUBPROTOCOL]) as phone:
        phone.send_text(_hello())
        phone.receive_text()
        phone.send_bytes(_media(b"BAD"))
        with pytest.raises(WebSocketDisconnect) as closed:
            phone.receive_text()
    assert closed.value.code == 1008
    assert closed.value.reason == "INVALID_MEDIA"


def test_unknown_destination_is_refused_before_any_connect(servers, client):
    evil = [{"name": "evil", "url": "ws://attacker.example:8000/ws/audio?codec=opus"}]
    with client.websocket_connect(_relay_url(servers, evil), subprotocols=[SUBPROTOCOL]) as phone:
        phone.send_text(_hello())
        with pytest.raises(WebSocketDisconnect) as closed:
            phone.receive_text()
    assert closed.value.code == 1008
    assert "not allowed" in closed.value.reason
    assert servers["chronicle"] == []


# --- Old Wyoming passthrough path (clients without the v2 subprotocol) ---


def _wyoming_url(state, token: str, url: str | None = None) -> str:
    url = url or f"ws://127.0.0.1:{state['mycelia_port']}/ws/audio"
    destinations = [{"name": "mycelia", "url": url}]
    return f"/ws/audio/relay?destinations={quote(json.dumps(destinations))}&token={token}"


def test_wyoming_relays_with_service_token(servers, client):
    with client.websocket_connect(_wyoming_url(servers, "casdoor-token")) as phone:
        assert phone.receive_json()["type"] == "relay_status"
        phone.send_text('{"type": "audio-start", "payload_length": null}\n')
        phone.close()
        time.sleep(0.3)
    _wait_for(lambda: len(servers["mycelia"]) >= 1)
    assert f"token={SERVICE_TOKEN}" in servers["mycelia_paths"][0]
    assert "audio-start" in servers["mycelia"][0]


def test_wyoming_bad_token_closes_with_1008(servers, client):
    with (
        client.websocket_connect(_wyoming_url(servers, "bad")) as phone,
        pytest.raises(WebSocketDisconnect) as closed,
    ):
        phone.receive_json()
    assert closed.value.code == 1008
    assert servers["mycelia_paths"] == []


def test_wyoming_unknown_destination_is_refused(servers, client):
    url = _wyoming_url(servers, "casdoor-token", "ws://attacker.example:8000/ws/audio")
    with client.websocket_connect(url) as phone, pytest.raises(WebSocketDisconnect) as closed:
        phone.receive_json()
    assert closed.value.code == 1008
    assert "not allowed" in closed.value.reason
