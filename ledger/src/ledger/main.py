"""Ledger FastAPI app. Standalone: imports nothing from ushadow/backend."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from starlette.routing import Route

from ledger.config import load_settings
from ledger.mcp_server import MCP_PATH, build_mcp
from ledger.routers import conversations, health, read, read_api, write
from ledger.services import Services, build_services
from ledger.stores import build_stores, ensure_indexes

log = logging.getLogger("ledger")

SWEEP_SECONDS = 30


async def _sweep_loop(services: Services) -> None:
    """Close held-back moments of live recordings that went quiet; then, when a model is
    configured (or LEDGER_PIPELINE_AUTO=1), build conversations for moments marked ready."""
    auto = services.models.configured or os.environ.get("LEDGER_PIPELINE_AUTO") == "1"
    while True:
        await asyncio.sleep(SWEEP_SECONDS)
        try:
            await services.moments.sweep()
            if auto:
                await services.conversations.pipeline.sweep()
        except Exception:  # keep the loop alive; the next tick tries again
            log.exception("sweep failed")


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
        async with mcp.session_manager.run():
            yield
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        if client:
            client.close()

    app = FastAPI(title="Ushadow Ledger", version="0.2.0", lifespan=lifespan)
    app.include_router(health.router)
    app.include_router(read.router)
    app.include_router(write.router)
    app.include_router(conversations.router)
    app.include_router(read_api.router)
    mcp, mcp_app = build_mcp(lambda: app.state.services)
    app.state.mcp = mcp
    app.router.routes.append(Route(MCP_PATH, endpoint=mcp_app, methods=["GET", "POST", "DELETE"]))
    return app


app = create_app()


def run() -> None:  # pragma: no cover
    import uvicorn

    uvicorn.run("ledger.main:app", host="0.0.0.0", port=load_settings().port, access_log=False)
