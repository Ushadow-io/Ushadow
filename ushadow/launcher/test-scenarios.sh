#!/bin/bash
# Test scenarios for launcher development

cd "$(dirname "$0")"

echo "Launcher Test Scenarios"
echo "======================="
echo ""
echo "Select a test scenario:"
echo "1. Fresh install (no Docker, no Git, no Tailscale)"
echo "2. Docker installed but not running (Git installed)"
echo "3. Docker running, no Tailscale (Git installed)"
echo "4. Everything ready (all prerequisites installed)"
echo "5. Custom (edit .env.local manually)"
echo ""
read -p "Enter choice (1-5): " choice

case $choice in
  1)
    echo "Testing: Fresh install scenario"
    export MOCK_MODE=true
    export MOCK_DOCKER_INSTALLED=false
    export MOCK_DOCKER_RUNNING=false
    export MOCK_GIT_INSTALLED=false
    export MOCK_TAILSCALE_INSTALLED=false
    ;;
  2)
    echo "Testing: Docker installed but not running"
    export MOCK_MODE=true
    export MOCK_DOCKER_INSTALLED=true
    export MOCK_DOCKER_RUNNING=false
    export MOCK_GIT_INSTALLED=true
    export MOCK_TAILSCALE_INSTALLED=false
    ;;
  3)
    echo "Testing: Docker running, no Tailscale"
    export MOCK_MODE=true
    export MOCK_DOCKER_INSTALLED=true
    export MOCK_DOCKER_RUNNING=true
    export MOCK_GIT_INSTALLED=true
    export MOCK_TAILSCALE_INSTALLED=false
    ;;
  4)
    echo "Testing: Everything ready"
    export MOCK_MODE=true
    export MOCK_DOCKER_INSTALLED=true
    export MOCK_DOCKER_RUNNING=true
    export MOCK_GIT_INSTALLED=true
    export MOCK_TAILSCALE_INSTALLED=true
    ;;
  5)
    echo "Using custom .env.local configuration"
    if [ -f .env.local ]; then
      source .env.local
    else
      echo "No .env.local found. Create one from .env.test"
      exit 1
    fi
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "Running launcher in dev mode with:"
echo "  MOCK_MODE=$MOCK_MODE"
echo "  MOCK_DOCKER_INSTALLED=$MOCK_DOCKER_INSTALLED"
echo "  MOCK_DOCKER_RUNNING=$MOCK_DOCKER_RUNNING"
echo "  MOCK_GIT_INSTALLED=$MOCK_GIT_INSTALLED"
echo "  MOCK_TAILSCALE_INSTALLED=$MOCK_TAILSCALE_INSTALLED"
echo ""

npm run dev
