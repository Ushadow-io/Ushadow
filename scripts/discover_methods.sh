#!/bin/bash
#
# discover_methods.sh - Quick method discovery for agents
#
# Usage:
#   ./scripts/discover_methods.sh docker        # Find docker-related methods
#   ./scripts/discover_methods.sh get_status    # Find all get_status methods
#   ./scripts/discover_methods.sh list          # List all services
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

show_usage() {
    echo "Usage: $0 <search_term|list>"
    echo ""
    echo "Examples:"
    echo "  $0 docker           # Find docker-related services"
    echo "  $0 get_status       # Find all get_status methods"
    echo "  $0 kubernetes       # Find kubernetes-related services"
    echo "  $0 list             # List all available services"
    echo ""
}

list_services() {
    echo -e "${GREEN}=== Available Backend Services ===${NC}\n"

    if [ -f "backend_index.py" ]; then
        python3 backend_index.py
    else
        echo "backend_index.py not found. Listing services directly..."
        echo ""
        echo "Managers:"
        find . -path "*/services/*_manager.py" -exec basename {} .py \; | sort
        echo ""
        echo "Services:"
        find . -path "*/services/*.py" ! -name "*_manager.py" ! -name "__init__.py" -exec basename {} .py \; | sort
    fi
}

search_in_index() {
    local term="$1"
    echo -e "${GREEN}=== Searching backend_index.py for: $term ===${NC}\n"

    if [ -f "backend_index.py" ]; then
        grep -A 15 -i "$term" backend_index.py || echo "No matches in backend_index.py"
    else
        echo "backend_index.py not found"
    fi
}

search_in_code() {
    local term="$1"
    echo -e "\n${GREEN}=== Searching actual code for: $term ===${NC}\n"

    # Search for class definitions
    echo -e "${YELLOW}Classes:${NC}"
    grep -rn "^class.*$term" --include="*.py" . 2>/dev/null | head -10 || echo "No classes found"

    # Search for async function definitions
    echo -e "\n${YELLOW}Async Methods/Functions:${NC}"
    grep -rn "async def.*$term" --include="*.py" . 2>/dev/null | head -10 || echo "No async methods found"

    # Search for regular function definitions
    echo -e "\n${YELLOW}Methods/Functions:${NC}"
    grep -rn "def.*$term" --include="*.py" . 2>/dev/null | grep -v "async def" | head -10 || echo "No methods found"
}

# Main logic
if [ $# -eq 0 ]; then
    show_usage
    exit 1
fi

case "$1" in
    list|ls)
        list_services
        ;;
    help|-h|--help)
        show_usage
        ;;
    *)
        search_in_index "$1"
        search_in_code "$1"

        echo -e "\n${BLUE}=== Next Steps ===${NC}"
        echo "1. Read relevant sections in backend_index.py"
        echo "2. Check ARCHITECTURE.md for layer rules"
        echo "3. Read BACKEND_QUICK_REF.md for patterns"
        echo "4. Only create new code if nothing suitable exists"
        ;;
esac
