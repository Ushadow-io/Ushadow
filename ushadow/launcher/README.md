# Ushadow Desktop Launcher

A Tauri-based desktop application for orchestrating parallel development environments with git worktrees, tmux sessions, and Docker containers. Includes integrated Kanban board for ticket management, making it a complete development workflow tool that bridges task tracking and environment management.

## What Can It Do?

- 🚀 **One-Click Launch** - Install prerequisites and start Ushadow automatically
- 🌲 **Git Worktrees** - Work on multiple branches simultaneously in isolated environments
- 💻 **Tmux Integration** - Persistent terminal sessions that survive app restarts
- 🐳 **Docker Orchestration** - Start/stop containers per environment with visual status
- 📋 **Kanban Board** - Integrated ticket management with epics and environment linking
- ⚙️ **Smart Setup** - Auto-configure credentials for new worktrees
- 🔄 **One-Click Merge** - Rebase and merge worktrees back to main with cleanup
- 📊 **Multi-Project** - Manage multiple repositories with independent configurations

## Features

### Core Functionality
- **Git Worktree Management**: Create, manage, and delete git worktrees for parallel development
- **Tmux Integration**: Persistent terminal sessions with automatic window management
- **Container Orchestration**: Start/stop Docker containers per environment
- **Environment Discovery**: Auto-detect and manage multiple environments
- **Fast Status Checks**: Cached Tailscale/Docker polling for instant feedback
- **Kanban Board**: Integrated ticket management system for tracking work and epics

### Developer Experience
- **One-Click Terminal Access**: Open Terminal.app directly into environment's tmux session
- **VS Code Integration**: Launch VS Code with environment-specific colors
- **Real-time Status Badges**: Visual indicators for tmux activity (Working/Waiting/Done/Error)
- **Quick Environment Switching**: Manage multiple parallel tasks/features simultaneously
- **Merge & Cleanup**: Rebase and merge worktrees back to main with one click
- **Ticket Management**: Create, track, and organize tickets with epics, descriptions, and environments

### Infrastructure
- **Prerequisite Checking**: Verifies Docker, Tailscale, Git, and Tmux
- **System Tray**: Runs in background with quick access menu
- **Cross-Platform**: Builds for macOS (DMG), Windows (EXE), and Linux (DEB/AppImage)
- **Default Credentials**: Configure default admin credentials for new worktrees

## Quick Start

### For Developers (Running from Source)

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

### For Users (Installing the App)

1. Download the appropriate installer for your platform:
   - **macOS**: `Ushadow-{version}.dmg`
   - **Windows**: `Ushadow-{version}.exe` or `.msi`
   - **Linux**: `ushadow_{version}_amd64.deb` or `.AppImage`

2. Run the installer and launch the Ushadow Launcher

3. Follow the first-time setup wizard

### First-Time Usage

1. **Set Project Root**: Click the folder icon to point to your Ushadow repo
2. **Check Prerequisites**: Verify Docker, Tailscale, Git, Tmux are installed
3. **Start Infrastructure**: Start required containers (postgres, redis, etc.)
4. **Create Environment**: Click "New Environment" and choose:
   - **Link** - Link to an existing directory
   - **Worktree** - Create git worktree (recommended for parallel dev)

### Multi-Project Mode

The launcher supports managing multiple projects with independent configurations:

- Switch between projects from the Install tab
- Each project maintains its own worktrees directory
- Independent infrastructure and environment settings per project
- Useful for working on multiple repositories or client projects

### Using Tmux Sessions

- **Purple Terminal Icon** on environment cards - Click to open Terminal and attach to tmux
- **Global "Tmux" Button** in header - View all sessions/windows
- **Status Badges** next to branch names - See what's running in each tmux window

**Note**: Terminal opening currently works on **macOS only** (via Terminal.app). Linux/Windows support is planned. See [CROSS_PLATFORM_TERMINAL.md](./CROSS_PLATFORM_TERMINAL.md) for details.

### Configuring Default Credentials

The **Credentials** button in the header allows you to configure default admin credentials that will be automatically written to new worktrees:

1. Click **Credentials** button in the header
2. Enter default admin email, password, and name
3. Save settings
4. All newly created worktrees will automatically have these credentials configured in `secrets.yaml`

This eliminates the need to manually configure credentials for each new environment, streamlining the development workflow.

### Managing Work with Kanban Board

The launcher includes an integrated Kanban board for ticket and epic management:

- **Kanban Tab** in the header - View all tickets organized by status (Backlog, To Do, In Progress, Done)
- **Create Tickets** - Add new tickets with title, description, and link them to epics
- **Create Epics** - Organize related tickets into epics for better project structure
- **Environment Linking** - Associate tickets with specific development environments
- **Drag & Drop** - Move tickets between columns to update their status
- **Ticket Details** - View full ticket information including descriptions and metadata

The Kanban board integrates with your backend API, allowing you to track work directly from the launcher while managing development environments.

### Automatic Ticket Status Updates

The launcher automatically updates ticket status as you work, using a three-layer system:

**1. Launcher Integration**: When starting an agent → status: `in_progress`
**2. Claude Code Hooks**: Session lifecycle events → status: `in_progress` / `in_review`
**3. Workmux Integration**: When merging → status: `done`

**Quick Setup:**

```bash
# Install kanban-cli (required)
cd src-tauri
cargo build --release --bin kanban-cli
cp target/release/kanban-cli ~/.local/bin/
```

**That's it!** Claude Code hooks are pre-configured in `.claude/` and workmux hooks are already set up.

**How it works:**
- ✅ Start agent for ticket → Automatically moves to `in_progress`
- ✅ Agent finishes/waits → Automatically moves to `in_review`
- ✅ You respond → Automatically moves back to `in_progress`
- ✅ Merge branch → Automatically moves to `done`

