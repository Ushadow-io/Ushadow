"""Handler -> outbox -> sender, with a fake ledger and a fake Chronicle lookup."""

import asyncio

import pytest

from ledger_adapter import lookup, mapping as m
from ledger_adapter.outbox import Outbox
from ledger_adapter.plugin import LedgerAdapterPlugin
from ledger_adapter.sender import Sender
from conftest import PluginContext
import fixtures as fx


@pytest.fixture
def plugin(tmp_path, monkeypatch):
    async def fake_fetch(cid, live_capture_session_id=None):
        return fx.facts(conversation_id=cid) if cid != "missing" else None
    monkeypatch.setattr(lookup, "fetch_facts", fake_fetch)
    p = LedgerAdapterPlugin({"enabled": True, "ledger_url": "http://x", "outbox_dir": str(tmp_path / "ob")})
    p._outbox = Outbox(str(tmp_path / "ob"))
    return p


class FakeSender:
    def __init__(self): self.n = 0
    def notify(self): self.n += 1


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_handler_queues_bundle_and_declines(plugin):
    plugin._sender = FakeSender()
    ctx = PluginContext("u1", "conversation.complete", fx.complete_payload_upload())
    assert run(plugin.on_conversation_complete(ctx)) is None
    items = list(plugin._outbox.pending())
    assert len(items) == 1 and items[0][1]["recordings"][0]["id"] == f"chronicle:{fx.CID}"
    assert plugin._sender.n == 1


def test_streaming_repeats_send_only_new_segments(plugin):
    plugin._sender = FakeSender()
    for _ in range(5):  # identical event five times: one delta only
        run(plugin.on_transcript(PluginContext("u1", "transcript.streaming", fx.streaming_payload())))
    assert plugin._outbox.count() == 1
    p = fx.streaming_payload()
    p["segments"].append({"start": 7.0, "end": 9.0, "text": "Great.", "speaker": "Speaker 0", "words": []})
    run(plugin.on_transcript(PluginContext("u1", "transcript.streaming", p)))
    assert plugin._outbox.count() == 2
    newest = [b for _, b in plugin._outbox.pending()][-1]
    segs = newest["transcripts"][0]["segments"]
    assert [s["text"] for s in segs] == ["Great."]
    assert newest["transcripts"][0]["metadata"]["chronicle"]["provisional"] is True


def test_live_claim_gives_exact_times_when_audio_ranges_empty(tmp_path, monkeypatch):
    # real lookup.fetch_facts with fake Chronicle modules and a fake claim_capture_window
    import sys, types
    from types import SimpleNamespace as NS
    from datetime import datetime, timezone
    t0 = datetime(2026, 11, 14, 7, 30, tzinfo=timezone.utc)
    calls = []

    async def find_one(*a, **k):
        return NS(conversation_id=fx.CID, client_id="dev", started_at=t0, ended_at=None, end_reason=None,
                  deleted=False, audio_ranges=[], active_transcript=None)

    class Conv:
        conversation_id = "x"

    Conv.find_one = staticmethod(find_one)

    async def claim(sid, started, ended):
        calls.append((sid, started))
        return [NS(started_at=t0, ended_at=t0.replace(minute=31), time_basis="captured",
                   capture_session_ids=[sid])]

    mods = {"backend.models": types.ModuleType("backend.models"),
            "backend.models.conversation": types.ModuleType("c"),
            "backend.services": types.ModuleType("backend.services"),
            "backend.services.audio_claims": types.ModuleType("a")}
    mods["backend.models.conversation"].Conversation = Conv
    mods["backend.services.audio_claims"].claim_capture_window = claim
    for k, v in mods.items():
        monkeypatch.setitem(sys.modules, k, v)
    facts = run(lookup.fetch_facts(fx.CID, live_capture_session_id="sess-1"))
    assert calls == [("sess-1", t0)] and facts["ranges_source"] == "live_claim"
    b, why = m.build_bundle(m.EVENT_STREAMING, fx.streaming_payload(), facts)
    assert why is None
    assert b["transcripts"][0]["segments"][0]["start"] == "2026-11-14T07:30:00.400Z"
    assert b["transcripts"][0]["metadata"]["chronicle"]["ranges_source"] == "live_claim"


