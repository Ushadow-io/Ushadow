#!/bin/bash
# TDD Verification Script
#
# This script helps verify that TDD process was followed
# Can be used in:
# - Pre-commit hooks
# - CI/CD pipelines
# - Manual verification before PR creation

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Verifying TDD Process..."
echo ""

# Function to check if commit follows TDD
check_commit_tdd() {
    local commit_sha=$1
    local commit_msg=$(git log -1 --pretty=%B "$commit_sha")

    # Check if this commit modified test files
    local test_files_changed=$(git diff-tree --no-commit-id --name-only -r "$commit_sha" | grep -E "(test|spec)" || true)

    # Check if this commit modified source files
    local src_files_changed=$(git diff-tree --no-commit-id --name-only -r "$commit_sha" | grep -vE "(test|spec)" | grep -E "\.(rs|ts|tsx|py)$" || true)

    if [[ -n "$test_files_changed" && -n "$src_files_changed" ]]; then
        echo -e "${YELLOW}⚠️  Warning: Commit modifies both tests and source code${NC}"
        echo "   Commit: $commit_sha"
        echo "   Message: $commit_msg"
        echo ""
        echo "   TDD best practice: Separate commits for:"
        echo "   1. Add failing test"
        echo "   2. Fix to make test pass"
        echo "   3. Refactoring"
        echo ""
        return 1
    fi

    return 0
}

# Function to check test coverage
check_test_coverage() {
    echo "📊 Checking test coverage..."

    # For Rust projects
    if [ -f "Cargo.toml" ]; then
        echo "  Running Rust tests..."
        cargo test --all 2>&1 | tee /tmp/test_output.txt

        # Check if any tests failed
        if grep -q "test result: FAILED" /tmp/test_output.txt; then
            echo -e "${RED}❌ Tests failed!${NC}"
            return 1
        fi

        echo -e "${GREEN}✅ All Rust tests passed${NC}"
    fi

    echo ""
    return 0
}

# Function to verify tests exist for changed files
verify_tests_exist() {
    echo "🔎 Verifying tests exist for changed files..."

    # Get changed source files (not tests)
    local changed_files=$(git diff --name-only HEAD^ HEAD | grep -E "\.(rs|ts|tsx|py)$" | grep -vE "(test|spec)" || true)

    if [ -z "$changed_files" ]; then
        echo "  No source files changed"
        return 0
    fi

    local missing_tests=0

    while IFS= read -r file; do
        if [ -z "$file" ]; then
            continue
        fi

        # For Rust files, check for corresponding test
        if [[ "$file" == *.rs ]]; then
            local test_file=$(echo "$file" | sed 's/src\//tests\//g')
            local test_file_alt=$(echo "$file" | sed 's/\.rs/_tests.rs/g')

            if [ ! -f "$test_file" ] && [ ! -f "$test_file_alt" ] && ! grep -q "#\[cfg(test)\]" "$file"; then
                echo -e "${YELLOW}  ⚠️  No tests found for: $file${NC}"
                missing_tests=$((missing_tests + 1))
            fi
        fi
    done <<< "$changed_files"

    if [ $missing_tests -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}⚠️  $missing_tests file(s) changed without corresponding tests${NC}"
        echo "  Consider adding tests following TDD process:"
        echo "  1. Write failing test first"
        echo "  2. Implement feature"
        echo "  3. Verify test passes"
        return 1
    fi

    echo -e "${GREEN}✅ All changed files have tests${NC}"
    echo ""
    return 0
}

# Main execution
main() {
    local exit_code=0

    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        echo -e "${RED}❌ Not a git repository${NC}"
        exit 1
    fi

    # Run checks
    if ! check_test_coverage; then
        exit_code=1
    fi

    if ! verify_tests_exist; then
        exit_code=1
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✅ TDD verification passed!${NC}"
        echo ""
        echo "Remember: Write tests FIRST, then implement!"
    else
        echo -e "${YELLOW}⚠️  TDD verification completed with warnings${NC}"
        echo ""
        echo "See docs/TDD_PROCESS.md for guidelines"
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    return $exit_code
}

# Run main function
main
