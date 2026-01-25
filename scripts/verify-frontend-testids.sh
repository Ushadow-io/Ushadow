#!/bin/bash
#
# Verify Frontend Test IDs
#
# This script checks that all interactive frontend elements have data-testid attributes.
# Run this after making frontend changes to ensure test automation requirements are met.
#
# Usage:
#   ./scripts/verify-frontend-testids.sh [file1.tsx file2.tsx ...]
#
# If no files are specified, checks all modified .tsx files in git.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check a single file for interactive elements without data-testid
check_file() {
    local file=$1
    local issues=0

    echo "Checking $file..."

    # Define patterns for interactive elements that MUST have data-testid
    local patterns=(
        '<button[^>]*>'
        '<input[^>]*>'
        '<select[^>]*>'
        '<textarea[^>]*>'
        '<a[^>]*href'
        'onClick='
        'onChange='
        'onSubmit='
    )

    for pattern in "${patterns[@]}"; do
        # Find lines matching the pattern
        while IFS= read -r line_num; do
            # Get the actual line content
            line=$(sed -n "${line_num}p" "$file")

            # Check if line has data-testid
            if ! echo "$line" | grep -q 'data-testid'; then
                echo -e "${RED}✗${NC} Line $line_num: Missing data-testid"
                echo "  $line"
                ((issues++))
            fi
        done < <(grep -n "$pattern" "$file" | cut -d: -f1 || true)
    done

    return $issues
}

# Main script
main() {
    local total_issues=0
    local files_to_check=()

    # If files provided as arguments, use those
    if [ $# -gt 0 ]; then
        files_to_check=("$@")
    else
        # Otherwise, check git-modified .tsx files
        echo "No files specified, checking git-modified .tsx files..."
        mapfile -t files_to_check < <(git diff --name-only --diff-filter=ACM | grep '\.tsx$' || true)

        # Also check staged files
        mapfile -t -O "${#files_to_check[@]}" files_to_check < <(git diff --cached --name-only --diff-filter=ACM | grep '\.tsx$' || true)
    fi

    # Remove duplicates
    files_to_check=($(echo "${files_to_check[@]}" | tr ' ' '\n' | sort -u))

    if [ ${#files_to_check[@]} -eq 0 ]; then
        echo -e "${YELLOW}No .tsx files to check${NC}"
        exit 0
    fi

    echo "Checking ${#files_to_check[@]} files for data-testid attributes..."
    echo

    for file in "${files_to_check[@]}"; do
        # Skip if file doesn't exist or isn't in frontend directory
        if [ ! -f "$file" ] || [[ ! "$file" =~ frontend/src/ ]]; then
            continue
        fi

        if check_file "$file"; then
            total_issues=$((total_issues + $?))
        fi
    done

    echo
    if [ $total_issues -eq 0 ]; then
        echo -e "${GREEN}✓ All checked files have proper data-testid attributes!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Found $total_issues interactive elements missing data-testid${NC}"
        echo
        echo "Please add data-testid attributes to all interactive elements:"
        echo "  <button data-testid=\"submit-button\">Submit</button>"
        echo "  <input data-testid=\"email-field\" type=\"email\" />"
        echo
        echo "See CLAUDE.md for naming conventions."
        exit 1
    fi
}

main "$@"
