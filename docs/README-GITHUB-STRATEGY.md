# GitHub Worktree Strategy - Documentation Index

Complete guide to managing your multi-worktree development workflow.

## 📚 Documentation Overview

This documentation suite provides a comprehensive strategy for managing git workflows across multiple worktrees, integrating with Vibe Kanban, Claude Code, Workmux, and other tools.

---

## 🚀 Start Here

### For Immediate Action
**→ [QUICK-START-CHECKLIST.md](./QUICK-START-CHECKLIST.md)**
- 15-minute setup guide
- Essential commands to run right now
- Practice workflows to get started

### For Daily Reference
**→ [REFERENCE-CARD.md](./REFERENCE-CARD.md)**
- One-page command reference
- Quick troubleshooting
- Common scenarios
- Print this and keep it visible!

---

## 📖 Complete Documentation

### Core Strategy
**→ [GITHUB-WORKTREE-STRATEGY.md](./GITHUB-WORKTREE-STRATEGY.md)** (11KB)

Comprehensive strategy document covering:
- Mental model for worktree workflows
- Role of `main`, `dev`, and feature branches
- How to combine work from multiple worktrees
- Comparison with Graphite stacked PRs
- Migration path from current setup
- One-page cheat sheet

**Read this for:** Understanding the overall strategy and philosophy.

---

### Visual Guide
**→ [WORKTREE-FLOW-DIAGRAM.md](./WORKTREE-FLOW-DIAGRAM.md)** (13KB)

Visual workflow diagrams including:
- Big picture architecture
- Step-by-step flow diagrams
- Common scenarios illustrated
- Anti-patterns to avoid
- Decision trees
- Quick reference aliases

**Read this for:** Visual understanding of how everything flows.

---

### PR Review Strategy (NEW!)
**→ [PR-REVIEW-STRATEGY.md](./PR-REVIEW-STRATEGY.md)** (16KB)

How to handle code reviews without huge PRs:
- One PR per feature (small, reviewable)
- Use `dev` for integration testing only
- Draft PRs for work in progress
- Managing multiple concurrent PRs
- Sync strategies when PRs merge

**Read this for:** Understanding how to keep PRs small while testing in dev.

---

### Tool Integration
**→ [TOOL-INTEGRATION-GUIDE.md](./TOOL-INTEGRATION-GUIDE.md)** (15KB)

How to integrate your tools:
- Vibe Kanban configuration
- Claude Code integration
- Workmux usage (and what to avoid)
- Graphite comparison (and why to skip it)
- Tool responsibility matrix
- Example workflows for each tool

**Read this for:** Specific guidance on configuring and using your tools.

---

## 🛠️ Helper Scripts

### Main Script
**→ [scripts/git-workflow-helpers.sh](../scripts/git-workflow-helpers.sh)** (7KB)

Provides these commands:
- `new-worktree` - Create worktree from dev
- `sync-from-dev` - Pull latest dev changes
- `integrate-to-dev` - Share your work via dev
- `release-dev-to-main` - Create PR to production
- `cleanup-merged` - Remove old branches
- `worktree-status` - Check all worktree states
- `git-graph` - Visual history
- `workflow-help` - Show help

**To use:**
```bash
source ~/repos/Ushadow/scripts/git-workflow-helpers.sh
# Or add to ~/.bashrc for permanent access
```

---

## 🎯 Quick Answers to Your Questions

### Q: "What role does local main have?"
**A:** Local `main` is a **read-only mirror** of `origin/main`.

- ✅ Use it to: Sync with `git pull origin main`
- ❌ Never: Work in it, commit to it, or merge into it

