FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY main.py models.py ./

# Expose port
EXPOSE 8000

# Run gateway
CMD ["python", "main.py"]
