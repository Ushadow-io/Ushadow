# PR Review Strategy for Multi-Worktree Workflow

## The Problem

If you merge everything to `dev` and then create one big PR `dev → main`, you get:
- ❌ Huge, unreviewable PRs
- ❌ Can't rollback individual features
- ❌ All-or-nothing deployment
- ❌ Poor git history

## The Solution: Dual-Track Approach

**Feature branches PR directly to `main` for review, but use `dev` for integration testing first.**

```
                     GitHub PRs (Review)
                           ↓
feature-a ──┐         PR #101 ──┐
            ├─ test ─→          ├──► origin/main
feature-b ──┘         PR #102 ──┘
    │                      ▲
    └──► origin/dev ───────┘
         (integration     (after PR approved,
          testing only)    cherry-pick or rebase)
```

---

## Recommended Workflow: PR-Per-Feature

### Strategy A: PR After Dev Testing (Recommended)

**Flow:**
1. Work in feature branch (worktree)
2. Integrate to `dev` for testing with other features
3. After testing in `dev`, create **individual PR** to `main`
4. Keep PRs small (one feature per PR)

**Implementation:**

```bash
# 1. Work in feature branch
cd /tmp/vk/123-feature-a
# ... code code code ...
git add . && git commit -m "feat: add feature A"
git push origin vk/123-feature-a

# 2. Test in dev (with other features)
integrate-to-dev

# In another worktree:
cd /tmp/vk/456-feature-b
sync-from-dev  # Now has feature-a
# ... test feature-b WITH feature-a ...

# 3. When feature-a is tested and ready, create PR
cd /tmp/vk/123-feature-a
gh pr create --base main --head vk/123-feature-a \
  --title "Add feature A" \
  --body "Tested in dev with features B, C"

# 4. Code review happens on PR #101
# 5. Make review changes:
git add . && git commit -m "review: address feedback"
git push origin vk/123-feature-a

# 6. Merge PR #101 (feature-a → main)

# 7. Sync dev with main
git checkout dev
git pull origin main  # Get feature-a from main
git push origin dev   # Update dev
```

**Result:**
- ✅ Small, reviewable PRs
- ✅ Each feature has its own review
- ✅ `dev` used only for integration testing
- ✅ Clean git history

---

### Strategy B: PR Early, Merge After Testing

**Flow:**
1. Create **draft PR** to `main` immediately
2. Also merge to `dev` for integration testing
3. Mark PR as "ready for review" after dev testing
4. Review and merge PR

**Implementation:**

```bash
# 1. Work in feature branch
cd /tmp/vk/123-feature-a
git add . && git commit -m "feat: add feature A"
git push origin vk/123-feature-a

# 2. Create DRAFT PR immediately (for visibility)
gh pr create --base main --head vk/123-feature-a \
  --title "[WIP] Add feature A" \
  --draft

# 3. Also integrate to dev for testing
integrate-to-dev

# 4. Test in dev with other features
# ... testing testing ...

# 5. When tested, mark PR ready and request review
gh pr ready  # Convert draft to ready
gh pr edit --title "Add feature A"  # Remove [WIP]

# 6. Code review, address feedback
git add . && git commit -m "review: address feedback"
git push origin vk/123-feature-a

# 7. Merge PR

# 8. Sync dev with main
git checkout dev
git pull origin main
git push origin dev
```

**Result:**
- ✅ Early visibility (team sees PRs early)
- ✅ Integration testing before review
- ✅ Small PRs per feature

---

### Strategy C: Squash-Merge Pattern

**For teams that prefer squash merges:**

```bash
# 1. Work in feature branch with many commits
cd /tmp/vk/123-feature-a
git commit -m "wip: partial implementation"
git commit -m "wip: add tests"
git commit -m "wip: fix bug"
# ... many commits ...

# 2. Test in dev
integrate-to-dev

# 3. Create PR (all commits visible)
gh pr create --base main --head vk/123-feature-a

# 4. Review and squash-merge on GitHub
# Result: One clean commit on main

# 5. Update dev
git checkout dev
git pull origin main  # Gets squashed commit
# Resolve any conflicts from squash
git push origin dev
```

**Result:**
- ✅ Messy commits during development OK
- ✅ Clean main branch history
- ⚠️ Requires conflict resolution when syncing dev

---

## Which Strategy Should You Use?

| Strategy | Best For | Trade-offs |
|----------|----------|-----------|
| **A: PR After Testing** | Conservative teams, critical systems | Extra step after testing |
| **B: Draft PR Early** | Transparent teams, async collaboration | More PR management |
| **C: Squash-Merge** | Teams that want clean history | Conflict resolution overhead |

**Recommendation for your setup:** **Strategy B (Draft PR Early)**

**Why:**
- Multiple worktrees = multiple people/contexts working in parallel
- Early visibility helps coordination
- Draft status makes it clear "not ready yet"
- Works well with Vibe Kanban task tracking

---

## Detailed Workflow: Strategy B (Draft PR Early)

### Step-by-Step

