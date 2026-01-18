# Quick Start Checklist

Get your worktree workflow organized in 15 minutes.

## ✅ Immediate Actions (Do This Now)

### 1. Load Helper Scripts (2 min)

```bash
# Add to your shell config
echo 'source ~/repos/Ushadow/scripts/git-workflow-helpers.sh' >> ~/.bashrc

# Or for zsh:
echo 'source ~/repos/Ushadow/scripts/git-workflow-helpers.sh' >> ~/.zshrc

# Reload
source ~/.bashrc  # or source ~/.zshrc

# Test
workflow-help
```

**✓ Success:** You see the workflow help menu.

---

### 2. Ensure Dev Branch Exists (1 min)

```bash
# Check if dev exists
git branch -a | grep dev

# If not, create it from main
git checkout -b dev origin/main
git push origin dev

# Set dev to track origin/dev
git branch --set-upstream-to=origin/dev dev

# Go back to your feature branch
git checkout -
```

**✓ Success:** `git branch -a` shows both `dev` and `origin/dev`.

---

### 3. Clean Up [gone] Branches (3 min)

```bash
# See what will be deleted
git fetch --prune origin
git branch -vv | grep ': gone]'

# Delete them
cleanup-merged
```

**✓ Success:** No more branches marked `[gone]`.

---

### 4. Verify Current Worktree Setup (2 min)

```bash
# Check all worktrees
worktree-status

# Expected output:
# - List of worktrees
# - Their branches
# - Commit status (ahead/behind)
# - Uncommitted changes
```

**✓ Success:** You understand which worktrees are active and their status.

---

### 5. Set Up Git Aliases (2 min)

```bash
# Quick graph view
git config --global alias.lg "log --oneline --graph --all --decorate"

# Current branch name
git config --global alias.current "branch --show-current"

# Clean up merged branches
git config --global alias.gone "!git fetch -p && git branch -vv | grep ': gone]' | awk '{print \$1}' | xargs git branch -D"

# Quick dev sync
git config --global alias.dev-sync "!git checkout dev && git pull origin dev && git checkout -"
```

**✓ Success:** `git lg` shows a pretty graph, `git current` shows your branch.

---

## 📖 Read These Docs (5 min)

1. **Main strategy:** `docs/GITHUB-WORKTREE-STRATEGY.md`
   - Read the "Summary" section
   - Read the "One-Page Cheat Sheet"

2. **Visual guide:** `docs/WORKTREE-FLOW-DIAGRAM.md`
   - Look at "The Big Picture" diagram
   - Read "Flow Step-by-Step"

3. **Tool guide:** `docs/TOOL-INTEGRATION-GUIDE.md`
   - Read "Recommended Tool Stack"
   - Skim "Tool Decision Matrix"

**✓ Success:** You understand the basic flow: feature → dev → main.

---

## 🎯 Practice Workflows

### Practice A: Integrate Existing Worktree to Dev (5 min)

```bash
# Pick a worktree you're working on
cd /path/to/your/worktree

# Ensure changes are committed
git status

# If uncommitted, commit them:
git add .
git commit -m "WIP: current progress"

# Push to remote
git push origin $(git current)

# Integrate to dev
integrate-to-dev

# Verify on GitHub
# Visit: https://github.com/Ushadow-io/Ushadow/tree/dev
# You should see your changes!
```

**✓ Success:** Your changes are now in `origin/dev`.

---

### Practice B: Sync Another Worktree with Dev (3 min)

```bash
# Go to a different worktree
cd /path/to/another/worktree

# Sync with dev (gets Practice A's changes)
sync-from-dev

# Check the log
git log --oneline -5

# You should see the merge commit from dev
```

**✓ Success:** This worktree now has the integrated changes from Practice A.

---

### Practice C: Create Test PR from Dev to Main (5 min)

```bash
# Ensure dev has some changes
git checkout dev
git log --oneline origin/main..HEAD

# If dev has changes, create PR
release-dev-to-main "Test PR: Worktree workflow"

# Visit the PR on GitHub
# Add [DRAFT] or [TEST] to the title
# Close it (or merge if you want)
```

**✓ Success:** You created a PR from `dev → main` on GitHub.

---

## 🔧 Configure Your Tools (Optional)

### Vibe Kanban

If you can configure it:
```json
{
  "default_base_branch": "dev",
  "branch_prefix": "vk/"
}
```

If not configurable, just rebase after creation:
```bash
# After Vibe creates a worktree
cd /path/to/vibe/worktree
git fetch origin dev
git rebase origin/dev
```

---

### Workmux

If you can configure it:
```yaml
base_branch: dev
merge_strategy: disabled  # Use git CLI instead
```

If not configurable:
- Use Workmux only for navigation (`workmux switch`)
- Use git CLI for all merge operations

---

### Graphite

Decision time:

**Do you regularly create dependent PR chains?**
- Example: PR1 (database) → PR2 (API) → PR3 (UI)
- Each PR builds on the previous one

**Yes, I do:**
```bash
# Initialize Graphite
gt repo init --trunk main

# Create branches via Graphite from now on
gt create feature-name --parent dev
git worktree add /path feature-name
```

**No, I don't (most people):**
```bash
# Uninstall Graphite (optional)
brew uninstall graphite

# Or just ignore it, use git CLI
```

---

## 📋 Daily Workflow Checklist

Print this and keep it handy:

