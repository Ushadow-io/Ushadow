"""FastAPI app. `create_app(settings, deps)`: tests pass in-memory deps; the service builds
them from the environment at startup."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from memory_service.config import Settings, load_settings
from memory_service.routers.memory import router
from memory_service.services.deps import Deps
from memory_service.services.port import MemoryPort
from memory_service.wiring import build_deps


def create_app(settings: Settings | None = None, deps: Deps | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> Any:
        if getattr(app.state, "port", None) is None:
            app.state.port = MemoryPort(await build_deps(settings))
        yield

    app = FastAPI(title="Ushadow memory", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.port = MemoryPort(deps) if deps is not None else None

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(router)
    return app


def app_factory() -> FastAPI:
    return create_app()
