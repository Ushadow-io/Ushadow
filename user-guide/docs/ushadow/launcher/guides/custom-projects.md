---
title: Custom Projects
sidebar_position: 6
---


This guide explains how to adapt the Ushadow Launcher for your own development project. The launcher provides a powerful workflow for managing parallel development environments with git worktrees, tmux sessions, Docker containers, and optional Kanban board integration.

## Table of Contents

- [Overview](#overview)
- [Quick Start Checklist](#quick-start-checklist)
- [Core Configuration Files](#core-configuration-files)
- [Step-by-Step Configuration](#step-by-step-configuration)
- [Optional Features](#optional-features)
- [Building and Distribution](#building-and-distribution)
- [Troubleshooting](#troubleshooting)

## Overview

The launcher is built with Tauri (Rust + Web frontend) and provides:

- **Git Worktree Management** - Work on multiple branches simultaneously
- **Tmux Integration** - Persistent terminal sessions per environment
- **Docker Orchestration** - Start/stop containers per environment
- **Prerequisites Management** - Auto-check and install required tools
- **Kanban Board** (Optional) - Integrated ticket management
- **Cross-Platform** - Build for macOS, Windows, and Linux

## Quick Start Checklist

To configure the launcher for your project, you'll need to modify these files:

- [ ] `tauri.conf.json` - App name, bundle ID, window settings
- [ ] `package.json` - Package metadata
- [ ] `prerequisites.yaml` - Define required tools for your project
- [ ] `bundle-resources.sh` - Select which project files to bundle
- [ ] `.workmux.yaml` (in project root) - Worktree/tmux workflow
- [ ] App icons in `src-tauri/icons/`
- [ ] Frontend branding (optional)

## Core Configuration Files

### 1. `tauri.conf.json` - Application Configuration

**Location**: `ushadow/launcher/src-tauri/tauri.conf.json`

**Key sections to customize**:

```json
{
  "package": {
    "productName": "YourAppName",
    "version": "0.1.0"
  },
  "tauri": {
    "bundle": {
      "identifier": "com.yourcompany.launcher",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "resources": [
        "prerequisites.yaml",
        "bundled/**/*"
      ]
    },
    "windows": [{
      "title": "YourApp Launcher",
      "width": 1200,
      "height": 1000
    }]
  }
}
```

**Important fields**:
- `productName` - Display name of your app
- `bundle.identifier` - Unique reverse-domain identifier (e.g., `com.acme.myapp-launcher`)
- `bundle.icon` - Path to app icons
- `windows[0].title` - Window title bar text

### 2. `prerequisites.yaml` - Required Tools

**Location**: `ushadow/launcher/src-tauri/prerequisites.yaml`

Define what tools your project needs. Each prerequisite has:

```yaml
prerequisites:
  - id: docker
    name: Docker
    display_name: Docker
    description: Container platform
    platforms: [macos, windows, linux]
    check_command: docker --version
    check_running_command: docker info
    fallback_paths:
      macos:
        - /usr/local/bin/docker
      windows:
        - C:\Program Files\Docker\Docker\resources\bin\docker.exe
      linux:
        - /usr/bin/docker
    optional: false
    has_service: true
    category: infrastructure
```

**Key fields**:
- `id` - Unique identifier
- `platforms` - Which platforms need this (`macos`, `windows`, `linux`)
- `check_command` - Command to verify installation
- `check_running_command` - Command to verify service is running (optional)
- `optional` - Whether the tool is required
- `category` - Group related tools (`development`, `infrastructure`, `networking`)

**Common categories**:
- `package_manager` - Homebrew, Chocolatey, etc.
- `development` - Git, Python, Node.js, etc.
- `infrastructure` - Docker, databases, etc.
- `networking` - VPN tools, etc.

### 3. `bundle-resources.sh` - Project Files to Bundle

**Location**: `ushadow/launcher/bundle-resources.sh`

This script copies project files into the launcher at build time. Modify it to bundle your project's setup scripts and configuration:

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUNDLE_DIR="$SCRIPT_DIR/src-tauri/bundled"

echo "Bundling resources for launcher..."

# Clean and create bundle directory
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

# Copy your project's setup scripts
echo "  Copying setup/ ..."
cp -r "$REPO_ROOT/setup" "$BUNDLE_DIR/"

# Copy Docker Compose files
echo "  Copying compose/ ..."
mkdir -p "$BUNDLE_DIR/compose"
cp "$REPO_ROOT/docker-compose.yml" "$BUNDLE_DIR/compose/"

# Copy any other necessary files
cp "$REPO_ROOT/scripts/start-dev.sh" "$BUNDLE_DIR/"

echo "✓ Resources bundled successfully"
```

**What to bundle**:
- Setup/installation scripts
- Docker Compose files for infrastructure
- Default configuration templates
- Any scripts needed to start your project

**What NOT to bundle**:
- Source code (handled by git worktrees)
- Large binary files
- Generated files (`node_modules`, `.venv`, etc.)

### 4. `.workmux.yaml` - Worktree/Tmux Workflow

**Location**: `<your-project-root>/.workmux.yaml`

This file configures the git worktree + tmux workflow. Place it in your project's root directory:

```yaml
# Main branch to merge into
main_branch: "main"

# Where worktrees are created
worktree_dir: "../"

# Prefix for tmux window names
window_prefix: "myapp-"

# Default merge strategy: merge | rebase | squash
merge_strategy: "rebase"

# Commands to run after worktree creation
post_create:
  # Example: Setup environment-specific configuration
  - "cp .env.example .env"
  - "sed -i '' 's/PORT=3000/PORT=$(shuf -i 3000-4000 -n 1)/' .env"
  # Example: Setup VSCode workspace colors
  - "bash scripts/setup-vscode-colors.sh"

# Commands to run before merging
pre_merge:
  # Example: Run tests
  - "npm test"
  # Example: Run linter
  - "npm run lint"

# Commands to run before removing worktree
pre_remove:
  # Example: Stop environment containers
  - "docker-compose -f docker-compose.$(basename $(pwd)).yml down"

# File operations (applied after worktree creation)
files:
  # Copy these files to each worktree (separate per env)
  copy:
    - ".env"
    - ".vscode/settings.json"

  # Symlink these (shared across worktrees)
  symlink:
    - "node_modules"
    - ".venv"

# Tmux pane layout
panes:
  - command: "echo 'Environment ready!' && $SHELL"
    focus: true
    split: horizontal
    size: 75%

# Agent status icons (shown in tmux status bar)
status_icons:
  working: '🤖'
  waiting: '💬'
  done: '✅'
  error: '❌'

status_format: true
```

### 5. `package.json` - Package Metadata

**Location**: `ushadow/launcher/package.json`

Update the package metadata for your project:

```json
{
  "name": "your-project-launcher",
  "version": "0.1.0",
  "description": "Your Project Desktop Launcher",
  "private": true
}
```

## Step-by-Step Configuration

### Step 1: Clone and Setup

```bash
# Clone or copy the launcher directory
cd your-project-root
cp -r path/to/ushadow/launcher ./launcher
cd launcher

# Install dependencies
npm install
```

### Step 2: Configure App Branding

#### Update `tauri.conf.json`:

```json
{
  "package": {
    "productName": "MyApp Launcher",
    "version": "0.1.0"
  },
  "tauri": {
    "bundle": {
      "identifier": "com.mycompany.myapp-launcher"
    },
    "windows": [{
      "title": "MyApp Development Launcher"
    }]
  }
}
```

#### Create App Icons:

1. Place a 1024x1024 PNG at `src-tauri/icons/app-icon.png`
2. Run: `npm run icons`

This generates all required icon sizes for each platform.

### Step 3: Define Prerequisites

Edit `src-tauri/prerequisites.yaml` to match your project's requirements.

**Example - Simple Web Project**:

```yaml
prerequisites:
  - id: git
    name: Git
    platforms: [macos, windows, linux]
    check_command: git --version
    optional: false
    category: development

  - id: node
    name: Node.js
    platforms: [macos, windows, linux]
    check_command: node --version
    optional: false
    category: development

  - id: docker
    name: Docker
    platforms: [macos, windows, linux]
    check_command: docker --version
    check_running_command: docker info
    optional: false
    has_service: true
    category: infrastructure
```

**Example - Python Project**:

```yaml
prerequisites:
  - id: git
    name: Git
    platforms: [macos, windows, linux]
    check_command: git --version
    optional: false
    category: development

  - id: python
    name: Python 3
    platforms: [macos, windows, linux]
    check_commands:
      - python3 --version
      - python --version
    version_filter: "Python 3"
    optional: false
    category: development

  - id: docker
    name: Docker
    platforms: [macos, windows, linux]
    check_command: docker --version
    optional: false
    category: infrastructure
```

### Step 4: Configure Bundled Resources

Edit `bundle-resources.sh` to copy your project's necessary files:

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUNDLE_DIR="$SCRIPT_DIR/src-tauri/bundled"

rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

# Copy your project-specific files
cp -r "$REPO_ROOT/scripts" "$BUNDLE_DIR/"
cp "$REPO_ROOT/docker-compose.yml" "$BUNDLE_DIR/"
cp "$REPO_ROOT/.env.example" "$BUNDLE_DIR/"

echo "✓ Resources bundled"
```

### Step 5: Create Workmux Configuration

Create `.workmux.yaml` in your project root:

```yaml
main_branch: "main"
worktree_dir: "../"
window_prefix: "myapp-"
merge_strategy: "rebase"

post_create:
  - "cp .env.example .env"
  - "npm install"

pre_merge:
  - "npm test"

files:
  copy:
    - ".env"
  symlink:
    - "node_modules"

panes:
  - command: "echo 'Ready to develop!' && $SHELL"
    focus: true
```

### Step 6: Test Development Build

```bash
# Start in development mode
npm run tauri:dev
```

The launcher should:
1. Open with your custom branding
2. Check for your defined prerequisites
3. Detect existing worktrees (if any)

### Step 7: Customize Frontend (Optional)

The React frontend is in `src/`. Key files to customize:

- `src/App.tsx` - Main application layout
- `src/components/` - UI components
- `tailwind.config.js` - Styling/theming

**Example - Change App Title**:

```tsx
// src/App.tsx
function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header>
        <h1>MyApp Development Launcher</h1>
      </header>
      {/* ... rest of app */}
    </div>
  )
}
```

## Optional Features

### Kanban Board Integration

The launcher includes optional Kanban board integration. To enable for your project:

1. **Backend API Required**: Your project needs a REST API with these endpoints:
   - `GET /api/kanban/tickets` - List tickets
   - `POST /api/kanban/tickets` - Create ticket
   - `PATCH /api/kanban/tickets/:id` - Update ticket
   - `GET /api/kanban/epics` - List epics
   - `POST /api/kanban/epics` - Create epic

2. **Build Kanban CLI Tool** (for automatic status updates):
   ```bash
   cd src-tauri
   cargo build --release --bin kanban-cli
   cp target/release/kanban-cli ~/.local/bin/
   ```

3. **Configure Workmux Hooks** in `.workmux.yaml`:
   ```yaml
   post_create:
     - "kanban-cli move-to-progress \"$WM_BRANCH_NAME\" 2>/dev/null || true"

   pre_merge:
     - "kanban-cli move-to-review \"$WM_BRANCH_NAME\" 2>/dev/null || true"
   ```

If you don't need Kanban integration, you can:
- Remove the Kanban tab from `src/App.tsx`
- Remove `src/components/KanbanBoard.tsx`
- Remove `src-tauri/src/commands/kanban.rs`

### Custom Prerequisites Installer

The launcher includes a generic installer system. To add custom installation logic:

1. Edit `src-tauri/src/commands/generic_installer.rs`
2. Add installation methods in `prerequisites.yaml`:

```yaml
installation_methods:
  your_tool:
    macos:
      method: homebrew
      package: your-tool
    windows:
      method: winget
      package: YourOrg.YourTool
    linux:
      method: script
      url: https://yourproject.com/install.sh
```

### Multi-Project Support

The launcher supports managing multiple projects. To enable:

1. Keep the project switcher UI in `src/components/InstallTab.tsx`
2. Users can switch between different project roots
3. Each project maintains independent worktrees and settings

To disable multi-project and lock to a single project:
- Modify `src/hooks/useTauri.ts` to use a fixed project path
- Remove project picker from UI

## Building and Distribution

### Build for Current Platform

```bash
npm run tauri:build
```

Installers are created in `src-tauri/target/release/bundle/`:
- macOS: `.dmg` and `.app`
- Windows: `.exe` and `.msi`
- Linux: `.deb` and `.AppImage`

### Platform-Specific Builds

```bash
# macOS Universal (Intel + Apple Silicon)
npm run tauri:build:macos

# Windows
npm run tauri:build:windows

# Linux
npm run tauri:build:linux
```

### Cross-Platform Build Requirements

**macOS**:
- Xcode Command Line Tools: `xcode-select --install`

**Windows**:
- Visual Studio Build Tools
- WebView2 Runtime

**Linux** (Debian/Ubuntu):
```bash
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

### Code Signing (Optional)

For production distribution, configure code signing:

**macOS**:
```json
// tauri.conf.json
{
  "tauri": {
    "bundle": {
      "macOS": {
        "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)"
      }
    }
  }
}
```

**Windows**:
- Use `signtool.exe` with a code signing certificate

### CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - name: Install dependencies
        run: npm install
        working-directory: launcher

      - name: Build
        run: npm run tauri:build
        working-directory: launcher

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.platform }}-installer
          path: launcher/src-tauri/target/release/bundle/
```

## Troubleshooting

### Common Issues

**"Failed to bundle resources"**
- Check that paths in `bundle-resources.sh` are correct
- Ensure source files exist before building
- Check file permissions

**"Prerequisites not detected"**
- Verify `check_command` in `prerequisites.yaml` works manually
- Add `fallback_paths` for common installation locations
- Check platform filtering (`platforms: [...]`)

**"App won't start containers"**
- Ensure Docker is installed and running
- Check that bundled compose files are valid
- Verify container names in discovery logic

**"Worktrees not detected"**
- Ensure `.workmux.yaml` exists in project root
- Check that `worktree_dir` path is correct
- Verify git worktrees exist: `git worktree list`

**"Build fails on Linux"**
- Install all webkit/gtk dependencies
- Try: `sudo apt install libwebkit2gtk-4.0-dev build-essential`

**"Windows build fails"**
- Install WebView2 runtime
- Install Visual Studio Build Tools
- Restart terminal after installing dependencies

### Debug Mode

Run in debug mode to see detailed logs:

```bash
# Development
npm run tauri:dev

# Build in debug mode
npm run tauri:build:debug
```

Logs appear in:
- **macOS**: `~/Library/Logs/YourApp/`
- **Windows**: `%APPDATA%\YourApp\logs\`
- **Linux**: `~/.local/share/YourApp/logs/`

### Testing Without Building

You can test most functionality in development mode:

```bash
npm run tauri:dev
```

This provides hot-reload for frontend changes and fast iteration.

## Advanced Customization

### Custom Tauri Commands

Add custom Rust commands in `src-tauri/src/commands/`:

```rust
// src-tauri/src/commands/custom.rs
#[tauri::command]
pub async fn my_custom_command(param: String) -> Result<String, String> {
    // Your logic here
    Ok(format!("Processed: {}", param))
}
```

Register in `src-tauri/src/main.rs`:

```rust
mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::custom::my_custom_command,
            // ... other commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Call from frontend:

```typescript
import { invoke } from '@tauri-apps/api/tauri'

const result = await invoke('my_custom_command', { param: 'hello' })
```

### Custom UI Components

Create reusable components in `src/components/`:

```tsx
// src/components/MyFeature.tsx
export function MyFeature() {
  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h2>My Custom Feature</h2>
      {/* Your UI */}
    </div>
  )
}
```

### Environment-Specific Settings

Store settings per environment using Tauri's built-in storage:

```typescript
import { Store } from 'tauri-plugin-store-api'

const store = new Store('.settings.json')

// Save setting
await store.set('myKey', 'myValue')

// Load setting
const value = await store.get('myKey')
```

## Next Steps

1. **Test thoroughly** - Try the full workflow:
   - Create worktree
   - Start containers
   - Open terminal/VS Code
   - Merge and cleanup

2. **Gather feedback** - Share with your team and iterate

3. **Document project-specific workflows** - Add a README for your team

4. **Setup CI/CD** - Automate builds for releases

5. **Consider distribution** - How will users install the launcher?
   - Direct download from GitHub releases
   - Internal distribution server
   - Mac App Store / Microsoft Store (requires additional setup)

## Resources

- **Tauri Documentation**: https://tauri.app/
- **Workmux**: https://github.com/crates/workmux (if using worktree features)
- **Tmux**: https://github.com/tmux/tmux/wiki

## Getting Help

If you encounter issues not covered here:

1. Check the launcher's log output (development mode)
2. Review the Tauri documentation
3. Check platform-specific requirements
4. File an issue with the original project

---

**Happy Launching!** 🚀
