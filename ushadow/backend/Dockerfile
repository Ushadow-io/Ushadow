# ushadow Backend Dockerfile
# FastAPI-based orchestration API

# ============================================================================
# Builder Stage - Install dependencies with build tools
# ============================================================================
FROM python:3.12-slim AS builder

WORKDIR /app

# Install system dependencies, build tools, Docker CLI, Tailscale, and uv
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libyaml-dev \
    curl \
    ca-certificates \
    gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-compose-plugin \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && ln -s /root/.local/bin/uv /usr/local/bin/uv \
    && ln -s /root/.local/bin/uvx /usr/local/bin/uvx \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first for better layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies with uv (frozen from lockfile)
# This creates a .venv directory with all dependencies
RUN uv sync --frozen --no-dev --no-install-project

# ============================================================================
# Runtime Stage - Minimal image with only runtime dependencies
# ============================================================================
FROM python:3.12-slim

WORKDIR /app

# Install runtime dependencies (curl for healthcheck and uv install, docker-cli for volume cleanup, tailscale)
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

# Install uv for running the app
# Using official installation script (recommended method)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    ln -s /root/.local/bin/uv /usr/local/bin/uv && \
    ln -s /root/.local/bin/uvx /usr/local/bin/uvx

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy dependency files (needed for uv run)
COPY pyproject.toml uv.lock ./

# Copy application code
COPY . .

# Expose port (default 8000, override with PORT env var)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Run the application (port from env var)
# Use uv run to execute within the virtual environment
# Note: compose/backend.yml masks /app/.venv with anonymous volume to prevent host venv triggering reloads
CMD uv run uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --reload