def test_failing_live_claim_sends_nothing(monkeypatch):
    import sys, types
    from types import SimpleNamespace as NS
    from datetime import datetime, timezone

    async def find_one(*a, **k):
        return NS(conversation_id=fx.CID, client_id="dev", started_at=datetime.now(timezone.utc),
                  ended_at=None, end_reason=None, deleted=False, audio_ranges=[], active_transcript=None)

    class Conv:
        conversation_id = "x"

    Conv.find_one = staticmethod(find_one)

    async def claim(*a):
        raise RuntimeError("no audio in requested window")

    c = types.ModuleType("c"); c.Conversation = Conv
    a = types.ModuleType("a"); a.claim_capture_window = claim
    for k, v in {"backend.models": types.ModuleType("backend.models"), "backend.models.conversation": c,
                 "backend.services": types.ModuleType("backend.services"),
                 "backend.services.audio_claims": a}.items():
        monkeypatch.setitem(sys.modules, k, v)
    facts = run(lookup.fetch_facts(fx.CID, live_capture_session_id="sess-1"))
    assert facts["audio_ranges"] == []
    b, why = m.build_bundle(m.EVENT_STREAMING, fx.streaming_payload(), facts)
    assert b is None and "no audio_ranges" in why


def test_episode_event_queues_one_bundle_per_conversation(plugin):
    plugin._sender = FakeSender()
    run(plugin.on_conversation_complete(
        PluginContext("u1", "conversation.complete", fx.complete_payload_episode())))
    assert plugin._outbox.count() == 2


def test_handler_never_raises(plugin, monkeypatch):
    async def boom(cid, live_capture_session_id=None): raise RuntimeError("mongo down")
    monkeypatch.setattr(lookup, "fetch_facts", boom)
    plugin._sender = FakeSender()
    assert run(plugin.on_conversation_complete(
        PluginContext("u1", "conversation.complete", fx.complete_payload_upload()))) is None
    assert plugin._outbox.count() == 0


def test_sender_keeps_data_while_ledger_down_then_delivers(tmp_path):
    ob = Outbox(str(tmp_path))
    b, _ = m.build_bundle(m.EVENT_COMPLETE, fx.complete_payload_upload(), fx.facts())
    ob.put("k", b)
    state = {"up": False, "got": []}

    async def post(bundle):
        if not state["up"]:
            return False
        state["got"].append(bundle)
        return True

    s = Sender(ob, post, base_delay=0.01)
    assert run(s.drain_once()) is False and ob.count() == 1   # ledger down: kept
    state["up"] = True
    assert run(s.drain_once()) is True and ob.count() == 0    # ledger back: delivered, removed
    assert state["got"] == [b]


def test_outbox_survives_restart_and_is_bounded(tmp_path):
    ob = Outbox(str(tmp_path), max_items=2)
    for i in range(4):
        ob.put(f"k{i}", {"i": i})
    assert ob.count() == 2
    assert Outbox(str(tmp_path)).count() == 2  # a new process sees the same files


def test_outbox_remove_keeps_newer_bundle(tmp_path):
    ob = Outbox(str(tmp_path))
    ob.put("k", {"v": 1})
    ob.put("k", {"v": 2})          # replaced while v1 was in flight
    ob.remove("k", {"v": 1})
    assert [b for _, b in ob.pending()] == [{"v": 2}]


def test_normalize_conversation_from_document_like_object():
    from types import SimpleNamespace as NS
    from datetime import datetime, timezone
    t = datetime(2026, 11, 14, 7, 30, tzinfo=timezone.utc)
    seg = NS(start=1.0, end=2.0, text="hi", speaker="Speaker 0", identified_as=None,
             confidence=0.9, segment_type=NS(value="speech"))
    conv = NS(conversation_id="c1", client_id="dev", started_at=t, ended_at=t, end_reason=NS(value="user_stopped"),
              audio_ranges=[NS(started_at=t, ended_at=t.replace(minute=31), time_basis="captured",
                               capture_session_ids=["s"])],
              active_transcript=NS(version_id="v", created_at=t, provider="p", model="m", segments=[seg]))
    f = lookup.normalize_conversation(conv, "streaming")
    b, why = m.build_bundle(m.EVENT_COMPLETE, {}, f)
    assert why is None and b["transcripts"][0]["segments"][0]["start"] == "2026-11-14T07:30:01.000Z"
