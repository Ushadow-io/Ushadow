#!/usr/bin/env bash
# Register existing launcher-created worktrees with workmux for dashboard visibility
# This is a one-time migration script

set -euo pipefail

WORKTREES_DIR="/Users/stu/repos/worktrees/ushadow"
MAIN_REPO="/Users/stu/repos/Ushadow"

echo "🔄 Registering existing worktrees with workmux..."
echo ""

# Counter for stats
registered=0
skipped=0
failed=0

# Iterate through all worktree directories
for worktree_path in "$WORKTREES_DIR"/*; do
    # Skip if not a directory
    if [[ ! -d "$worktree_path" ]]; then
        continue
    fi

    # Get the worktree name (directory basename)
    worktree_name=$(basename "$worktree_path")

    # Skip special directories
    if [[ "$worktree_name" == "." || "$worktree_name" == ".." || "$worktree_name" == ".DS_Store" || "$worktree_name" == ".serena" ]]; then
        continue
    fi

    # Check if it's actually a git worktree (linked worktrees have .git as a file, not directory)
    if [[ ! -e "$worktree_path/.git" ]]; then
        echo "⚠️  Skipping $worktree_name (not a git worktree)"
        ((skipped++))
        continue
    fi

    echo "📝 Registering: $worktree_name"

    # Register with workmux (by default, it doesn't run hooks or file operations)
    if (cd "$worktree_path" && workmux open "$worktree_name" 2>&1 | grep -q "Opened tmux window"); then
        echo "   ✅ Successfully registered"
        ((registered++))
    else
        echo "   ❌ Failed to register"
        ((failed++))
    fi
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Registration Summary:"
echo "   ✅ Registered: $registered"
echo "   ⚠️  Skipped:    $skipped"
echo "   ❌ Failed:     $failed"
echo ""
echo "💡 Run 'workmux dashboard' to see your worktrees!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
