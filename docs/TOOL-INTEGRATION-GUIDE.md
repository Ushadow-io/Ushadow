# Tool Integration Guide

How to use Vibe Kanban, Claude Code, Workmux, and Graphite together with your worktree workflow.

## Tool Comparison Matrix

| Tool | Purpose | Creates | Merges | Recommended Use |
|------|---------|---------|--------|-----------------|
| **Vibe Kanban** | Task management & worktree creation | Worktrees with UUID branches | ❌ No | ✅ Primary task creation |
| **Claude Code** | AI code generation | Branches/worktrees | ❌ No | ✅ Code assistance in worktrees |
| **Workmux** | Worktree lifecycle management | Worktrees | ⚠️ Has merge feature | ⚠️ Navigation only, avoid merge |
| **Graphite** | Stacked PR management | Branches | ✅ Yes (via stacks) | ❌ Skip - conflicts with worktree-first |
| **Git CLI** | Version control | Everything | ✅ Yes | ✅ All merge operations |
| **GitHub CLI (gh)** | PR management | PRs | ✅ Yes (merge PRs) | ✅ Creating PRs |

## Detailed Tool Strategies

### 1. Vibe Kanban

**What it is:** Kanban board that creates git worktrees for each task.

**Current behavior:**
- Creates branches like `5cb0-nodes`, `6a8c-unified-user-log`
- Each task card = separate worktree
- Tracks task status independently of git state
- **Has custom tags (prompt templates)** for workflow automation

**How to use with this workflow:**

```bash
# When Vibe Kanban creates a worktree:
# It creates: /tmp/vibe-kanban/worktrees/abc123-task-name/
# With branch: abc123-task-name

# Your workflow:
cd /tmp/vibe-kanban/worktrees/abc123-task-name/
git checkout -b vk/abc123-task-name  # Rename to follow convention
git push origin vk/abc123-task-name

# When task is done:
integrate-to-dev  # Use helper script
```

---

### Vibe Kanban Git Workflow Tags

Custom tags have been created to integrate with your git workflow. Apply these to tasks:

| Tag | When to Use | What It Does |
|-----|-------------|--------------|
| `integrate_to_dev` | Feature ready for integration testing | Guides merging branch to dev |
| `sync_from_dev` | Need other features' changes | Guides pulling dev into branch |
| `create_pr` | Ready to create Pull Request | Guides PR creation to main |
| `ready_for_review` | PR ready for code review | Review readiness checklist |

**Using Tags:**
1. Open task in Vibe Kanban
2. Click "Add Tag" or similar
3. Select the workflow tag
4. Claude will receive the tag's prompt as guidance

**Example Workflow with Tags:**
1. Work on feature → commit regularly
2. Apply `integrate_to_dev` tag → merge to dev
3. Apply `sync_from_dev` in other worktrees → get your changes
4. Apply `create_pr` tag → create PR to main
5. Apply `ready_for_review` tag → request reviews
6. Move task to "Done" after PR merges

---

**Best practices:**
- ✅ Use Vibe Kanban for task creation and tracking
- ✅ Let it create worktrees automatically
- ✅ Use workflow tags for git integration guidance
- ✅ Use git CLI for all merge operations
- ❌ Don't rely on Vibe Kanban for git operations beyond creation

---

### 2. Claude Code

**What it is:** AI coding assistant that generates code in branches.

**Current behavior:**
- Creates branches like `claude/add-environment-sounds-hs9xv`
- Sometimes creates worktrees, sometimes works in existing branches
- Generates code based on prompts

**How to use with this workflow:**

```bash
# Option A: Claude creates a branch
# You see: "Created branch claude/add-feature-xyz"

# Convert to worktree:
git worktree add /tmp/claude-feature claude/add-feature-xyz
cd /tmp/claude-feature
# Continue working...

# Option B: Claude works in existing worktree
cd /tmp/vibe-kanban/worktrees/abc123-task/
# Prompt Claude to work here
# Claude generates code in current worktree

# When done:
integrate-to-dev
```

**Best practices:**
- ✅ Use Claude for code generation in your worktrees
- ✅ Point Claude to existing worktree directories
- ✅ Review and commit Claude's changes normally
- ❌ Don't let Claude merge to main (use your workflow instead)

