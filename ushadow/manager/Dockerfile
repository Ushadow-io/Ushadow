FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY manager.py .

# Run as non-root user (but needs docker group access)
# Note: Docker socket access requires mounting with correct permissions

ENV PYTHONUNBUFFERED=1

CMD ["python", "manager.py"]