See **[KANBAN_AUTO_STATUS.md](./KANBAN_AUTO_STATUS.md)** for complete documentation:
- Architecture overview and how each layer works
- Comparison with vibe-kanban's approach
- Testing and troubleshooting
- Future enhancements

For manual CLI usage and advanced integration, see **[KANBAN_HOOKS.md](./KANBAN_HOOKS.md)**.

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
├── src/                     # React frontend
│   ├── components/          # UI components
│   │   ├── KanbanBoard.tsx
│   │   ├── EnvironmentsPanel.tsx
│   │   ├── TmuxManagerDialog.tsx
│   │   └── ...
│   ├── hooks/              # React hooks (useTauri, useTmuxMonitoring)
│   ├── store/              # Zustand state management
│   └── App.tsx             # Main application
├── src-tauri/
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # Tauri configuration
│   ├── icons/              # App icons
│   └── src/
│       ├── main.rs         # Rust backend entry point
│       ├── commands/       # Tauri command implementations
│       │   ├── kanban.rs   # Kanban board operations
│       │   ├── settings.rs # Settings management
│       │   └── ...
│       └── models.rs       # Data structures
└── package.json            # Node scripts for Tauri CLI
```

## How It Works

### Application Lifecycle

1. **On Launch**: Shows Install page with one-click quick launch
2. **Prerequisite Check**: Verifies Docker, Git, Python, Tmux are installed
3. **Infrastructure Setup**: Starts shared services (Postgres, Redis, etc.)
4. **Environment Discovery**: Auto-detects existing worktrees and containers
5. **Tmux Integration**: Auto-starts tmux server and monitors sessions
6. **System Tray**: Minimizes to tray, stays running in background
7. **On Quit**: Optionally stops containers (configurable)

### Development Workflow

1. **Navigate to Kanban tab** - View and manage tickets
2. **Create a ticket** - Define the work to be done
3. **Navigate to Environments tab** - View all development environments
4. **Create worktree** - Click "New Environment" → Choose branch name
5. **Auto-setup** - Launcher creates worktree, tmux window, and starts containers
6. **Open terminal** - Click purple terminal icon to attach tmux session
7. **Develop** - Code in VS Code, run commands in tmux
8. **Track progress** - Update ticket status in Kanban board
9. **Merge & Cleanup** - When done, merge worktree back to main with one click

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
- **Credential Storage**: Settings stored locally, never transmitted
- **Tauri Permissions**: Minimal permission model (no file system access beyond project paths)

## Tips & Tricks

### Productivity Tips

**Use Worktrees for Parallel Development**
- Create a worktree for each feature/bug you're working on
- Switch between worktrees instantly without git stash
- Each worktree has its own containers and ports

**Organize with Epics**
- Group related tickets into epics in the Kanban board
- Track progress across multiple related features
- Link tickets to environments for better context

**Leverage Tmux Sessions**
- Keep long-running commands in tmux (tests, servers, logs)
- Sessions persist even if you close the launcher
- Use tmux windows to organize different tasks

**Set Default Credentials**
- Configure default admin credentials once
- All new worktrees automatically get these credentials
- No more manual secrets.yaml editing

### Keyboard Shortcuts

- **Cmd/Ctrl + R**: Refresh all status
- **Native clipboard shortcuts work**: Cmd/Ctrl+C, V, X, Z, etc.

### Best Practices

1. **Name worktrees clearly**: Use descriptive names like `fix-login-bug` or `add-auth-feature`
2. **Clean up regularly**: Merge and delete completed worktrees to save disk space
3. **Use the Log Panel**: Expand it when troubleshooting to see detailed output
4. **Keep main up-to-date**: Regularly pull latest changes to avoid merge conflicts
5. **Link tickets to environments**: Use the Kanban board to track which ticket is in which environment

## Troubleshooting

### Environment Issues

**"Docker not found"**
- Ensure Docker Desktop is installed and the `docker` CLI is in your PATH
- On macOS: `which docker` should show `/usr/local/bin/docker`
- Try restarting the launcher after installing Docker

**"Tailscale not found"**
- Install Tailscale from https://tailscale.com/download
- Tailscale is optional but recommended for remote access

**Environment won't start**
- Check that Docker is running (`docker ps` should work)
- Verify ports aren't already in use (default: 8000, 3000)
- Check logs in the Log Panel at the bottom of the launcher
- Try stopping and restarting the environment

**Tmux window not created**
- Ensure tmux is installed: `tmux -V`
- Check if tmux server is running: `tmux list-sessions`
- Restart the launcher to auto-start tmux server

### Kanban Board Issues

**Tickets not loading**
- Ensure at least one environment is running (backend API needed)
- Check backend URL in Kanban tab matches running environment
- Verify backend is healthy at `http://localhost:8000/health`

**Can't create tickets**
- Verify you have a running backend environment
- Check browser console for API errors
- Ensure credentials are configured (Settings button)

### Build Issues

**Build fails on Linux**
- Install all webkit/gtk dependencies listed in Prerequisites section
- Run: `sudo apt install libwebkit2gtk-4.0-dev build-essential`

**Windows build fails**
- Ensure WebView2 runtime is installed
- Install Visual Studio Build Tools
- Restart terminal after installing dependencies

### General Tips

- **Check the Log Panel** - Most errors appear in the bottom log panel
- **Refresh Status** - Click the refresh button to update environment status
- **Restart the Launcher** - Many issues resolve after a fresh start
- **Check Disk Space** - Worktrees and containers can use significant space
- **Review Configuration** - Verify project root and worktrees directory paths