---

### 3. Workmux

**What it is:** Worktree lifecycle manager with remote admin capabilities.

**Features:**
- Create/remove worktrees
- Switch between worktrees
- Merge functionality (⚠️ be careful)
- Remote management via web interface

**How to use with this workflow:**

```bash
# ✅ GOOD USES:

# List all worktrees
workmux list

# Switch to worktree
workmux switch /tmp/my-feature

# Create new worktree
workmux create feature-name --base dev

# Remove worktree
workmux remove /tmp/old-feature

# Status check
workmux status

# ❌ AVOID:

# Workmux merge (conflicts with your workflow)
workmux merge feature-a feature-b  # DON'T USE

# Use git CLI instead:
integrate-to-dev  # Use your helper scripts
```

**Configuration:**

```yaml
# workmux.yml (example)
base_branch: dev  # ← Not main
default_worktree_path: /tmp/worktrees
cleanup_on_merge: false  # Manual cleanup preferred
merge_strategy: disabled  # Use git CLI instead
```

**Recommended role:**
- ✅ **Navigation tool** - switch between worktrees quickly
- ✅ **Remote admin** - manage worktrees from web interface
- ✅ **Status dashboard** - see all worktrees at a glance
- ❌ **NOT a merge tool** - use git CLI for merges

---

### 4. Graphite

**What it is:** Stacked PR management tool for dependent changes.

**Model:**
```
main
  └─ PR1 (approved, merged)
      └─ PR2 (in review) ← gt up/down to navigate
          └─ PR3 (draft) ← Auto-rebases when PR2 merges
```

**Why it conflicts with your workflow:**

| Graphite Expects | Your Workflow |
|------------------|---------------|
| Linear stack of dependent PRs | Parallel features merging to dev |
| `gt create` to track parent branch | Vibe Kanban/manual worktree creation first |
| Bottom-up merging (PR1 → PR2 → PR3) | All-at-once to dev, then dev → main |
| Branch parent tracking | Dev as integration point |

**Example conflict:**

```bash
# You do:
git worktree add /tmp/feature feature-name origin/dev

# Graphite sees:
# "Unknown branch 'feature-name', parent not tracked"
# gt branch --parent  # Returns: ??? (confused)

# Graphite wants:
gt create feature-name --parent dev
git worktree add /tmp/feature feature-name
# Now Graphite tracks it
```

**Options:**

#### Option A: Don't Use Graphite (Recommended)

Your workflow doesn't benefit from stacked PRs:
- Features are parallel, not dependent
- Dev branch handles integration
- One PR from dev → main

**Skip Graphite entirely.**

#### Option B: Graphite-Compatible Worktree Flow

If you really want Graphite:

```bash
# Always create branches via Graphite first
gt create vk/1234-feature --parent dev

# Then create worktree
git worktree add /tmp/feature vk/1234-feature

# Work in worktree
cd /tmp/feature
# ... code ...
git add . && git commit -m "work"

# Graphite commands still work
gt submit  # Creates PR
gt stack   # Shows your stack

# But this only helps if you have dependent PRs:
gt create vk/1234-part2 --parent vk/1234-feature
git worktree add /tmp/feature-part2 vk/1234-part2
```

**Verdict:** Only use if you regularly have dependent PR chains.

---

### 5. Git CLI (Primary Tool)

**Your source of truth for all git operations.**

```bash
# Use these directly:
git worktree add /tmp/feature -b feature-name origin/dev
git checkout dev
git merge feature-name
git push origin dev
gh pr create --base main --head dev

# Or use helper scripts:
source scripts/git-workflow-helpers.sh
new-worktree vk/1234-feature /tmp/feature
integrate-to-dev
sync-from-dev
release-dev-to-main "Release v1.2.3"
```

---

## Recommended Tool Stack

### Minimal (Recommended)

```
1. Vibe Kanban      → Task management + worktree creation
2. Claude Code      → AI code generation
3. Git CLI          → All git operations (with helper scripts)
4. GitHub CLI (gh)  → PR creation and management
```