```
□ Start work:
  □ cd /path/to/worktree (or workmux switch)
  □ sync-from-dev (get latest integration)
  □ git pull origin $(git current) (get latest feature branch)

□ During work:
  □ git add . && git commit -m "..."
  □ git push origin $(git current)

□ Ready to share with other worktrees:
  □ integrate-to-dev
  □ Notify team: "integrated feature X to dev"

□ In other worktrees:
  □ sync-from-dev (when you want integrated changes)

□ Ready for production:
  □ release-dev-to-main "Release title"
  □ Review PR on GitHub
  □ Merge PR

□ After PR merged:
  □ cleanup-merged
  □ git worktree remove /path (if done with worktree)
  □ git checkout dev && git rebase origin/main
```

---

## 🚨 Common Mistakes to Avoid

### ❌ Mistake 1: Working in local main
```bash
# BAD
git checkout main
vim file.txt
git commit -m "changes"
```

**Fix:** Local main is read-only. Work in feature branches.

---

### ❌ Mistake 2: Merging to local main
```bash
# BAD
git checkout main
git merge feature-branch
```

**Fix:** All merges to main happen via PR on GitHub.

---

### ❌ Mistake 3: Force pushing to dev or main
```bash
# CATASTROPHIC
git push --force origin main
git push --force origin dev
```

**Fix:** Never force push to shared branches. Only `--force-with-lease` on feature branches.

---

### ❌ Mistake 4: Merging worktrees directly
```bash
# BAD
cd worktree-a
git merge ../worktree-b/feature-b
```

**Fix:** Use dev as integration point:
```bash
# In worktree-a
integrate-to-dev

# In worktree-b
sync-from-dev
```

---

### ❌ Mistake 5: Forgetting to push before integrating
```bash
# BAD
integrate-to-dev  # But changes not pushed!
```

**Fix:** Helper script pushes for you, but verify:
```bash
git push origin $(git current)
integrate-to-dev
```

---

## 📊 Success Metrics

After 1 week, you should:
- ✅ Have 0 branches marked `[gone]`
- ✅ All feature branches merged to dev or main
- ✅ Local main at same commit as origin/main
- ✅ Dev branch exists and has recent merges
- ✅ No uncommitted changes in abandoned worktrees

Run this check:
```bash
# Clean state?
git fetch --prune origin
git branch -vv | grep ': gone]'  # Should be empty

# Main in sync?
git checkout main
git pull origin main
git log --oneline origin/main..HEAD  # Should be empty

# Dev active?
git checkout dev
git log --oneline origin/main..HEAD  # Should show recent work
```

---

## 🎓 Next Steps

Once you're comfortable:

1. **Automate more:**
   - Set up git hooks for auto-formatting
   - Add pre-commit hooks for tests
   - Configure CI/CD for dev branch

2. **Team alignment:**
   - Share docs with team
   - Set up branch protection rules
   - Create PR template

3. **Advanced workflows:**
   - Cherry-picking specific commits
   - Rebasing feature branches
   - Squashing commits before merge

4. **Monitoring:**
   - Track worktree disk usage
   - Alert on stale branches
   - Automate cleanup scripts

---

## 🆘 Troubleshooting

### Problem: "integrate-to-dev command not found"

**Solution:**
```bash
source ~/repos/Ushadow/scripts/git-workflow-helpers.sh
# Or restart your terminal
```

---

### Problem: "dev branch doesn't exist"

**Solution:**
```bash
git checkout -b dev origin/main
git push origin dev
```

---

### Problem: "Merge conflict when syncing from dev"

**Solution:**
```bash
# See conflicted files
git status

# Resolve conflicts in editor
vim <conflicted-file>

# Mark as resolved
git add <conflicted-file>

# Complete merge
git commit

# If too complex, abort and ask for help
git merge --abort
```

---

### Problem: "Worktree has uncommitted changes, can't remove"

**Solution:**
```bash
cd /path/to/worktree

# Option 1: Commit them
git add . && git commit -m "Final changes"
git push origin $(git current)

# Option 2: Stash them
git stash push -m "Unfinished work"

# Option 3: Discard them (careful!)
git reset --hard HEAD

# Now remove
git worktree remove /path/to/worktree
```

---

### Problem: "Origin/dev is way behind origin/main"

**Solution:**
```bash
# Sync dev with main
git checkout dev
git rebase origin/main
git push origin dev --force-with-lease

# Notify team: "rebased dev on main, please sync your worktrees"
```

---

## 📞 Getting Help

If stuck:

1. **Check docs:**
   - `docs/GITHUB-WORKTREE-STRATEGY.md` - Main strategy
   - `docs/WORKTREE-FLOW-DIAGRAM.md` - Visual guide
   - `docs/TOOL-INTEGRATION-GUIDE.md` - Tool-specific help

2. **Run diagnostics:**
   ```bash
   worktree-status  # Check all worktrees
   git-graph        # Visualize branch history
   git status       # Current state
   ```

3. **Ask specific questions:**
   - "How do I combine worktree A and B?"
   - "Should I merge or rebase here?"
   - "What if I want to undo the last integration?"

---

## ✨ You're Ready!

Once you've completed this checklist:
- ✅ Helper scripts loaded
- ✅ Dev branch exists
- ✅ Old branches cleaned up
- ✅ Docs read
- ✅ Practice workflows completed

You now have a streamlined worktree workflow! 🎉

**Remember the golden path:**
```
New feature → Work in worktree → integrate-to-dev →
Test with others → release-dev-to-main → Merge PR → Cleanup
```

Happy coding! 🚀
