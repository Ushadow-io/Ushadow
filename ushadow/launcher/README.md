# Ushadow Desktop Launcher

A Tauri-based desktop application for orchestrating parallel development environments with git worktrees, tmux sessions, and Docker containers.

## Features

### Core Functionality
- **Git Worktree Management**: Create, manage, and delete git worktrees for parallel development
- **Tmux Integration**: Persistent terminal sessions with automatic window management
- **Container Orchestration**: Start/stop Docker containers per environment
- **Environment Discovery**: Auto-detect and manage multiple environments
- **Fast Status Checks**: Cached Tailscale/Docker polling for instant feedback

### Developer Experience
- **One-Click Terminal Access**: Open Terminal.app directly into environment's tmux session
- **VS Code Integration**: Launch VS Code with environment-specific colors
- **Real-time Status Badges**: Visual indicators for tmux activity (Working/Waiting/Done/Error)
- **Quick Environment Switching**: Manage multiple parallel tasks/features simultaneously
- **Merge & Cleanup**: Rebase and merge worktrees back to main with one click

### Infrastructure
- **Prerequisite Checking**: Verifies Docker, Tailscale, Git, and Tmux
- **System Tray**: Runs in background with quick access menu
- **Cross-Platform**: Builds for macOS (DMG), Windows (EXE), and Linux (DEB/AppImage)

## Quick Start

```bash
# Install dependencies
npm install

# Start development mode
npm run tauri:dev

# The launcher will:
# 1. Auto-detect existing environments/worktrees
# 2. Start tmux server if worktrees exist
# 3. Show all environments with real-time status
```

### First-Time Usage

1. **Set Project Root**: Click the folder icon to point to your Ushadow repo
2. **Check Prerequisites**: Verify Docker, Tailscale, Git, Tmux are installed
3. **Start Infrastructure**: Start required containers (postgres, redis, etc.)
4. **Create Environment**: Click "New Environment" and choose:
   - **Clone** - Create new git clone (traditional)
   - **Worktree** - Create git worktree (recommended for parallel dev)

### Using Tmux Sessions

- **Purple Terminal Icon** on environment cards - Click to open Terminal and attach to tmux
- **Global "Tmux" Button** in header - View all sessions/windows
- **Status Badges** next to branch names - See what's running in each tmux window

**Note**: Terminal opening currently works on **macOS only** (via Terminal.app). Linux/Windows support is planned. See [CROSS_PLATFORM_TERMINAL.md](./CROSS_PLATFORM_TERMINAL.md) for details.

## Documentation

- **[TMUX_INTEGRATION.md](./TMUX_INTEGRATION.md)** - Complete guide to tmux integration features (Phase 1)
- **[ROADMAP.md](./ROADMAP.md)** - Full vision including Vibe Kanban and remote management (Phases 2-4)
- **[CROSS_PLATFORM_TERMINAL.md](./CROSS_PLATFORM_TERMINAL.md)** - Cross-platform terminal opening strategy
- **[TESTING.md](./TESTING.md)** - Testing guidelines
- **[RELEASING.md](./RELEASING.md)** - Release process
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history

## Prerequisites

### Development

1. **Rust toolchain**:
   ```bash
   # macOS/Linux
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

   # Windows: Download from https://rustup.rs
   ```

2. **Platform-specific dependencies**:

   **macOS**:
   ```bash
   xcode-select --install
   ```

   **Linux (Debian/Ubuntu)**:
   ```bash
   sudo apt update
   sudo apt install libwebkit2gtk-4.0-dev \
       build-essential \
       curl \
       wget \
       libssl-dev \
       libgtk-3-dev \
       libayatana-appindicator3-dev \
       librsvg2-dev
   ```

   **Windows**:
   - Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

3. **Node.js** (for Tauri CLI):
   ```bash
   npm install
   ```

## Development

```bash
# Start in development mode
npm run dev

# This will:
# 1. Compile the Rust backend
# 2. Open the launcher window
# 3. Hot-reload on changes
```

## Building

### All Platforms (from current OS)

```bash
npm run build
```

### Platform-Specific

```bash
# macOS Universal (Intel + Apple Silicon)
npm run build:macos

# Windows
npm run build:windows

# Linux
npm run build:linux
```

### Build Outputs

After building, installers are located in:

```
src-tauri/target/release/bundle/
├── dmg/              # macOS DMG
├── macos/            # macOS .app bundle
├── msi/              # Windows MSI installer
├── nsis/             # Windows NSIS installer
├── deb/              # Debian/Ubuntu package
└── appimage/         # Linux AppImage
```

## App Icons

To generate app icons from a source image:

1. Place a 1024x1024 PNG at `src-tauri/icons/app-icon.png`
2. Run:
   ```bash
   npm run icons
   ```

This generates all required icon sizes for each platform.

## Architecture

```
launcher/
├── dist/                    # Bootstrap UI (shown before containers start)
│   └── index.html
├── src-tauri/
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # Tauri configuration
│   ├── icons/              # App icons
│   └── src/
│       └── main.rs         # Rust backend (Docker management)
└── package.json            # Node scripts for Tauri CLI
```

## How It Works

1. **On Launch**: Shows bootstrap UI with prerequisite checks
2. **Start Services**: Runs `docker compose up` for infrastructure and app
3. **Health Check**: Polls backend until healthy
4. **Open App**: Navigates webview to `http://localhost:3000`
5. **System Tray**: Minimizes to tray, stays running in background
6. **On Quit**: Optionally stops containers (configurable)

## Configuration

Edit `src-tauri/tauri.conf.json` to customize:

- `bundle.identifier`: App bundle ID
- `windows[0].width/height`: Default window size
- `bundle.macOS.minimumSystemVersion`: Minimum macOS version
- `bundle.deb.depends`: Linux package dependencies

## Security

The app uses Tauri's security features:

- **CSP**: Restricts content sources to localhost
- **Shell Scope**: Only allows specific Docker/Tailscale commands
- **No Node.js**: Runs native Rust, not Node (unlike Electron)

## Troubleshooting

### "Docker not found"
Ensure Docker Desktop is installed and the `docker` CLI is in your PATH.

### "Tailscale not found"
Install Tailscale from https://tailscale.com/download

### Build fails on Linux
Install all webkit/gtk dependencies listed in Prerequisites.

### Windows build fails
Ensure WebView2 runtime is installed and Visual Studio Build Tools are set up.
