FROM python:3.12-slim

WORKDIR /app

# Install uv for fast Python package management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Install dependencies
COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

# Copy application
COPY manager.py telemetry.py ./

# Run as non-root user (but needs docker group access)
# Note: Docker socket access requires mounting with correct permissions

ENV PYTHONUNBUFFERED=1

CMD ["python", "manager.py"]