**See:** [GITHUB-WORKTREE-STRATEGY.md](./GITHUB-WORKTREE-STRATEGY.md#1-local-main-has-no-active-role-in-worktree-workflows)

---

### Q: "How do I combine different worktrees not ready for main?"
**A:** Use `dev` as your integration/staging branch.

```bash
# In worktree A
integrate-to-dev

# In worktree B
sync-from-dev  # Gets A's changes
integrate-to-dev  # Adds B's changes

# Now origin/dev has both A + B combined
# Test, then create PR: dev → main
```

**See:** [WORKTREE-FLOW-DIAGRAM.md](./WORKTREE-FLOW-DIAGRAM.md#scenario-a-two-worktrees-need-each-others-code)

---

### Q: "How do I get features into main? Do I need a huge dev→main PR?"
**A:** **No!** Each feature creates its own small PR directly to `main`.

**Recommended workflow:**
1. Create draft PR immediately when starting feature
2. Test feature in `dev` (with other features)
3. Mark PR ready for review when tested
4. Review and merge individual PR to `main`
5. Sync `dev` with `main` after merge

**Commands:**
```bash
create-draft-pr "Add feature X"  # Step 1
integrate-to-dev                 # Step 2
mark-pr-ready                    # Step 3
gh pr merge vk/123-feature       # Step 4
sync-dev-with-main              # Step 5
```

**Result:** Small PRs (200-400 lines), thoroughly tested in `dev` first.

**See:** [PR-REVIEW-STRATEGY.md](./PR-REVIEW-STRATEGY.md)

---

### Q: "Should I use Graphite with worktrees?"
**A:** **No, skip Graphite** for your workflow.

**Why:**
- Graphite is for **stacked PRs** (dependent chains: PR1 → PR2 → PR3)
- Your workflow uses **parallel integration** (feature-a, feature-b → dev → main)
- Graphite expects branches created via `gt create` (conflicts with Vibe Kanban)
- Your `dev` branch handles integration - no need for stacks

**Exception:** Only use if you regularly have dependent PR chains.

**See:** [TOOL-INTEGRATION-GUIDE.md](./TOOL-INTEGRATION-GUIDE.md#4-graphite)

---

### Q: "What's the difference between stacked PRs and commits?"
**A:**

| Concept | What It Is | Example |
|---------|-----------|---------|
| **Commit** | Single change in git history | `fix: typo in readme` |
| **PR** | Collection of commits for review | "Add authentication feature" (10 commits) |
| **Stacked PR** | Chain of dependent PRs | PR1 (database) → PR2 (API) → PR3 (UI) |

**Your workflow:**
- Multiple **commits** in each feature branch
- Each feature → one **PR** to main (or merge to dev)
- **No stacking needed** - features are parallel, not dependent

**See:** [GITHUB-WORKTREE-STRATEGY.md](./GITHUB-WORKTREE-STRATEGY.md#what-are-stacked-prs)

---

### Q: "How do Vibe Kanban, Claude Code, and Workmux fit together?"
**A:**

| Tool | Use For | Don't Use For |
|------|---------|---------------|
| **Vibe Kanban** | Creating task worktrees | Git operations |
| **Claude Code** | Code generation | Merging |
| **Workmux** | Navigation, status viewing | Merging (use git CLI) |
| **Git CLI** | All git merge operations | - |

**Golden Rule:** Each tool has ONE job. Use git CLI for all merge operations.

**See:** [TOOL-INTEGRATION-GUIDE.md](./TOOL-INTEGRATION-GUIDE.md#tool-comparison-matrix)

---

## 📋 Reading Order

### If You're New
1. [QUICK-START-CHECKLIST.md](./QUICK-START-CHECKLIST.md) - Get set up (15 min)
2. [REFERENCE-CARD.md](./REFERENCE-CARD.md) - Learn essential commands
3. [WORKTREE-FLOW-DIAGRAM.md](./WORKTREE-FLOW-DIAGRAM.md) - Understand the flow visually

### If You Want Deep Understanding
1. [GITHUB-WORKTREE-STRATEGY.md](./GITHUB-WORKTREE-STRATEGY.md) - Core philosophy
2. [WORKTREE-FLOW-DIAGRAM.md](./WORKTREE-FLOW-DIAGRAM.md) - Visual reference
3. [TOOL-INTEGRATION-GUIDE.md](./TOOL-INTEGRATION-GUIDE.md) - Tool-specific setup

### If You're Troubleshooting
1. [REFERENCE-CARD.md](./REFERENCE-CARD.md#troubleshooting-quick-fixes) - Quick fixes
2. [QUICK-START-CHECKLIST.md](./QUICK-START-CHECKLIST.md#-troubleshooting) - Common problems

---

## 🎯 The Essential Workflow (TL;DR)

```
┌─────────────────────────────────────────────────┐
│  1. new-worktree vk/123-feature /tmp/feature    │
│  2. cd /tmp/feature && [code code code]         │
│  3. git add . && git commit && git push         │
│  4. integrate-to-dev                            │
│  5. (other worktrees) sync-from-dev             │
│  6. release-dev-to-main "Release title"         │
│  7. cleanup-merged                              │
└─────────────────────────────────────────────────┘
```

**That's it!** Everything else is details.

---

## 🔑 Key Concepts

### Mental Model
```
Local main = Read-only mirror of origin/main
origin/dev = Integration/staging branch
Feature branches = Your actual work (in worktrees)
PRs = Gate to production (dev → main)
```

### Branch Flow
```
feature-a ──┐
            ├──► origin/dev ──► PR ──► origin/main
feature-b ──┘
```

### Three Nevers
1. Never work in local `main`
2. Never merge to local `main`
3. Never force push to `main` or `dev`

---

## 📞 Need Help?

### Quick Questions
- Check [REFERENCE-CARD.md](./REFERENCE-CARD.md) for common scenarios

### Setup Issues
- See [QUICK-START-CHECKLIST.md](./QUICK-START-CHECKLIST.md#-troubleshooting)

### Conceptual Questions
- Read [GITHUB-WORKTREE-STRATEGY.md](./GITHUB-WORKTREE-STRATEGY.md#faq)

### Tool-Specific Issues
- See [TOOL-INTEGRATION-GUIDE.md](./TOOL-INTEGRATION-GUIDE.md#tool-specific-gotchas)

---

## 📊 File Sizes & Reading Time

| File | Size | Reading Time |
|------|------|--------------|
| QUICK-START-CHECKLIST.md | 10KB | 10 min |
| REFERENCE-CARD.md | 10KB | 5 min (reference) |
| GITHUB-WORKTREE-STRATEGY.md | 11KB | 20 min |
| WORKTREE-FLOW-DIAGRAM.md | 13KB | 15 min |
| TOOL-INTEGRATION-GUIDE.md | 15KB | 25 min |
| git-workflow-helpers.sh | 7KB | 5 min (skim) |

**Total reading time:** ~1.5 hours for full understanding
**Minimum for basic use:** 15 minutes (quick-start + reference card)

---

## 🎓 Learning Path

### Day 1 (15 min)
- [ ] Read [QUICK-START-CHECKLIST.md](./QUICK-START-CHECKLIST.md)
- [ ] Load helper scripts
- [ ] Practice one integration workflow

### Day 2 (30 min)
- [ ] Read [REFERENCE-CARD.md](./REFERENCE-CARD.md)
- [ ] Review [WORKTREE-FLOW-DIAGRAM.md](./WORKTREE-FLOW-DIAGRAM.md) diagrams
- [ ] Practice combining two worktrees

### Week 1 (1 hour)
- [ ] Read [GITHUB-WORKTREE-STRATEGY.md](./GITHUB-WORKTREE-STRATEGY.md)
- [ ] Configure your tools per [TOOL-INTEGRATION-GUIDE.md](./TOOL-INTEGRATION-GUIDE.md)
- [ ] Clean up old branches

### Ongoing
- [ ] Keep [REFERENCE-CARD.md](./REFERENCE-CARD.md) open while working
- [ ] Review troubleshooting when issues arise
- [ ] Refine workflow based on your needs

---

## ✨ Success Criteria

After using this workflow for 1 week, you should:

✅ **Understand:**
- Role of `main`, `dev`, and feature branches
- How to integrate work from multiple worktrees
- When to use each tool

✅ **Be Able To:**
- Create new worktrees from `dev`
- Integrate features to `dev`
- Sync worktrees via `dev`
- Create PRs from `dev` to `main`
- Clean up merged branches

✅ **Have:**
- Zero `[gone]` branches
- Active `origin/dev` branch
- Clean git history
- Automated helper scripts loaded

---

## 🔄 Updates & Maintenance

This documentation was created based on your current setup:
- **Date:** 2026-01-18
- **Active worktrees:** 16
- **Tools in use:** Vibe Kanban, Claude Code, Workmux, Git CLI, GitHub CLI

**To update:**
1. Modify the relevant document(s)
2. Update this index if adding new files
3. Commit with: `docs: update GitHub worktree strategy`

---

## 📁 File Structure

```
docs/
├── README-GITHUB-STRATEGY.md          ← You are here
├── QUICK-START-CHECKLIST.md           ← Start here
├── REFERENCE-CARD.md                  ← Daily reference
├── GITHUB-WORKTREE-STRATEGY.md        ← Core strategy
├── WORKTREE-FLOW-DIAGRAM.md           ← Visual guide
└── TOOL-INTEGRATION-GUIDE.md          ← Tool setup

scripts/
└── git-workflow-helpers.sh            ← Helper commands
```

---

## 🎉 You're Ready!

Start with the [QUICK-START-CHECKLIST.md](./QUICK-START-CHECKLIST.md) and you'll have a streamlined workflow in 15 minutes.

**The workflow in one sentence:**
> Create worktrees for features, integrate to `dev` for testing together, release to `main` via PR.

Happy coding! 🚀
