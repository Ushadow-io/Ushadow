FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    LEDGER_PORT=8200

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev

EXPOSE 8200

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://localhost:{os.environ.get(\"LEDGER_PORT\", \"8200\")}/health')"

# --no-access-log: query strings carry userId and search text (read API).
CMD ["sh", "-c", "exec /app/.venv/bin/uvicorn ledger.main:app --host 0.0.0.0 --port ${LEDGER_PORT} --no-access-log"]
