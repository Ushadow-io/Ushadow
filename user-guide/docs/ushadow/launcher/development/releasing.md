---
title: Releasing
sidebar_position: 2
---


## Quick Start

```bash
cd ushadow/launcher
make release
```

This launches an interactive workflow that:
1. Shows current version and suggests next versions
2. Prompts for a release name
3. Lets you select target platforms
4. Pushes to GitHub and triggers builds

## The Release Flow

```
╭─────────────────────────────────────────╮
│  Ushadow Launcher Release              │
╰─────────────────────────────────────────╯

Current version: 0.1.0

Suggested versions:
  1) 0.1.1  (patch - bug fixes)
  2) 0.2.0  (minor - new features)
  3) 1.0.0  (major - breaking changes)
  4) Custom version

Select version [1]:

Enter release name (optional, press Enter to skip):
> Initial Public Release

Select platforms to build:
  1) All platforms (macOS, Windows, Linux) [default]
  2) macOS only
  3) Windows only
  ...

═══════════════════════════════════════════
Release Summary
═══════════════════════════════════════════
  Version:      0.1.1
  Release name: Initial Public Release
  Platforms:    all
═══════════════════════════════════════════

Proceed with release? (y/N) y
```

## What Happens

1. **Version files updated** - `package.json`, `tauri.conf.json`, `Cargo.toml`
2. **Changes committed** - `chore(launcher): release v0.1.1`
3. **Tag created** - `launcher-v0.1.1`
4. **Pushed to GitHub** - Triggers the release workflow
5. **GitHub Actions builds** - macOS, Windows, Linux (in parallel)
6. **Artifacts uploaded** - `.dmg`, `.msi`, `.exe`, `.deb`, `.AppImage`

## Prerequisites

- GitHub CLI installed and authenticated (`gh auth login`)
- Push access to the repository

## Other Commands

```bash
make version      # Show current version
make build        # Build locally for testing
make dev          # Start dev server
make clean        # Clean build artifacts
```

## Manual Release (Alternative)

If you prefer manual control:

```bash
# 1. Bump version
./scripts/version.sh bump patch

# 2. Commit
git add ushadow/launcher/
git commit -m "chore(launcher): release v$(./scripts/version.sh get)"

# 3. Tag and push
git tag launcher-v$(./scripts/version.sh get)
git push origin main --tags
```

## Build Outputs

| Platform | Formats |
|----------|---------|
| macOS | `.dmg` (universal: Intel + Apple Silicon) |
| Windows | `.msi`, `.exe` (NSIS installer) |
| Linux | `.deb`, `.AppImage` |

## Versioning

- **Patch** (0.1.0 → 0.1.1): Bug fixes
- **Minor** (0.1.0 → 0.2.0): New features
- **Major** (0.1.0 → 1.0.0): Breaking changes
