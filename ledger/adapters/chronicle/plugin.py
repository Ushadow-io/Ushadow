"""Chronicle plugin `ledger_adapter`: forwards conversations to the Ushadow ledger.

Lives outside the Chronicle repo, mounted via PLUGINS_DIR. See README.md.
Never raises into Chronicle: every handler catches everything and returns None
(= "I decline", the chain continues).
"""

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

from backend.plugins.base import BasePlugin, PluginContext, PluginResult

from . import lookup, mapping
from .outbox import Outbox
from .sender import Sender, make_http_post

logger = logging.getLogger(__name__)

LOOKUP_TIMEOUT_SECONDS = 5.0


def _unset(v: Any) -> bool:
    """Chronicle leaves '${VAR}' in place when the variable is unset."""
    return not v or "${" in str(v)


class LedgerAdapterPlugin(BasePlugin):
    SUPPORTED_ACCESS_LEVELS: List[str] = ["transcript", "conversation"]

    name = "Ledger Adapter"
    description = "Sends conversations (recordings + transcripts, absolute times) to the Ushadow ledger"

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        url = config.get("ledger_url")
        self.ledger_url = os.getenv("LEDGER_URL", "http://ledger:8200") if _unset(url) else url
        self.timeout = float(config.get("timeout_seconds") or 10)
        token = config.get("ledger_token")
        self.token = "" if _unset(token) else str(token)
        self.outbox_dir = config.get("outbox_dir") or "/app/debug/ledger_outbox"
        self.outbox_max = int(config.get("outbox_max_items") or 5000)
        owners = config.get("owner_names") or []
        self.owner_names = [o.strip() for o in owners.split(",")] if isinstance(owners, str) else list(owners)
        self.owner_names = [o for o in self.owner_names if o and "${" not in o]
        self._outbox: Optional[Outbox] = None
        self._sender: Optional[Sender] = None
        self._post = None
        self._sent: Dict[str, Dict[str, str]] = {}  # conversation_id -> live segment hashes

    async def initialize(self):
        self._outbox = Outbox(self.outbox_dir, self.outbox_max)
        self._post = make_http_post(self.ledger_url, self.timeout, self.token)
        self._sender = Sender(self._outbox, self._post)
        self._sender.start()  # also flushes leftovers from before a restart
        logger.info("ledger_adapter: ready (ledger=%s, outbox=%s, pending=%d)",
                    self.ledger_url, self.outbox_dir, self._outbox.count())

    async def cleanup(self):
        if self._sender:
            await self._sender.stop()
        close = getattr(self._post, "aclose", None)
        if close:
            try:
                await close()
            except Exception:
                pass

    async def health_check(self) -> Dict[str, Any]:
        pending = self._outbox.count() if self._outbox else -1
        return {"ok": True, "message": f"outbox pending={pending}, ledger={self.ledger_url}"}

    # --- event handlers -------------------------------------------------

    async def on_transcript(self, context: PluginContext) -> Optional[PluginResult]:
        """transcript.streaming and transcript.batch."""
        return await self._handle(context)

    async def on_conversation_complete(self, context: PluginContext) -> Optional[PluginResult]:
        return await self._handle(context)

    def _remember(self, cid: str, state: Dict[str, str]) -> None:
        self._sent[cid] = state
        while len(self._sent) > 200:  # bounded: drop the oldest conversation
            self._sent.pop(next(iter(self._sent)))

    def _request(self, event: str, data: Dict[str, Any], facts: Dict[str, Any], context: Any):
        """(bundle, {userId, bundle}, reason). The owner is the conversation's account."""
        bundle, reason = mapping.build_bundle(event, data, facts, self.owner_names)
        if bundle is None:
            return None, None, reason
        owner = facts.get("user_id") or getattr(context, "user_id", None)
        request, reason = mapping.ingest_request(owner, bundle)
        return bundle, request, reason

    async def _handle(self, context: PluginContext) -> Optional[PluginResult]:
        try:
            event = str(getattr(context.event, "value", context.event))
            data = context.data or {}
            queued = 0
            ids = mapping.conversation_ids(event, data)
            if not ids:
                logger.info("ledger_adapter: %s without conversation_id (session %s): nothing sent",
                            event, data.get("session_id"))
            for cid in ids:
                live_sid = (data.get("capture_session_id")
                            if event == mapping.EVENT_STREAMING
                            and data.get("timestamp_clock") == "conversation" else None)
                facts = await asyncio.wait_for(
                    lookup.fetch_facts(cid, live_capture_session_id=live_sid), LOOKUP_TIMEOUT_SECONDS)
                if facts is None:
                    logger.info("ledger_adapter: %s %s: conversation not found, nothing sent", event, cid[:12])
                    continue
                # for batch/streaming the payload names exactly one conversation
                item_data = {**data, "conversation_id": cid} if event != mapping.EVENT_COMPLETE else data
                new_state = None
                if event == mapping.EVENT_STREAMING:  # send only new/changed live segments
                    delta, new_state = mapping.new_or_changed(
                        item_data.get("segments") or [], self._sent.get(cid, {}))
                    if not delta:
                        continue
                    item_data = {**item_data, "segments": delta}
                bundle, request, reason = self._request(event, item_data, facts, context)
                if request is None:
                    logger.info("ledger_adapter: %s %s: nothing sent: %s", event, cid[:12], reason)
                    continue
                rec = bundle["recordings"][0]["id"]
                rev = bundle["transcripts"][0]["revision"]
                if new_state is not None:
                    # deltas must not overwrite each other: key by content, not just rev
                    first = bundle["transcripts"][0]["segments"][0]["id"]
                    last = bundle["transcripts"][0]["segments"][-1]["id"]
                    self._remember(cid, new_state)
                    self._outbox.put(f"{rec}|{rev}|{first}|{last}|{len(bundle['transcripts'][0]['segments'])}", request)
                else:
                    self._sent.pop(cid, None)  # final data supersedes the live state
                    self._outbox.put(f"{rec}|{rev}", request)
                queued += 1
            if queued:
                self._sender.notify()
        except Exception as e:  # never break Chronicle
            logger.error("ledger_adapter: handler failed for %s: %s", context.event, e, exc_info=True)
        return None  # decline: let the chain continue
