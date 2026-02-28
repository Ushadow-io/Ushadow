# UV - pinned to linux/amd64 so Windows Docker Desktop doesn't pull the
# Windows variant of the uv image and copy a .exe into the Linux container
FROM --platform=linux/amd64 ghcr.io/astral-sh/uv:latest AS uv

FROM python:3.12-slim

# Copy uv binary from official image (more reliable than curl|sh installer)
COPY --from=uv /uv /uvx /bin/

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

# Copy application
COPY manager.py telemetry.py ./

# Run as non-root user (but needs docker group access)
# Note: Docker socket access requires mounting with correct permissions

ENV PYTHONUNBUFFERED=1

CMD ["python", "manager.py"]