```bash
# ════════════════════════════════════════════════
# DAY 1: Start feature
# ════════════════════════════════════════════════

# Vibe Kanban creates worktree
cd /tmp/vibe-kanban/worktrees/vk-123-add-auth

# Create draft PR immediately
git push origin vk/123-add-auth
gh pr create --base main --head vk/123-add-auth \
  --title "[WIP] Add authentication system" \
  --draft \
  --body "$(cat <<'EOF'
## Feature
User authentication with JWT

## Status
🚧 In Development
- [ ] Core auth logic
- [ ] Tests
- [ ] Integration testing in dev

## Testing Plan
Will test in dev with features B, C before review
EOF
)"

# Work on feature
# ... code code code ...
git add . && git commit -m "feat: add login endpoint"
git push origin vk/123-add-auth

# ════════════════════════════════════════════════
# DAY 2: Integrate for testing
# ════════════════════════════════════════════════

# Feature is functionally complete
git add . && git commit -m "feat: add tests"
git push origin vk/123-add-auth

# Integrate to dev for testing with other features
integrate-to-dev

# Update PR description
gh pr edit vk/123-add-auth --body "$(cat <<'EOF'
## Feature
User authentication with JWT

## Status
🧪 Testing in Dev
- [x] Core auth logic
- [x] Tests
- [ ] Integration testing in dev

Merged to dev for integration testing with:
- Feature B (vk/456-user-profile)
- Feature C (vk/789-api-keys)
EOF
)"

# ════════════════════════════════════════════════
# DAY 3: Test in dev, other worktree pulls changes
# ════════════════════════════════════════════════

cd /tmp/vibe-kanban/worktrees/vk-456-user-profile
sync-from-dev  # Gets auth feature
# Test user profile WITH authentication

# Found a bug in auth? No problem:
cd /tmp/vibe-kanban/worktrees/vk-123-add-auth
# Fix bug
git add . && git commit -m "fix: handle null user"
git push origin vk/123-add-auth

# Re-integrate to dev
integrate-to-dev

# ════════════════════════════════════════════════
# DAY 4: Ready for review
# ════════════════════════════════════════════════

cd /tmp/vibe-kanban/worktrees/vk-123-add-auth

# Mark PR ready
gh pr ready

# Update title and description
gh pr edit --title "Add authentication system" \
  --body "$(cat <<'EOF'
## Feature
User authentication with JWT

## Changes
- Login/logout endpoints
- JWT token generation and validation
- User session management
- Integration with user profile feature

## Testing
✅ Unit tests passing
✅ Integration tested in dev with features B, C
✅ Manual testing complete

## Migration
No database migrations required

## Security
- Tokens expire after 24h
- Passwords hashed with bcrypt
- HTTPS required
EOF
)"

# ════════════════════════════════════════════════
# DAY 5: Code review
# ════════════════════════════════════════════════

# Reviewer comments on PR
# "Please add rate limiting to login endpoint"

cd /tmp/vibe-kanban/worktrees/vk-123-add-auth
# ... add rate limiting ...
git add . && git commit -m "review: add rate limiting"
git push origin vk/123-add-auth

# Also update in dev
integrate-to-dev

# Reviewer approves ✓

# ════════════════════════════════════════════════
# DAY 6: Merge to main
# ════════════════════════════════════════════════

# Merge PR on GitHub (or via CLI)
gh pr merge vk/123-add-auth --squash

# Sync dev with main
git checkout dev
git pull origin main  # Gets merged feature
git push origin dev

# Cleanup
cleanup-merged
git worktree remove /tmp/vibe-kanban/worktrees/vk-123-add-auth

# ════════════════════════════════════════════════
# DONE!
# ════════════════════════════════════════════════
# - Small, focused PR ✓
# - Thoroughly tested in dev ✓
# - Reviewed by team ✓
# - Clean merge to main ✓
```

---

## Managing Multiple Concurrent PRs

### Scenario: 5 features in parallel

```
Worktree A (vk/123-auth)      → Draft PR #101 → Testing in dev
Worktree B (vk/456-profile)   → Draft PR #102 → Testing in dev
Worktree C (vk/789-api-keys)  → Draft PR #103 → Testing in dev
Worktree D (vk/abc-search)    → Draft PR #104 → Ready for review
Worktree E (vk/def-export)    → Draft PR #105 → In review
```

**All features are merged to `dev` for integration testing.**

**Each PR reviews ONE feature.**

**PRs can be merged to `main` independently.**

---

## Updated Helper Script

Let me add a new command for creating draft PRs:

```bash
# Add this to git-workflow-helpers.sh

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

mark-pr-ready() {
    local current_branch=$(git branch --show-current)

    # Mark PR as ready
    gh pr ready

    echo -e "${GREEN}✓ PR marked ready for review${NC}"
    echo -e "${YELLOW}Update the PR description with test results:${NC}"
    echo -e "${BLUE}  gh pr edit --body \"...\"${NC}"
}
```

---

## Handling Conflicts

### Problem: Feature A merged to main, but dev has feature B that conflicts

