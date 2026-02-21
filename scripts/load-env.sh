#!/bin/bash
# Load environment variables from .env file
# Usage: source scripts/load-env.sh

if [ ! -f .env ]; then
  echo "❌ .env file not found"
  return 1 2>/dev/null || exit 1
fi

# Export all non-comment, non-empty lines from .env
set -a
source <(grep -v '^#' .env | grep -v '^$' | sed 's/\r$//')
set +a

echo "✅ Environment loaded from .env"
echo "   K8S_REGISTRY: ${K8S_REGISTRY}"
echo "   ENV_NAME: ${ENV_NAME}"
echo "   BACKEND_PORT: ${BACKEND_PORT}"
