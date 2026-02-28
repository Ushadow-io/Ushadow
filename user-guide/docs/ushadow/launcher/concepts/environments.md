---
title: Environments
sidebar_position: 2
---

## What are Environments?

In the launcher, an "environment" is a complete development setup that includes:
- A directory (worktree or linked folder)
- A tmux session/window
- Docker containers with unique ports
- Environment-specific configuration

## Environment Types

### Worktree Environments
Git worktrees managed by the launcher. These are recommended for most development workflows.

**Benefits:**
- Automatic setup
- Integrated with Kanban tickets
- One-click merge back to main
- Clean separation between features

### Linked Environments
Existing directories you want to manage through the launcher without creating a worktree.

**Use cases:**
- Main development directory
- External projects
- Legacy setups

## Environment Lifecycle

1. **Creation**: Launcher sets up directory, tmux, and containers
2. **Development**: Work in the environment, use tmux sessions
3. **Monitoring**: Real-time status badges show activity
4. **Cleanup**: Merge and delete when work is complete

## Multi-Environment Workflows

The launcher excels at managing multiple environments simultaneously:

- Work on feature A in one worktree
- Fix bug B in another worktree
- Review PR in a third worktree
- All with independent containers and tmux sessions

## Environment Status

Each environment shows real-time status:
- 🟢 **Green**: All systems operational
- 🟡 **Yellow**: Partial (some services down)
- 🔴 **Red**: Stopped or error state
- 🔵 **Blue**: Tmux activity indicator
