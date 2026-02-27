---
title: Git Worktrees
sidebar_position: 1
---

## What are Git Worktrees?

Git worktrees allow you to check out multiple branches simultaneously in separate directories. This is perfect for parallel development where you need to work on multiple features or bug fixes at the same time.

## Benefits

- **No context switching**: Keep your work in progress without git stash
- **Parallel development**: Work on multiple features simultaneously
- **Independent environments**: Each worktree can have its own containers and ports
- **Quick switching**: Jump between different branches instantly

## How the Launcher Uses Worktrees

The launcher automatically:
- Creates worktrees in a dedicated directory
- Sets up tmux windows for each worktree
- Configures environment-specific Docker containers
- Manages port allocation to avoid conflicts

## Creating a Worktree

1. Click "New Environment" in the Environments tab
2. Choose "Worktree"
3. Enter a branch name (or select existing branch)
4. The launcher will:
   - Create the worktree directory
   - Set up a tmux window
   - Configure default credentials
   - Start environment containers

## Best Practices

- Use descriptive names: `fix-login-bug`, `add-auth-feature`
- Keep worktrees focused on single tasks
- Merge and delete when done to save disk space
- Regularly pull main to avoid conflicts
