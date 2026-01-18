# Worktree Workflow Visual Guide

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub (Remote)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  origin/main ◄──────── PR (with review) ◄──────── origin/dev   │
│     (prod)                                         (staging)    │
│                                                        ▲        │
│                                                        │        │
│                              ┌─────────────────────────┤        │
│                              │                         │        │
│                    origin/feature-a           origin/feature-b  │
│                              ▲                         ▲        │
└──────────────────────────────┼─────────────────────────┼────────┘
                               │                         │
                            git push                 git push
                               │                         │
┌──────────────────────────────┼─────────────────────────┼────────┐
│                    Your Machine (Local)                │        │
├────────────────────────────────────────────────────────┼────────┤
│                                                        │        │
│  ┌──────────────────────┐         ┌─────────────────────────┐  │
│  │   Worktree A         │         │   Worktree B            │  │
│  │   /tmp/feature-a/    │         │   /tmp/feature-b/       │  │
│  ├──────────────────────┤         ├─────────────────────────┤  │
│  │  Branch: feature-a   │         │  Branch: feature-b      │  │
│  │                      │         │                         │  │
│  │  [work work work]    │         │  [work work work]       │  │
│  │                      │         │                         │  │
│  │  git merge origin/dev│         │  git merge origin/dev   │  │
│  │  ↓                   │         │  ↓                      │  │
│  │  git push            │         │  git push               │  │
│  └──────────┬───────────┘         └─────────┬───────────────┘  │
│             │                               │                  │
│             └───────────┐       ┌───────────┘                  │
│                         ▼       ▼                              │
│                   ┌─────────────────┐                          │
│                   │  Local dev      │                          │
│                   ├─────────────────┤                          │
│                   │  git merge      │                          │
│                   │  feature-a      │                          │
│                   │  feature-b      │                          │
│                   │                 │                          │
│                   │  git push ──────┼──► origin/dev            │
│                   └─────────────────┘                          │
│                                                                 │
│  ┌──────────────────────┐                                      │
│  │  Local main          │  ◄── git pull origin main            │
│  │  (read-only mirror)  │      (sync only, never work here)    │
│  └──────────────────────┘                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Flow Step-by-Step

### 1️⃣ Start New Feature

```
You:  new-worktree vk/1234-feature /tmp/my-feature

Git:  Creates worktree at /tmp/my-feature
      Creates branch vk/1234-feature from origin/dev
      Sets up tracking to origin/dev

You:  cd /tmp/my-feature
```

### 2️⃣ Daily Work

```
Worktree A:
  ├─ edit files
  ├─ git add . && git commit -m "work"
  └─ git push origin vk/1234-feature
       │
       └──► origin/vk/1234-feature (backup)
```

### 3️⃣ Integration Time (Ready to Share Between Worktrees)

```
Worktree A:
  └─ integrate-to-dev
       │
       ├─ Switches to local dev
       ├─ git pull origin dev
       ├─ git merge vk/1234-feature
       └─ git push origin dev
            │
            └──► origin/dev (now has your changes)

Worktree B:
  └─ sync-from-dev
       │
       └─ git merge origin/dev
            │
            └──► Now has Worktree A's changes!
```

### 4️⃣ Release to Production

```
You: release-dev-to-main "Release v1.2.3"
      │
      └─ Creates PR: origin/dev → origin/main
           │
           ├─ Code review
           ├─ CI passes
           └─ Merge (on GitHub)
                │
                └──► origin/main (production!)
```

### 5️⃣ Cleanup

```
GitHub: PR merged ✓

Local:
  ├─ git branch -d vk/1234-feature
  ├─ git push origin --delete vk/1234-feature
  ├─ git worktree remove /tmp/my-feature
  │
  ├─ git checkout main && git pull origin main
  │    (sync local main mirror)
  │
  └─ git checkout dev && git rebase origin/main
       (keep dev up-to-date with main)
```

## Common Scenarios

### Scenario A: Two worktrees need each other's code

```
Before:
  Worktree A (feature-a) ─────────┐
                                  ├──► Need to combine!
  Worktree B (feature-b) ─────────┘

Solution:
  1. Worktree A: integrate-to-dev
       → origin/dev now has feature-a

  2. Worktree B: sync-from-dev
       → Worktree B now has feature-a code!

  3. Worktree B: integrate-to-dev
       → origin/dev now has feature-a + feature-b

  4. Worktree A: sync-from-dev (if needed)
       → Worktree A now has feature-b code!

Result:
  Both worktrees have all changes
  origin/dev has combined code
  Ready to test together!
```

### Scenario B: Quick fix needed on main

