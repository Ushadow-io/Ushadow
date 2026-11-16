"""Ledger FastAPI app. Standalone: imports nothing from ushadow/backend."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from ledger.config import load_settings
from ledger.routers import read, write
from ledger.services import Services, build_services
from ledger.stores import build_stores, ensure_indexes

log = logging.getLogger("ledger")

SWEEP_SECONDS = 30


async def _sweep_loop(services: Services) -> None:
    """Close held-back moments of live recordings that went quiet."""
    while True:
        await asyncio.sleep(SWEEP_SECONDS)
        try:
            await services.moments.sweep()
        except Exception:  # keep the loop alive; the next tick tries again
            log.exception("moment sweep failed")


def create_app(db: Any = None, sweep: bool = True) -> FastAPI:
    """db: a Motor database. When None, connect with LEDGER_MONGO_URI / LEDGER_DB."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        database = db
        client = None
        if database is None:
            from motor.motor_asyncio import AsyncIOMotorClient

            settings = load_settings()
            client = AsyncIOMotorClient(settings.mongo_uri)
            database = client[settings.db_name]
        await ensure_indexes(database)
        app.state.services = build_services(build_stores(database))
        task = asyncio.create_task(_sweep_loop(app.state.services)) if sweep else None
        yield
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        if client:
            client.close()

    app = FastAPI(title="Ushadow Ledger", version="0.1.0", lifespan=lifespan)
    app.include_router(read.router)
    app.include_router(write.router)
    return app


app = create_app()


def run() -> None:  # pragma: no cover
    import uvicorn

    uvicorn.run("ledger.main:app", host="0.0.0.0", port=load_settings().port)
