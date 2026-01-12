#!/bin/bash
# find_keyword.sh - Search for existing Robot Framework keywords
# Usage: ./find_keyword.sh <search_term>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOURCES_DIR="${SCRIPT_DIR}/resources"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ $# -eq 0 ]; then
    echo "Usage: $0 <search_term>"
    echo ""
    echo "Example:"
    echo "  $0 config          # Find keywords related to 'config'"
    echo "  $0 'Get Service'   # Find keywords starting with 'Get Service'"
    echo "  $0 backup          # Find backup-related keywords"
    echo ""
    exit 1
fi

SEARCH_TERM="$1"

echo -e "${BLUE}🔍 Searching for keywords matching: '${SEARCH_TERM}'${NC}"
echo ""

# Function to extract keyword name and documentation
extract_keywords() {
    local file="$1"
    local basename=$(basename "$file")

    # Use awk to extract keyword names and their documentation
    awk -v file="$basename" '
        /^\*\*\* Keywords \*\*\*/ { in_keywords=1; next }
        /^\*\*\* / && !/^\*\*\* Keywords \*\*\*/ { in_keywords=0 }
        in_keywords && /^[A-Z]/ && !/^    / && !/^\[/ {
            keyword=$0
            getline
            if ($0 ~ /\[Documentation\]/) {
                sub(/^[[:space:]]*\[Documentation\][[:space:]]*/, "")
                doc=$0
                print file ":::" keyword ":::" doc
            } else {
                print file ":::" keyword ":::No documentation"
            }
        }
    ' "$file"
}

# Search in keyword index first
if grep -qi "$SEARCH_TERM" "$RESOURCES_DIR/KEYWORD_INDEX.md" 2>/dev/null; then
    echo -e "${GREEN}✓ Found in KEYWORD_INDEX.md:${NC}"
    echo ""
    grep -i "$SEARCH_TERM" "$RESOURCES_DIR/KEYWORD_INDEX.md" | head -10
    echo ""
    echo "---"
    echo ""
fi

# Search in all robot files
echo -e "${GREEN}✓ Searching in keyword files:${NC}"
echo ""

FOUND=0

for robot_file in "$RESOURCES_DIR"/*.robot; do
    if [ -f "$robot_file" ]; then
        # Extract keywords and search
        while IFS=':::' read -r file keyword doc; do
            if echo "$keyword" | grep -qi "$SEARCH_TERM"; then
                FOUND=$((FOUND + 1))
                echo -e "${YELLOW}📌 Keyword:${NC} $keyword"
                echo -e "   ${BLUE}File:${NC} $file"
                echo -e "   ${BLUE}Doc:${NC} $doc"
                echo ""
            fi
        done < <(extract_keywords "$robot_file")
    fi
done

if [ $FOUND -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No keywords found matching '${SEARCH_TERM}'${NC}"
    echo ""
    echo "Suggestions:"
    echo "  1. Check KEYWORD_INDEX.md for similar keywords"
    echo "  2. Try a different search term"
    echo "  3. Create a new keyword if truly needed"
    echo ""
else
    echo -e "${GREEN}✓ Found $FOUND keyword(s)${NC}"
    echo ""
    echo "To see full documentation:"
    echo "  cat $RESOURCES_DIR/<file>.robot"
    echo ""
fi
