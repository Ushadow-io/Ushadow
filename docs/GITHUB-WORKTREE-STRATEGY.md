# GitHub Worktree Strategy

## Executive Summary

You're running a **multi-worktree development workflow** with parallel workstreams. This document defines a clear strategy for branch management, merging, and PR creation across your tools (worktrees, vibe-kanban, Claude Code, workmux, Graphite).

## Core Principles

### 1. **Local `main` has NO active role in worktree workflows**

**Status quo:** Your local `main` is behind `origin/main` and rarely used.

**Strategy:**
- **Local `main` = read-only sync point** (only for pulling latest from origin)
- **NEVER work directly in local `main`**
- **NEVER merge into local `main`** manually
- Only update via: `git fetch origin && git checkout main && git pull origin main`

**Why:** With worktrees, you're always in feature branches. Local `main` is just a reference point.

---

### 2. **Branch/PR Hierarchy**

```
origin/main (production)
    ↑
    PR
    ↑
origin/dev (integration branch) ← OPTIONAL staging area
    ↑
    PR or direct merge
    ↑
feature branches in worktrees
```

**Two workflows to choose from:**

#### **Option A: Direct to Main (Simple)**
- Feature branches → PR to `origin/main`
- Best for: small teams, high confidence in CI/tests
- **This is your current pattern** (most branches target main)

#### **Option B: Staging via Dev (Safe)**
- Feature branches → merge to `dev` (local testing)
- `dev` → PR to `origin/main` (after validation)
- Best for: combining multiple worktrees, pre-production testing

**Recommendation:** Use **Option B** for your use case.

---

### 3. **The `dev` Branch Strategy**

**Purpose:** Integration/staging branch for combining work from multiple worktrees before mainline.

**Workflow:**

```bash
# In worktree A (e.g., 5cb0-nodes)
git checkout 5cb0-nodes
git merge origin/dev          # Start from latest dev
# ... work work work ...
git push origin 5cb0-nodes    # Push your branch

# Ready to integrate? Merge to dev
git checkout dev
git pull origin dev           # Sync dev
git merge 5cb0-nodes          # Merge your work
git push origin dev           # Push to remote dev

# In worktree B (e.g., 6a8c-unified-user-log)
git checkout 6a8c-unified-user-log
git merge origin/dev          # Now has worktree A's changes!
# ... work work work ...
git merge origin/dev          # Merge your work to dev (same steps)

# When dev is ready for production:
# Create PR: origin/dev → origin/main
```

**Key Points:**
- `dev` branch exists both locally and on `origin`
- Feature branches merge INTO `dev` for integration
- `dev` merges into `main` via PR when ready for production
- Each worktree can pull from `origin/dev` to get integrated changes

**Current State:** Your `dev` branch is at `b9cabc0` (tmux merge) - already set up!

---

### 4. **Combining Multiple Worktrees (Not Ready for Main)**

**Scenario:** You want to combine `5cb0-nodes` + `6a8c-unified-user-log` for testing, but not merge to main yet.

**Solution: Use `dev` as integration branch**

```bash
# Worktree 1: 5cb0-nodes
cd /path/to/worktree-5cb0
git checkout 5cb0-nodes
git push origin 5cb0-nodes
git checkout dev
git merge 5cb0-nodes
git push origin dev

# Worktree 2: 6a8c-unified-user-log
cd /path/to/worktree-6a8c
git checkout 6a8c-unified-user-log
git pull origin dev           # Gets 5cb0-nodes changes
git push origin 6a8c-unified-user-log
git checkout dev
git merge 6a8c-unified-user-log
git push origin dev

# Now both are combined in origin/dev
# Other worktrees can pull from origin/dev to test integrated changes
```

**Getting dev into main as PR:**
```bash
# On GitHub: Create PR from origin/dev → origin/main
# Or via CLI:
gh pr create --base main --head dev --title "Integration: nodes + user log" --body "Combined features from multiple worktrees"
```

---

## Tool Integration

### **Vibe Kanban**
- Creates worktrees with UUID-prefixed branches (e.g., `5cb0-nodes`)
- Each task = separate worktree
- **Strategy:** These are feature branches → merge to `dev` or PR to `main`

### **Claude Code**
- Creates branches (e.g., `claude/add-environment-sounds-hs9xv`)
- Also creates worktrees in some cases
- **Strategy:** Treat like vibe-kanban branches - merge to `dev` or PR to `main`

### **Workmux**
- Manages worktree lifecycle and remote admin
- Has merge functionality
- **Strategy:** Use for worktree switching, not primary merge tool

### **Graphite (Stacked PRs)**

**Problem:** Graphite gets confused when worktrees are created first.

**Why:** Graphite expects:
1. You create branches using `gt create` (it tracks branch parent relationships)
2. Worktrees created externally break Graphite's branch tracking

**Solution Options:**

#### Option 1: Don't Use Graphite (Recommended for You)
- Your worktree-first workflow conflicts with Graphite's model
- Use native git + GitHub PRs instead
- Stacked PRs aren't critical for your workflow (you're integrating via `dev`)

#### Option 2: Graphite-Compatible Workflow
```bash
# Create branch via Graphite
gt create feature-name

# Create worktree AFTER
git worktree add /path feature-name

# Graphite now tracks the stack
```

**What are Stacked PRs?**
- **Commits:** Individual changes (git level)
- **Stacked PRs:** Chain of dependent PRs where PR2 builds on PR1, PR3 on PR2
  - Example: PR1 (database schema) → PR2 (API using schema) → PR3 (UI using API)