### With Workmux (Optional)

```
1. Vibe Kanban      → Task management + worktree creation
2. Claude Code      → AI code generation
3. Workmux          → Worktree navigation and status (not merge)
4. Git CLI          → All git operations (with helper scripts)
5. GitHub CLI (gh)  → PR creation and management
```

### With Graphite (Advanced, Only if Needed)

```
1. Graphite         → Create all branches via 'gt create'
2. Git Worktree     → Create worktrees AFTER gt create
3. Claude Code      → Code generation in worktrees
4. Git CLI          → Merge operations
5. Graphite         → Submit stacked PRs via 'gt submit'
```

**Note:** Only use Graphite if you regularly have dependent PR chains.

---

## Tool Decision Matrix

### When to Use What

| Scenario | Primary Tool | Supporting Tools |
|----------|--------------|------------------|
| Create new task | Vibe Kanban | Git CLI |
| Write code | Claude Code + Editor | Git CLI for commits |
| Check worktree status | Workmux or `worktree-status` | Git CLI |
| Integrate features | Git CLI (`integrate-to-dev`) | - |
| Test combined features | Git CLI (`sync-from-dev`) | Workmux for navigation |
| Create PR | GitHub CLI (`gh pr create`) | - |
| Manage stacked PRs | ❌ Skip (or Graphite if needed) | - |
| Navigate worktrees | Workmux or `cd` | - |
| Cleanup branches | Git CLI (`cleanup-merged`) | - |

---

## Migration Plan

### Current State Assessment

```bash
# Run this to see your current setup:
worktree-status

# You'll see:
# - Multiple worktrees from different tools
# - Branches with various naming conventions
# - Some branches [gone] on remote
```

### Step 1: Standardize Existing Worktrees

```bash
# For each active worktree:
cd /path/to/worktree

# Check current branch
git branch --show-current

# If not following convention, rename:
# Old: 5cb0-nodes
# New: vk/5cb0-nodes
git branch -m 5cb0-nodes vk/5cb0-nodes

# Update remote tracking
git push origin -u vk/5cb0-nodes

# Delete old remote branch
git push origin --delete 5cb0-nodes
```

### Step 2: Clean Up [gone] Branches

```bash
cleanup-merged
```

### Step 3: Configure Tools

**Vibe Kanban:** (if configurable)
- Set `default_base_branch: dev`
- Set `branch_prefix: vk/`

**Workmux:** (if configurable)
- Set `base_branch: dev`
- Set `merge_strategy: disabled`

**Graphite:** (if using)
- Initialize: `gt repo init --trunk main`
- For each existing branch: `gt branch --parent dev`

**Claude Code:**
- No config needed, just point it to worktree directories

### Step 4: Load Helper Scripts

```bash
# Add to ~/.bashrc or ~/.zshrc
echo 'source ~/repos/Ushadow/scripts/git-workflow-helpers.sh' >> ~/.bashrc

# Reload shell
source ~/.bashrc

# Test
workflow-help
```

### Step 5: Update Team Documentation

If working with others:
1. Share `GITHUB-WORKTREE-STRATEGY.md`
2. Ensure everyone uses same tool stack
3. Document branch naming convention
4. Set up branch protection rules on GitHub:
   - Protect `main` (require PR, reviews)
   - Optionally protect `dev` (require PR or limit who can push)

---

## Tool-Specific Gotchas

### Vibe Kanban
- ⚠️ May create worktrees from `main` instead of `dev` by default
- ⚠️ Branch names might not follow your convention
- ⚠️ Task deletion might not clean up worktree

**Workaround:** Manually rebase to `origin/dev` after creation:
```bash
cd /path/to/vibe/worktree
git rebase origin/dev
```

### Claude Code
- ⚠️ May suggest merging to `main` directly
- ⚠️ Branch names are auto-generated (hard to read)
- ⚠️ Sometimes works in detached HEAD state

**Workaround:** Always verify branch before committing:
```bash
git branch --show-current  # Ensure you're on a named branch
```

### Workmux
- ⚠️ Merge functionality may bypass your workflow
- ⚠️ Remote admin could allow others to merge incorrectly
- ⚠️ May not understand `dev` as integration branch

