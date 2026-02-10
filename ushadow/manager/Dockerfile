FROM python:3.12-slim

WORKDIR /app

# Install uv via installer script (works on both Linux and Windows)
RUN apt-get update && apt-get install -y curl && \
    curl -LsSf https://astral.sh/uv/install.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Add uv to PATH
ENV PATH="/root/.local/bin:$PATH"

# Install dependencies
COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

# Copy application
COPY manager.py telemetry.py ./

# Run as non-root user (but needs docker group access)
# Note: Docker socket access requires mounting with correct permissions

ENV PYTHONUNBUFFERED=1

CMD ["python", "manager.py"]
