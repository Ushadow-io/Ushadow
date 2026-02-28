#!/bin/bash
# Fix Docker network state issues
# Resolves "network not found" errors when containers reference deleted networks

set -e

echo "🔧 Docker Network Fix Utility"
echo "=============================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

echo -e "${BLUE}Step 1: Checking current network state...${NC}"
echo "----------------------------------------"

# List current networks
echo "Current networks:"
docker network ls
echo ""

# Check for containers with network issues
echo "Checking containers..."
BROKEN_CONTAINERS=$(docker ps -a --filter "status=created" --filter "status=exited" --format "{{.Names}}" | grep -E "mongo|redis|qdrant" || true)

if [ -n "$BROKEN_CONTAINERS" ]; then
    echo -e "${YELLOW}⚠ Found containers with potential issues:${NC}"
    echo "$BROKEN_CONTAINERS"
else
    echo -e "${GREEN}✓ No problematic containers found${NC}"
fi
echo ""

echo -e "${BLUE}Step 2: Cleaning up...${NC}"
echo "----------------------------------------"

# Stop all Ushadow containers
echo "Stopping Ushadow containers..."
docker compose down 2>/dev/null || true
docker compose -f compose/docker-compose.infra.yml down 2>/dev/null || true

echo -e "${GREEN}✓ Containers stopped${NC}"
echo ""

# Remove problematic containers if they exist
if [ -n "$BROKEN_CONTAINERS" ]; then
    echo "Removing problematic containers..."
    for container in $BROKEN_CONTAINERS; do
        echo "  - Removing $container"
        docker rm -f "$container" 2>/dev/null || true
    done
    echo -e "${GREEN}✓ Problematic containers removed${NC}"
    echo ""
fi

# Remove old networks
echo "Removing old networks..."
docker network rm ushadow-network 2>/dev/null || echo "  (ushadow-network not found)"
docker network rm infra-network 2>/dev/null || echo "  (infra-network not found)"
docker network rm chronicle-network 2>/dev/null || echo "  (chronicle-network not found)"

# Prune unused networks
echo "Pruning unused networks..."
docker network prune -f
echo -e "${GREEN}✓ Old networks removed${NC}"
echo ""

echo -e "${BLUE}Step 3: Creating fresh networks using DockerNetworkManager...${NC}"
echo "----------------------------------------"

# Use the Python DockerNetworkManager to create networks
# This ensures consistency with the rest of the application
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "Using setup/docker_utils.py to create networks..."
python3 -c "
import sys
sys.path.insert(0, 'setup')
from docker_utils import DockerNetworkManager

results = DockerNetworkManager.ensure_networks()

for network, success in results.items():
    status = '✓' if success else '✗'
    print(f'  {status} {network}')

if all(results.values()):
    sys.exit(0)
else:
    sys.exit(1)
"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Networks created successfully${NC}"
else
    echo -e "${YELLOW}⚠ Some networks may already exist or failed to create${NC}"
fi

echo ""

echo -e "${BLUE}Step 4: Verifying networks...${NC}"
echo "----------------------------------------"

# Verify networks exist using Python
python3 -c "
import sys
sys.path.insert(0, 'setup')
from docker_utils import DockerNetworkManager

all_exist = True
for network in DockerNetworkManager.NETWORKS.keys():
    exists = DockerNetworkManager.network_exists(network)
    status = '✓' if exists else '✗'
    color = '\033[0;32m' if exists else '\033[0;31m'
    print(f'{color}{status} {network} exists\033[0m')
    if not exists:
        all_exist = False

sys.exit(0 if all_exist else 1)
"

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}⚠ Some networks are missing${NC}"
fi

echo ""

echo "Current networks:"
docker network ls
echo ""

echo "=============================="
echo -e "${GREEN}✅ Network fix complete!${NC}"
echo "=============================="
echo ""
echo "Next steps:"
echo "  1. Run: ./go.sh         # Start application"
echo "  2. Or:  ./dev.sh        # Start in dev mode"
echo ""
echo "If issues persist:"
echo "  - Check Docker logs: docker compose logs"
echo "  - Full rebuild: docker compose build --no-cache"
echo "  - Report issue: https://github.com/Ushadow-io/Ushadow/issues"
echo ""