**Workaround:** Disable merge features in config, use only for navigation.

### Graphite
- ⚠️ Requires branch creation via `gt` to track parents
- ⚠️ Confused by externally created worktrees
- ⚠️ Rebase-heavy workflow may conflict with Workmux expectations

**Workaround:** Create branches via `gt` BEFORE creating worktrees, or skip Graphite.

---

## Example Workflows by Scenario

### Scenario: New Feature from Vibe Kanban

```bash
# 1. Vibe creates task and worktree
# Result: /tmp/vibe-kanban/worktrees/abc123-new-feature/
#         Branch: abc123-new-feature

# 2. Navigate to worktree
cd /tmp/vibe-kanban/worktrees/abc123-new-feature

# 3. Rebase to dev (if Vibe created from main)
git fetch origin dev
git rebase origin/dev

# 4. Rename branch for convention
git branch -m abc123-new-feature vk/abc123-new-feature
git push origin -u vk/abc123-new-feature

# 5. Work with Claude
# (Prompt Claude to generate code here)

# 6. Integrate to dev
integrate-to-dev

# 7. Test with other worktrees
cd /path/to/other/worktree
sync-from-dev

# 8. Release to main
release-dev-to-main "Add new feature from vk/abc123"

# 9. Cleanup
cleanup-merged
git worktree remove /tmp/vibe-kanban/worktrees/abc123-new-feature
```

### Scenario: Quick Fix with Claude

```bash
# 1. Create worktree manually
new-worktree hotfix/critical-bug /tmp/hotfix

# 2. Navigate
cd /tmp/hotfix

# 3. Prompt Claude to fix the bug
# (Claude generates code)

# 4. Review and commit
git add . && git commit -m "fix: critical bug in auth"
git push origin hotfix/critical-bug

# 5. Emergency PR (skip dev)
gh pr create --base main --head hotfix/critical-bug \
  --title "Hotfix: Critical auth bug" \
  --label "hotfix"

# 6. After merge, update dev
git checkout dev
git merge origin/main
git push origin dev

# 7. Cleanup
git worktree remove /tmp/hotfix
git branch -d hotfix/critical-bug
```

### Scenario: Multiple Worktrees with Workmux

```bash
# 1. Create tasks via Vibe Kanban
# Result:
#   - Worktree A: /tmp/vibe/.../feature-a
#   - Worktree B: /tmp/vibe/.../feature-b

# 2. Check status via Workmux
workmux status
# Shows:
#   feature-a: 3 commits ahead
#   feature-b: 5 commits ahead

# 3. Navigate via Workmux
workmux switch feature-a

# 4. Work in feature-a with Claude
# (Code generation)

# 5. Integrate feature-a
integrate-to-dev

# 6. Switch to feature-b via Workmux
workmux switch feature-b

# 7. Sync with feature-a's changes
sync-from-dev

# 8. Work in feature-b
# (More code)

# 9. Integrate feature-b
integrate-to-dev

# 10. Release both features
release-dev-to-main "Features A + B"
```

---

## Summary: Tool Responsibilities

```
┌────────────────────────────────────────────────┐
│                  Your Workflow                 │
├────────────────────────────────────────────────┤
│                                                │
│  Task Creation        → Vibe Kanban            │
│  Code Generation      → Claude Code            │
│  Worktree Navigation  → Workmux (or cd)        │
│  Git Operations       → Git CLI + Helpers      │
│  PR Management        → GitHub CLI (gh)        │
│  Stacked PRs          → SKIP (or Graphite)     │
│                                                │
│  Integration Branch   → origin/dev             │
│  Production Branch    → origin/main            │
│  Local Main           → READ-ONLY MIRROR       │
│                                                │
└────────────────────────────────────────────────┘
```

**Golden Rule:** Each tool has ONE job. Don't use Workmux for merging, don't use Vibe Kanban for git ops, don't use Graphite unless you need stacked PRs.

**Simplest Stack:**
1. Vibe Kanban (tasks)
2. Claude Code (coding)
3. Git CLI (git ops)
4. GitHub (PRs)

Done!