```bash
# Feature A merged to main (PR #101)
# Dev still has features B, C, D being tested

# Sync dev with main
git checkout dev
git pull origin main  # Conflict with feature B!

# Resolve conflict
vim conflicted-file.txt
git add conflicted-file.txt
git commit -m "merge: resolve conflict with feature A"
git push origin dev

# Feature B worktree needs to pull the resolution
cd /tmp/vibe-kanban/worktrees/vk-456-feature-b
git pull origin dev  # Gets conflict resolution

# When feature B creates PR, conflicts already resolved
gh pr create --base main --head vk/456-feature-b
# No conflicts! Already resolved in dev
```

---

## What About the Big `dev → main` PR?

**You don't need it!**

Instead:
- `dev` is a **testing branch only**
- All features PR to `main` individually
- `dev` syncs with `main` after each PR merge
- `dev` always contains `main` + features being tested

```
main:  A ─ B ─ C ─ D
              ↑   ↑
         PR #101 PR #102

dev:   A ─ B ─ C ─ D ─ E ─ F
              ↑       ↑   ↑
           (merged) (testing)
```

**When to use `dev → main` PR:**
- Never, unless you want to do a big release of everything at once
- Or for emergency: "reset main to dev" scenario

---

## Updated Workflow Summary

### The New Golden Path

```bash
# 1. Start feature, create draft PR
new-worktree vk/123-feature /tmp/feature
cd /tmp/feature
create-draft-pr "Add feature X"

# 2. Work and push regularly
git add . && git commit -m "feat: thing"
git push origin vk/123-feature

# 3. Integrate to dev for testing
integrate-to-dev

# 4. Test with other features in dev
cd /tmp/other-worktree
sync-from-dev
# ... test integration ...

# 5. Mark PR ready when tested
cd /tmp/feature
mark-pr-ready
gh pr edit --body "...test results..."

# 6. Code review on PR

# 7. Address review comments
git add . && git commit -m "review: feedback"
git push origin vk/123-feature
integrate-to-dev  # Update dev too

# 8. Merge PR to main (on GitHub or CLI)
gh pr merge vk/123-feature --squash

# 9. Sync dev with main
git checkout dev
git pull origin main
git push origin dev

# 10. Cleanup
cleanup-merged
git worktree remove /tmp/feature
```

---

## PR Size Guidelines

**Ideal PR size:** 200-400 lines changed

**Maximum PR size:** 800 lines

**If larger:**
- Break into multiple PRs
- Create parent tracking issue
- Example:
  - PR #101: Auth infrastructure
  - PR #102: Login endpoints (depends on #101)
  - PR #103: Session management (depends on #101)

---

## Branch Protection Rules

Set up on GitHub:

**For `main`:**
- ✅ Require pull request reviews (at least 1)
- ✅ Require status checks (CI tests)
- ✅ Require branches to be up to date
- ✅ No force pushes
- ✅ No deletions

**For `dev`:**
- ⚠️ Optional: Require status checks
- ✅ No force pushes (use `--force-with-lease` only if needed)
- ❌ Don't require PR (direct push OK for integration)

---

## FAQ

### Q: "Do I need to create a PR for every feature?"
**A:** Yes! Each feature = one PR for review.

### Q: "What if two features depend on each other?"
**A:**
- Option 1: Merge first feature, then second PR builds on it
- Option 2: Create both PRs, mark second as "blocked by #101"

### Q: "Can I skip dev and PR directly to main?"
**A:** Yes for small, isolated changes. But testing in dev first catches integration bugs.

### Q: "What if dev gets really far ahead of main?"
**A:** Sync dev with main frequently:
```bash
git checkout dev
git pull origin main
git push origin dev
```

### Q: "PR conflicts with main?"
**A:** If you tested in dev (which syncs with main), conflicts should be rare. If they happen:
```bash
git checkout vk/123-feature
git pull origin main
# Resolve conflicts
git push origin vk/123-feature
```

---

## Updated Tool Commands

Add these to your `git-workflow-helpers.sh`:

```bash
# Create draft PR for current branch
create-draft-pr "Feature title"

# Mark PR ready for review
mark-pr-ready

# Sync dev with main (run after PR merges)
sync-dev-with-main() {
    git checkout dev
    git pull origin main
    git push origin dev
    echo -e "${GREEN}✓ Dev synced with main${NC}"
}

# Full workflow helper
pr-workflow() {
    cat << 'EOF'
PR Workflow:
1. create-draft-pr "Feature title"
2. integrate-to-dev (for testing)
3. mark-pr-ready (when tested)
4. (review happens on GitHub)
5. gh pr merge vk/123-feature
6. sync-dev-with-main
7. cleanup-merged
EOF
}
```

---

## Summary

✅ **DO:**
- Create one PR per feature (small PRs)
- Use draft PRs for work in progress
- Test in `dev` before marking ready
- Merge individual PRs to `main`
- Sync `dev` with `main` after each merge

❌ **DON'T:**
- Create huge `dev → main` PRs
- Merge multiple features in one PR
- Skip dev testing
- Let dev drift too far from main

**Result:** Small, reviewable PRs + thorough integration testing = best of both worlds!
