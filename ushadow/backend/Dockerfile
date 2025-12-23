# ushadow Backend Dockerfile
# FastAPI-based orchestration API

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (default 8010, override with PORT env var)
EXPOSE 8010

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8010}/health || exit 1

# Run the application (port from env var)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8010} --reload
