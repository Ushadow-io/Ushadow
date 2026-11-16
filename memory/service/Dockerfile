FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    GRAPHITI_TELEMETRY_ENABLED=false \
    MEMORY_PORT=8210

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --extra graphiti --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev --extra graphiti

EXPOSE 8210

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"MEMORY_PORT\", \"8210\")}/health')"

# --no-access-log: request lines carry userId and search text in the query string.
CMD ["sh", "-c", "exec /app/.venv/bin/uvicorn memory_service.main:app_factory --factory --host 0.0.0.0 --port ${MEMORY_PORT} --no-access-log"]
