#!/bin/bash
# Git Worktree Workflow Helper Scripts
# Usage: source this file or copy individual functions to your shell profile

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Integrate current branch into dev
integrate-to-dev() {
    local current_branch=$(git branch --show-current)

    if [ "$current_branch" = "dev" ] || [ "$current_branch" = "main" ]; then
        echo -e "${RED}Error: Already on $current_branch. Switch to a feature branch first.${NC}"
        return 1
    fi

    echo -e "${BLUE}Integrating ${current_branch} into dev...${NC}"

    # Save current work
    git push origin "$current_branch" || {
        echo -e "${RED}Failed to push current branch${NC}"
        return 1
    }

    # Switch to dev and update
    git checkout dev
    git pull origin dev

    # Merge feature branch
    git merge "$current_branch" --no-ff -m "Merge $current_branch into dev"

    # Push to remote
    git push origin dev

    echo -e "${GREEN}✓ Successfully integrated ${current_branch} into origin/dev${NC}"
    echo -e "${YELLOW}Other worktrees can now pull from origin/dev to get these changes${NC}"

    # Switch back
    git checkout "$current_branch"
}

# 2. Sync current worktree with latest dev
sync-from-dev() {
    local current_branch=$(git branch --show-current)

    if [ "$current_branch" = "dev" ]; then
        git pull origin dev
        echo -e "${GREEN}✓ Dev branch updated${NC}"
        return 0
    fi

    echo -e "${BLUE}Syncing ${current_branch} with origin/dev...${NC}"

    git fetch origin dev
    git merge origin/dev -m "Sync with dev"

    echo -e "${GREEN}✓ Synced with latest dev${NC}"
}

# 3. Create PR from dev to main
release-dev-to-main() {
    local title="$1"

    if [ -z "$title" ]; then
        echo -e "${RED}Usage: release-dev-to-main \"Release title\"${NC}"
        return 1
    fi

    # Ensure dev is up to date
    git checkout dev
    git pull origin dev

    # Create PR
    gh pr create --base main --head dev --title "$title" --body "$(cat <<EOF
## Changes

<!-- Describe the combined features being released -->

## Testing

<!-- How was this tested? -->

## Checklist

- [ ] All tests passing
- [ ] Documentation updated
- [ ] Breaking changes documented

🤖 Created via release-dev-to-main helper
EOF
)"

    echo -e "${GREEN}✓ PR created: dev → main${NC}"
}

# 4. Clean up merged branches
cleanup-merged() {
    echo -e "${BLUE}Cleaning up merged branches...${NC}"

    # Update remote tracking
    git fetch --prune origin

    # List gone branches
    echo -e "${YELLOW}Branches deleted from remote:${NC}"
    git branch -vv | grep ': gone]'

    # Prompt for deletion
    read -p "Delete these local branches? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git branch -vv | grep ': gone]' | awk '{print $1}' | xargs -r git branch -D
        echo -e "${GREEN}✓ Local branches cleaned up${NC}"
    fi
}

# 5. Status of all worktrees
worktree-status() {
    echo -e "${BLUE}=== Worktree Status ===${NC}\n"

    git worktree list | while read worktree_path commit branch; do
        echo -e "${GREEN}Worktree:${NC} $worktree_path"
        echo -e "${BLUE}Branch:${NC} $branch"

        # Check if branch has unpushed commits
        cd "$worktree_path" 2>/dev/null || continue

        local current_branch=$(git branch --show-current)
        local upstream=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null)

        if [ -n "$upstream" ]; then
            local ahead=$(git rev-list --count $upstream..HEAD)
            local behind=$(git rev-list --count HEAD..$upstream)

            if [ "$ahead" -gt 0 ]; then
                echo -e "${YELLOW}  ↑ $ahead commits ahead${NC}"
            fi
            if [ "$behind" -gt 0 ]; then
                echo -e "${YELLOW}  ↓ $behind commits behind${NC}"
            fi
            if [ "$ahead" -eq 0 ] && [ "$behind" -eq 0 ]; then
                echo -e "${GREEN}  ✓ Up to date${NC}"
            fi
        else
            echo -e "${RED}  ✗ No upstream tracking${NC}"
        fi

        # Check for uncommitted changes
        if [ -n "$(git status --porcelain)" ]; then
            echo -e "${YELLOW}  ⚠ Uncommitted changes${NC}"
        fi

        echo ""
        cd - > /dev/null
    done
}

