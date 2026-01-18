# Git Worktree Workflow - Reference Card

## The Mental Model

```
          GitHub (Remote)                    Your Machine (Local)
┌─────────────────────────┐         ┌───────────────────────────┐
│                         │         │                           │
│  origin/main (prod) ◄───┼─── PR ──┤  Local main (mirror)      │
│         ▲               │         │                           │
│         │               │         │  ┌──────────────────────┐ │
│         PR              │         │  │ Feature branches     │ │
│         │               │         │  │ in worktrees         │ │
│         │               │         │  │                      │ │
│  origin/dev (staging) ◄─┼─ merge ─┤  │ - vk/123-feature-a   │ │
│         ▲               │         │  │ - vk/456-feature-b   │ │
│         │               │         │  │                      │ │
│         │               │         │  └──────┬───────────────┘ │
│         │               │         │         │                 │
│         └───────────────┼─────────┤    integrate-to-dev       │
│                         │         │         ▼                 │
│                         │         │  Local dev (integration)  │
│                         │         │                           │
└─────────────────────────┘         └───────────────────────────┘
```

**Key Concept:** Features merge to `dev` for integration, then `dev` merges to `main` via PR.

---

## Essential Commands

### Daily Use

| Command | What It Does | When to Use |
|---------|-------------|-------------|
| `new-worktree <branch> <path>` | Create worktree from dev | Starting new task |
| `sync-from-dev` | Pull latest dev into current branch | Get other's changes |
| `integrate-to-dev` | Merge current branch to dev | Share your work |
| `release-dev-to-main "title"` | Create PR: dev → main | Ready for production |
| `worktree-status` | Show all worktree states | Check what's active |
| `cleanup-merged` | Remove [gone] branches | After PR merges |
| `workflow-help` | Show command help | Remind yourself |

### Git Shortcuts

| Command | What It Does |
|---------|-------------|
| `git current` | Show current branch name |
| `git lg` | Pretty log graph |
| `git gone` | Delete [gone] branches |
| `git dev-sync` | Quick dev update |

---

## Workflow Patterns

### Pattern 1: New Feature (Most Common)

```bash
# 1. Create
new-worktree vk/789-my-feature /tmp/my-feature
cd /tmp/my-feature

# 2. Work
# ... code code code ...
git add . && git commit -m "feat: thing"
git push origin vk/789-my-feature

# 3. Integrate
integrate-to-dev

# 4. Release (when dev ready)
release-dev-to-main "Add my feature"

# 5. Cleanup (after PR merged)
cleanup-merged
git worktree remove /tmp/my-feature
```

### Pattern 2: Combining Multiple Worktrees

```bash
# Worktree A
cd /path/to/worktree-a
integrate-to-dev

# Worktree B
cd /path/to/worktree-b
sync-from-dev              # Now has A's changes
integrate-to-dev           # Adds B's changes to dev

# Now origin/dev has both A + B
# Test, then release
release-dev-to-main "Features A + B"
```

### Pattern 3: Hotfix (Skip Dev)

```bash
# 1. Create from main
git worktree add /tmp/hotfix -b hotfix/critical origin/main

# 2. Fix
cd /tmp/hotfix
# ... fix fix fix ...
git push origin hotfix/critical

# 3. PR directly to main
gh pr create --base main --head hotfix/critical \
  --title "Hotfix: Critical bug" --label "hotfix"

# 4. After merge, sync dev with main
git checkout dev
git merge origin/main
git push origin dev
```

---

## Decision Tree

```
I want to...
│
├─ Start new work
│   └─► new-worktree vk/id-feature /path
│
├─ Save progress
│   └─► git add . && git commit && git push
│
├─ Share with other worktrees
│   └─► integrate-to-dev
│
├─ Get others' changes
│   └─► sync-from-dev
│
├─ Deploy to production
│   └─► release-dev-to-main "title"
│
├─ Check worktree status
│   └─► worktree-status
│
├─ Clean up old branches
│   └─► cleanup-merged
│
└─ See git history
    └─► git lg
```

---

## Branch Flow

```
feature-a ──┐
            ├──► dev ──► PR ──► main
feature-b ──┘

NOT:
feature-a ──► feature-b  ❌ (don't merge worktrees directly)
feature-a ──► main       ❌ (don't skip dev unless hotfix)
local-main ◄─ feature-a  ❌ (don't merge to local main)
```

---

## Tool Responsibilities

| Tool | Use For | Don't Use For |
|------|---------|---------------|
| **Vibe Kanban** | Task creation | Git operations |
| **Claude Code** | Code generation | Merging |
| **Workmux** | Navigation, status | Merging |
| **Git CLI** | All git operations | N/A |
| **GitHub CLI** | Creating PRs | N/A |
| **Graphite** | (Skip unless you need stacked PRs) | - |

---

