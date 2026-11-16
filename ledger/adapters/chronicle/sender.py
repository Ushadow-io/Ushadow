"""Background sender: drains the outbox to the ledger with timeouts and backoff.

The plugin handler only writes to the outbox and sets an event; all network
work happens here, so a slow or dead ledger can never stall Chronicle's
plugin chain (the router awaits plugins one by one).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict

logger = logging.getLogger(__name__)

PostFn = Callable[[Dict[str, Any]], Awaitable[bool]]  # True = ledger accepted it


def make_http_post(ledger_url: str, timeout: float, token: str = "") -> PostFn:
    import httpx  # Chronicle depends on httpx (backend/pyproject.toml:20)

    url = ledger_url.rstrip("/") + "/ingest"
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    client = httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=min(timeout, 3.0)))

    async def post(bundle: Dict[str, Any]) -> bool:
        try:
            r = await client.post(url, json=bundle, headers=headers)
        except httpx.HTTPError as e:
            logger.warning("ledger_adapter: ledger unreachable: %s", type(e).__name__)
            return False
        if r.status_code < 300:
            return True
        if 400 <= r.status_code < 500 and r.status_code not in (408, 429):
            # Retrying cannot fix a rejected bundle. Surface loudly, drop it. The answer body is
            # not logged: a validation error echoes the input, i.e. transcript text.
            logger.error("ledger_adapter: ledger rejected bundle (%s)", r.status_code)
            return True
        logger.warning("ledger_adapter: ledger returned %s", r.status_code)
        return False

    post.aclose = client.aclose  # type: ignore[attr-defined]
    return post


class Sender:
    def __init__(self, outbox: Any, post: PostFn, base_delay: float = 1.0,
                 max_delay: float = 60.0, idle_poll: float = 30.0):
        self.outbox, self.post = outbox, post
        self.base_delay, self.max_delay, self.idle_poll = base_delay, max_delay, idle_poll
        self._wake = asyncio.Event()
        self._stop = False
        self._task: "asyncio.Task | None" = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="ledger_adapter_sender")
        self._wake.set()  # flush anything left from a previous run

    def notify(self) -> None:
        self._wake.set()

    async def stop(self) -> None:
        self._stop = True
        self._wake.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass

    async def drain_once(self) -> bool:
        """Try every pending bundle once. True if all were delivered."""
        for key, bundle in list(self.outbox.pending()):
            if not await self.post(bundle):
                return False
            self.outbox.remove(key, bundle)
        return True

    async def _run(self) -> None:
        delay = self.base_delay
        while not self._stop:
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=self.idle_poll)
            except asyncio.TimeoutError:
                pass
            self._wake.clear()
            while not self._stop:
                try:
                    ok = await self.drain_once()
                except Exception as e:  # never die: next wake retries
                    logger.error("ledger_adapter: sender error: %s", e, exc_info=True)
                    ok = False
                if ok:
                    delay = self.base_delay
                    break
                await asyncio.sleep(delay)  # backoff while the ledger is down
                delay = min(delay * 2, self.max_delay)