- **Your case:** You don't need stacks - you merge features to `dev` then one PR to main

**Verdict:** **Skip Graphite** - it's optimized for a different workflow.

---

## Recommended Workflow

### **Daily Development**

```bash
# 1. Start new task (vibe-kanban or manual)
git worktree add /path/to/new-worktree -b feature-name origin/dev

# 2. Work in worktree
cd /path/to/new-worktree
# ... code code code ...
git add . && git commit -m "feat: thing"
git push origin feature-name

# 3. Integrate into dev (when feature is testable)
git checkout dev
git pull origin dev
git merge feature-name
git push origin dev

# 4. Test integration
# Other worktrees can now pull origin/dev to test combined changes

# 5. When dev is stable, create PR to main
gh pr create --base main --head dev --title "Release: feature set X"
```

### **Cleaning Up**

```bash
# After PR merged to main
git branch -d feature-name           # Delete local
git push origin --delete feature-name # Delete remote
git worktree remove /path/to/worktree

# Sync main
git fetch origin
git checkout main
git pull origin main

# Rebase dev on main (keep dev up to date)
git checkout dev
git rebase origin/main
git push origin dev --force-with-lease
```

---

## Branch Naming Convention

**Current chaos:** `5cb0-nodes`, `claude/add-environment-sounds-hs9xv`, `Green/tests`, `stu/purple`, `vk/e8c3-req-fields-to-se`

**Proposed standard:**

```
<tool>/<id>-<description>

vk/a1b2-add-feature       (vibe-kanban)
claude/c3d4-fix-bug       (Claude Code)
manual/feature-name       (manual creation)
```

**Keep:**
- Tool prefix (shows origin)
- Short ID (helps tracking)
- Kebab-case description

**Avoid:**
- Color names (purple, green) - no semantic meaning
- Random branch names without context

---

## Tool Responsibilities

| Tool | Responsibility | Merge Target |
|------|---------------|--------------|
| **Vibe Kanban** | Create task worktrees | `dev` or PR to `main` |
| **Claude Code** | Code generation in branches/worktrees | `dev` or PR to `main` |
| **Workmux** | Worktree lifecycle management | Status/navigation only |
| **Git CLI** | All merge operations | Use `git merge` to `dev`, GitHub PRs to `main` |
| **GitHub** | PR reviews, final merge to `main` | `main` branch |

---

## FAQ

### Q: "What's the difference between merging to dev and creating a PR?"
**A:**
- **Merge to dev:** Fast, local integration for testing combined features
- **PR to main:** Formal code review, CI checks, production deployment

### Q: "Can I merge worktree A into worktree B directly?"
**A:** No - merge into `dev`, then pull `dev` into worktree B. This keeps history clean.

### Q: "When do I use local main?"
**A:** Never for work. Only run `git checkout main && git pull origin main` to sync reference.

### Q: "How do I test multiple worktrees together?"
**A:** Merge all into `origin/dev`, then each worktree pulls from `origin/dev`.

### Q: "What if I want to merge just two worktrees, not all to main?"
**A:**
```bash
# Option 1: Create temporary integration branch
git checkout -b integration/feature-a-b origin/dev
git merge feature-a
git merge feature-b
# Test, then merge to dev or discard

# Option 2: Use dev
# Just merge both to dev, test, revert if needed
```

---

## Migration Path

### Step 1: Clean Up Existing Branches (Optional)
```bash
# List branches that are [gone] on remote
git branch -vv | grep ': gone]'

# Delete them
git branch -d $(git branch -vv | grep ': gone]' | awk '{print $1}')
```

### Step 2: Establish Dev as Integration Branch
```bash
# Ensure dev exists locally and remotely
git checkout dev
git pull origin dev

# In each active worktree, update base to dev
cd /path/to/worktree
git rebase origin/dev  # or merge if you prefer
```

### Step 3: Update Tooling
- **Vibe Kanban:** Configure to create worktrees from `origin/dev` instead of `origin/main`
- **Workmux:** Use for navigation only, disable merge features to avoid confusion
- **Graphite:** Uninstall or ignore (incompatible with worktree-first flow)

---

## One-Page Cheat Sheet

```bash
# START NEW TASK
git worktree add /path/new-task -b vk/1234-feature origin/dev

# DAILY WORK
cd /path/new-task
git add . && git commit -m "work"
git push origin vk/1234-feature

# INTEGRATE TO DEV (ready for testing with other features)
git checkout dev && git pull origin dev
git merge vk/1234-feature && git push origin dev

# TEST INTEGRATION (in another worktree)
cd /path/other-task
git pull origin dev  # Gets combined changes

# RELEASE TO PRODUCTION
gh pr create --base main --head dev --title "Release v1.2.3"

# CLEANUP AFTER MERGE
git branch -d vk/1234-feature
git push origin --delete vk/1234-feature
git worktree remove /path/new-task

# SYNC MAIN (occasionally)
git checkout main && git pull origin main
git checkout dev && git rebase origin/main && git push --force-with-lease
```

---

## Summary

✅ **Local main:** Read-only sync point, never work here
✅ **Dev branch:** Integration/staging for combining worktrees
✅ **Feature branches:** One per worktree, merge to dev or PR to main
✅ **Vibe Kanban + Claude Code:** Create worktrees, merge to dev
✅ **Workmux:** Navigation tool only
✅ **Graphite:** Skip it - incompatible with worktree-first workflow
✅ **PRs:** Always from dev→main or feature→main, never local merges to main

**Golden Rule:** All code flows through `origin/dev` for integration, then `origin/main` via PR for production.
