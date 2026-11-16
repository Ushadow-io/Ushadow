"""CLIs that call the HTTP API send the token; the compare command prints ids and times only."""

from __future__ import annotations

import io
import json

from ledger import day_cli, http_client, replay


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def test_http_client_sends_bearer_token(monkeypatch):
    seen = {}

    def fake_urlopen(req, timeout):
        seen["auth"] = req.get_header("Authorization")
        seen["url"] = req.full_url
        return _Resp(b"{}")

    monkeypatch.setenv("LEDGER_TOKEN", "tok-1")
    monkeypatch.setattr(http_client.urllib.request, "urlopen", fake_urlopen)
    http_client.call("http://ledger:8200/", "GET", "/stats", params={"userId": "u"})
    assert seen == {"auth": "Bearer tok-1", "url": "http://ledger:8200/stats?userId=u"}


def test_replay_url_mode_goes_through_the_token_client(monkeypatch):
    calls = []
    monkeypatch.setattr(http_client, "call", lambda *a, **k: calls.append(a[:3]) or {})
    req = replay.IngestRequest.model_validate(
        {"userId": "u", "bundle": {"schemaVersion": "2.0.0", "range": _DAY}}
    )
    replay._post("http://ledger", req)
    assert calls == [("http://ledger", "POST", "/ingest")]


_DAY = {"start": "2026-11-14T00:00:00Z", "end": "2026-11-15T00:00:00Z"}


def test_compare_command(monkeypatch, tmp_path, capsys):
    view = {
        "conversation": {
            "id": "conv-1",
            "revision": 2,
            "range": {"start": "2026-11-14T09:00:00Z", "end": "2026-11-14T09:20:00Z"},
            "parts": [{}],
            "closedAt": "2026-11-14T09:50:00Z",
            "title": "secret words in a title",
        },
        "fragments": [],
    }
    monkeypatch.setattr(http_client, "call", lambda *a, **k: [view])
    expected = {
        "date": "2026-11-14",
        "timezone": "Europe/London",
        "range": _DAY,
        "conversations": [
            {
                "conversationId": "c-1",
                "start": "2026-11-14T09:01:00Z",
                "end": "2026-11-14T09:10:00Z",
            }
        ],
        "episodes": [
            {"episodeId": "ep-1", "start": "2026-11-14T08:55:00Z", "end": "2026-11-14T09:30:00Z"}
        ],
    }
    path = tmp_path / "2026-11-14.expected.json"
    path.write_text(json.dumps(expected))
    assert day_cli.main(["compare", str(path), "--user-id", "u", "--url", "http://x"]) == 0
    out = capsys.readouterr().out
    assert "09:00:00-09:20:00 conv-1 (rev 2, 1 part(s))  ->  08:55:00-09:30:00 ep-1" in out
    assert "c-1  ->  conv-1" in out
    assert "secret" not in out
