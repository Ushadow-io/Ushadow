---
title: Launcher Overview
sidebar_position: 1
---

# Launcher

The Launcher is a powerful Tauri-based desktop application for orchestrating parallel development environments with git worktrees, tmux sessions, and Docker containers.

## Key Features

- 🌲 **Git Worktree Management** - Work on multiple branches simultaneously in isolated environments
- 💻 **Tmux Integration** - Persistent terminal sessions that survive app restarts
- 🐳 **Docker Orchestration** - Start/stop containers per environment with visual status
- 📋 **Kanban Board** - Integrated ticket management with epics and environment linking
- ⚙️ **Smart Setup** - Auto-configure credentials for new worktrees
- 🔄 **One-Click Merge** - Rebase and merge worktrees back to main with cleanup
- 📊 **Multi-Project** - Manage multiple repositories with independent configurations

## Quick Links

- **[Getting Started](getting-started/quickstart)** - Install and set up the launcher
- **[Core Concepts](concepts/worktrees)** - Understand worktrees and environments
- **[Features](guides/tmux-integration)** - Explore tmux, Kanban, and more
- **[Custom Projects](guides/custom-projects)** - Configure the launcher for your own project
- **[Development](development/testing)** - Contributing and testing

## What is the Launcher?

Traditional development workflows require juggling multiple terminal windows, manually switching branches, and remembering which containers belong to which feature. The launcher solves this by providing a unified interface for managing parallel development environments.

### Development Workflow

1. **Create a ticket** in the Kanban board
2. **Create worktree** - Click "New Environment" and choose branch name
3. **Auto-setup** - Launcher creates worktree, tmux window, and starts containers
4. **Develop** - Code in VS Code, run commands in tmux
5. **Track progress** - Update ticket status in Kanban board
6. **Merge & Cleanup** - When done, merge worktree back to main with one click

## Architecture

Built with:
- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Rust + Tauri
- **Platform**: Cross-platform (macOS, Windows, Linux)

## Get Started

Ready to dive in? Start with the [Quickstart Guide](getting-started/quickstart) or jump straight to [configuring for your own project](guides/custom-projects).