## Rules to Live By

### ✅ DO

- Work in feature branches (worktrees)
- Merge features to `dev` for integration
- Create PRs from `dev` to `main`
- Keep local `main` synced with `origin/main`
- Push before integrating
- Use helper scripts

### ❌ DON'T

- Work in local `main` or `dev` directly
- Merge to local `main` manually
- Force push to `dev` or `main`
- Merge worktrees directly to each other
- Skip `dev` (except for hotfixes)
- Create feature branches from `main` (use `dev`)

---

## Common Scenarios

### Scenario: "I have changes in 3 worktrees, need to test together"

```bash
# In each worktree:
cd /path/to/worktree-1
integrate-to-dev

cd /path/to/worktree-2
integrate-to-dev

cd /path/to/worktree-3
integrate-to-dev

# Now all three are combined in origin/dev
# Any worktree can pull from dev to test the integration
cd /path/to/test-worktree
sync-from-dev
# Test combined changes
```

### Scenario: "I want to undo my last integration to dev"

```bash
# Option 1: Revert the merge commit
git checkout dev
git log --oneline  # Find the merge commit
git revert -m 1 <merge-commit-sha>
git push origin dev

# Option 2: Reset dev (DANGEROUS, coordinate with team)
git checkout dev
git reset --hard origin/main  # Nukes all integrated work
git push origin dev --force-with-lease
```

### Scenario: "Dev is way behind main"

```bash
# Sync dev with main
git checkout dev
git fetch origin main
git rebase origin/main
git push origin dev --force-with-lease

# Notify team to sync their worktrees
```

### Scenario: "Worktree is in weird state, start fresh"

```bash
# Save work
cd /path/to/worktree
git stash push -m "Save before reset"
git stash list  # Note the stash ID

# Reset to remote
git fetch origin
git reset --hard origin/$(git current)

# Or delete and recreate
cd ..
git worktree remove /path/to/worktree
new-worktree vk/branch-name /path/to/worktree
```

---

## Troubleshooting Quick Fixes

| Problem | Fix |
|---------|-----|
| "Command not found" | `source ~/repos/Ushadow/scripts/git-workflow-helpers.sh` |
| "Dev doesn't exist" | `git checkout -b dev origin/main && git push origin dev` |
| "Merge conflict" | `git status` → resolve → `git add .` → `git commit` |
| "Can't remove worktree" | `git stash` or `git reset --hard HEAD` first |
| "Push rejected" | `git pull --rebase origin $(git current)` then `git push` |
| "Accidentally on main" | `git checkout -` to go back |

---

## Quick Health Check

Run this weekly:

```bash
# 1. Clean branches
cleanup-merged

# 2. Sync main
git checkout main
git pull origin main

# 3. Sync dev with main
git checkout dev
git rebase origin/main
git push origin dev --force-with-lease

# 4. Check worktrees
worktree-status

# 5. View graph
git lg
```

---

## Help Resources

- **Main guide:** `docs/GITHUB-WORKTREE-STRATEGY.md`
- **Visual flow:** `docs/WORKTREE-FLOW-DIAGRAM.md`
- **Tool setup:** `docs/TOOL-INTEGRATION-GUIDE.md`
- **Getting started:** `docs/QUICK-START-CHECKLIST.md`
- **This card:** `docs/REFERENCE-CARD.md`

---

## Mnemonics

**"DISC"** - Daily workflow
- **D**ev is staging
- **I**ntegrate to dev
- **S**ync from dev
- **C**reate PR to main

**"NPR"** - New feature flow
- **N**ew worktree
- **P**ush commits
- **R**elease to main

**"3 Nevers"**
- Never work in local main
- Never merge to local main
- Never force push to main/dev

---

## Quick Copy-Paste

### Load helpers
```bash
source ~/repos/Ushadow/scripts/git-workflow-helpers.sh
```

### Start new task
```bash
new-worktree vk/$(date +%s)-task-name /tmp/task-name
```

### Integrate
```bash
git add . && git commit -m "feat: thing" && git push origin $(git current) && integrate-to-dev
```

### Release
```bash
release-dev-to-main "Release $(date +%Y-%m-%d)"
```

### Cleanup
```bash
cleanup-merged && git worktree prune
```

---

## One-Liner Cheat Sheet

```bash
# Setup
source ~/repos/Ushadow/scripts/git-workflow-helpers.sh

# Work
new-worktree vk/123-feat /tmp/feat  # Create
cd /tmp/feat                        # Navigate
# (code code code)
git add . && git commit && git push # Save
integrate-to-dev                    # Share
sync-from-dev                       # Get updates
release-dev-to-main "Release"       # Deploy
cleanup-merged                      # Clean

# Status
worktree-status  # All worktrees
git lg           # History
git current      # Current branch
```

---

**Print this card and keep it visible while working!** 📋