# 6. Create new worktree from dev
new-worktree() {
    local branch_name="$1"
    local worktree_path="$2"

    if [ -z "$branch_name" ] || [ -z "$worktree_path" ]; then
        echo -e "${RED}Usage: new-worktree branch-name /path/to/worktree${NC}"
        echo -e "${YELLOW}Example: new-worktree vk/1234-my-feature /tmp/my-feature${NC}"
        return 1
    fi

    # Fetch latest dev
    git fetch origin dev

    # Create worktree
    git worktree add "$worktree_path" -b "$branch_name" origin/dev

    echo -e "${GREEN}✓ Created worktree at ${worktree_path}${NC}"
    echo -e "${BLUE}Branch ${branch_name} tracking origin/dev${NC}"
    echo -e "${YELLOW}cd ${worktree_path} to start working${NC}"
}

# 7. Quick git graph visualization
git-graph() {
    git log --oneline --graph --all --decorate -20
}

# 8. Create draft PR for current branch
create-draft-pr() {
    local title="$1"
    local current_branch=$(git branch --show-current)

    if [ -z "$title" ]; then
        echo -e "${RED}Usage: create-draft-pr \"Feature title\"${NC}"
        return 1
    fi

    # Push current branch
    git push origin "$current_branch"

    # Create draft PR
    gh pr create --base main --head "$current_branch" \
      --title "[WIP] $title" \
      --draft \
      --body "$(cat <<EOF
## Feature
<!-- Describe the feature -->

## Status
🚧 In Development
- [ ] Implementation
- [ ] Tests
- [ ] Integration testing in dev

## Testing Plan
Will test in dev with other features before review
EOF
)"

    echo -e "${GREEN}✓ Draft PR created for ${current_branch}${NC}"
    echo -e "${YELLOW}Don't forget to integrate-to-dev for testing!${NC}"
}

# 9. Mark PR ready for review
mark-pr-ready() {
    local current_branch=$(git branch --show-current)

    # Mark PR as ready
    gh pr ready

    echo -e "${GREEN}✓ PR marked ready for review${NC}"
    echo -e "${YELLOW}Update the PR description with test results:${NC}"
    echo -e "${BLUE}  gh pr edit --body \"...\"${NC}"
}

# 10. Sync dev with main (after PR merges)
sync-dev-with-main() {
    echo -e "${BLUE}Syncing dev with main...${NC}"

    git checkout dev
    git pull origin main
    git push origin dev

    echo -e "${GREEN}✓ Dev synced with main${NC}"
    echo -e "${YELLOW}Other worktrees can now sync-from-dev to get latest${NC}"
}

# 11. Show workflow help
workflow-help() {
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║           Git Worktree Workflow Helper Commands             ║
╚══════════════════════════════════════════════════════════════╝

📦 new-worktree <branch> <path>
   Create new worktree from origin/dev
   Example: new-worktree vk/1234-feature /tmp/my-feature

🔄 sync-from-dev
   Pull latest changes from origin/dev into current branch

⬆️  integrate-to-dev
   Merge current feature branch into origin/dev

📝 create-draft-pr "Feature title"
   Create draft PR to main, mark as work-in-progress

✅ mark-pr-ready
   Mark draft PR as ready for review

🔄 sync-dev-with-main
   Sync dev with main after a PR merges

🚀 release-dev-to-main "Release Title"
   Create PR from dev → main (rarely used, see PR-REVIEW-STRATEGY.md)

🧹 cleanup-merged
   Remove local branches that were deleted on remote

📊 worktree-status
   Show status of all worktrees (commits ahead/behind, changes)

📈 git-graph
   Pretty git log graph

❓ workflow-help
   Show this help

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recommended PR workflow (one PR per feature):

1. new-worktree vk/1234-feature /tmp/my-feature
2. cd /tmp/my-feature && create-draft-pr "Add feature X"
3. ... (work work work) ...
4. integrate-to-dev           # Test with other features
5. sync-from-dev              # In other worktrees to get changes
6. mark-pr-ready              # When tested and ready for review
7. (review happens on GitHub)
8. gh pr merge vk/1234-feature
9. sync-dev-with-main         # Update dev with merged changes
10. cleanup-merged            # Clean up local branches

For full documentation, see:
- docs/PR-REVIEW-STRATEGY.md (NEW - how to handle PR reviews)
- docs/GITHUB-WORKTREE-STRATEGY.md
EOF
}

# Print help on first load
echo -e "${GREEN}Git Worktree Workflow helpers loaded!${NC}"
echo -e "${YELLOW}Type 'workflow-help' for available commands${NC}"
