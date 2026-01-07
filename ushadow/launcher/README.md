# Ushadow Desktop Launcher

A Tauri-based desktop application that manages Ushadow's Docker containers and provides a native app experience.

## Features

- **Prerequisite Checking**: Verifies Docker and Tailscale are installed
- **Container Management**: Start/stop Docker containers with one click
- **System Tray**: Runs in background with quick access menu
- **Cross-Platform**: Builds for macOS (DMG), Windows (EXE), and Linux (DEB/AppImage)

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