```
Option 1 (Recommended):
  1. new-worktree hotfix/critical-bug /tmp/hotfix
  2. Fix the bug
  3. gh pr create --base main --head hotfix/critical-bug
  4. Merge directly to main (skip dev)
  5. Pull main into dev: git checkout dev && git merge origin/main

Option 2 (Via dev):
  1. new-worktree hotfix/critical-bug /tmp/hotfix
  2. Fix the bug
  3. integrate-to-dev
  4. release-dev-to-main "Hotfix: critical bug"
```

### Scenario C: Abandoned feature (don't want it)

```
Worktree A:
  ├─ Delete without merging anywhere
  ├─ git push origin --delete feature-a
  └─ git worktree remove /tmp/feature-a

Result:
  Feature never reaches dev or main
  Clean slate
```

## Anti-Patterns (Don't Do This!)

### ❌ Merging local main

```
BAD:
  git checkout main
  git merge feature-a    ← NEVER DO THIS

Why: Local main should mirror origin/main
     All merges happen via PR on GitHub
```

### ❌ Merging worktrees directly

```
BAD:
  cd /tmp/worktree-a
  git merge ../worktree-b/feature-b    ← NEVER DO THIS

Why: Breaks history, confuses tracking
     Use dev as the integration point
```

### ❌ Working in local main or dev

```
BAD:
  git checkout main
  vim file.txt
  git commit -m "changes"    ← NEVER DO THIS

Why: main = read-only mirror
     dev = integration only
     Work happens in feature branches
```

### ❌ Force pushing to main or dev

```
BAD:
  git push --force origin main    ← CATASTROPHIC
  git push --force origin dev     ← DANGEROUS

Why: Rewrites shared history
     Breaks other worktrees
     Only force-with-lease on feature branches if needed
```

## Decision Tree

```
┌─────────────────────────────────┐
│  I want to...                   │
└─────────────────────────────────┘
         │
         ├─ Start new work
         │   └──► new-worktree feature-name /path
         │
         ├─ Save my work
         │   └──► git add . && git commit && git push
         │
         ├─ Test with other worktrees
         │   └──► integrate-to-dev (this worktree)
         │        sync-from-dev (other worktrees)
         │
         ├─ Deploy to production
         │   └──► release-dev-to-main "title"
         │
         ├─ Get latest from main
         │   └──► git checkout main && git pull origin main
         │        (then rebase your branch if needed)
         │
         ├─ See all worktree status
         │   └──► worktree-status
         │
         └─ Clean up merged branches
             └──► cleanup-merged
```

## Graphite vs. This Workflow

### Graphite (Stacked PRs)

```
main
  └─ PR1: database schema
      └─ PR2: API using schema (depends on PR1)
          └─ PR3: UI using API (depends on PR2)

Challenge: Managing dependency chain
Solution: Graphite CLI tracks parent-child relationships
```

**Your workflow doesn't need this because:**
- You merge features to `dev` for integration
- One big PR from `dev → main` (not a stack)
- Features are parallel, not dependent chains

### Your Workflow (Parallel Integration)

```
main
  └─ dev
      ├─ feature-a ──┐
      ├─ feature-b ──┼──► All merge to dev in parallel
      └─ feature-c ──┘    Then one PR: dev → main
```

**Simpler for your use case:**
- No dependency tracking needed
- Natural fit for worktree-based development
- Dev branch handles integration automatically

## Quick Reference Card

| Command | What It Does |
|---------|-------------|
| `new-worktree <branch> <path>` | Create worktree from dev |
| `sync-from-dev` | Get latest dev changes |
| `integrate-to-dev` | Share your work via dev |
| `release-dev-to-main "title"` | Create production PR |
| `cleanup-merged` | Remove old branches |
| `worktree-status` | See all worktree states |
| `git-graph` | Visual git history |

## Aliases to Add to ~/.gitconfig

```ini
[alias]
    # Quick worktree navigation
    wt = worktree list
    wtadd = worktree add
    wtrm = worktree remove

    # Graph visualization
    lg = log --oneline --graph --all --decorate
    lga = log --oneline --graph --all --decorate --simplify-by-decoration

    # Branch cleanup
    gone = ! git fetch -p && git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -D

    # Quick dev sync
    dev-sync = !git checkout dev && git pull origin dev && git checkout -

    # Current branch name (useful for scripts)
    current = branch --show-current
```

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Load git workflow helpers
source ~/repos/Ushadow/scripts/git-workflow-helpers.sh
```

## Summary

- **Local main** = read-only mirror of origin/main
- **origin/dev** = integration/staging branch
- **Feature branches** = your actual work (in worktrees)
- **PRs** = gate to production (dev → main)
- **Worktrees** = isolated workspaces that sync via dev

**Golden Path:**
```
Feature branch → integrate to dev → test → PR to main → cleanup
```
