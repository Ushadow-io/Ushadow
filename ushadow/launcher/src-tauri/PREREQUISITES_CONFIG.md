# Prerequisites Configuration

The `prerequisites.yaml` file allows you to easily configure what software prerequisites are checked and required by the launcher.

## Location

- **Development**: `/Users/stu/repos/worktrees/ushadow/gold/ushadow/launcher/src-tauri/prerequisites.yaml`
- **Production**: Bundled with the app in the resources directory

## Structure

```yaml
prerequisites:
  - id: prerequisite_id          # Unique identifier
    name: Software Name          # Display name
    display_name: Display Name   # UI display name
    description: Description     # User-friendly description
    platforms: [macos, windows, linux]  # Supported platforms
    check_command: command --version     # Command to check installation
    optional: false              # Whether the prerequisite is required
    category: development        # Category for grouping
```

## Prerequisite Fields

### Required Fields
- `id`: Unique identifier (e.g., "docker", "git")
- `name`: Software name
- `display_name`: Name shown in UI
- `description`: User-friendly description
- `platforms`: Array of supported platforms (`macos`, `windows`, `linux`)
- `optional`: Boolean indicating if prerequisite is required
- `category`: Group category (e.g., "development", "infrastructure", "networking")

### Optional Fields
- `check_command`: Shell command to verify installation
- `check_commands`: Array of commands to try in order
- `check_running_command`: Command to check if service is running (for services like Docker)
- `check_connected_command`: Command to check connection status (for services like Tailscale)
- `fallback_paths`: Array of absolute paths to check if command fails
- `version_filter`: String to filter version output (e.g., "Python 3")
- `has_service`: Boolean indicating if this is a service that can be started/stopped
- `connection_validation`: Object with validation rules (e.g., `starts_with: "100."`)

## Platform-Specific Paths

For tools that might be installed in different locations per platform, use `fallback_paths`:

```yaml
fallback_paths:
  macos:
    - /opt/homebrew/bin/docker
    - /usr/local/bin/docker
  windows:
    - C:\Program Files\Docker\Docker\resources\bin\docker.exe
  linux:
    - /usr/bin/docker
    - /usr/local/bin/docker
```

## Installation Methods

You can also configure installation methods for each prerequisite:

```yaml
installation_methods:
  docker:
    macos:
      method: homebrew
      package: docker
    windows:
      method: download
      url: https://www.docker.com/products/docker-desktop
    linux:
      method: script
      url: https://get.docker.com
```

### Supported Installation Methods
- `homebrew`: Install via Homebrew (macOS)
- `download`: Download installer from URL
- `script`: Run installation script from URL
- `package_manager`: Install via system package manager
- `cargo`: Install via Rust's cargo

## Categories

Organize prerequisites into logical groups:
- `package_manager`: Package managers (Homebrew)
- `development`: Development tools (Git, Python, Node.js)
- `infrastructure`: Infrastructure services (Docker)
- `networking`: Network tools (Tailscale)

## Examples

### Adding a New Prerequisite

To add Node.js as a prerequisite:

```yaml
prerequisites:
  - id: node
    name: Node.js
    display_name: Node.js
    description: JavaScript runtime
    platforms: [macos, windows, linux]
    check_command: node --version
    optional: false
    category: development
```

### Making a Prerequisite Optional

```yaml
  - id: vscode
    name: VS Code
    display_name: Visual Studio Code
    description: Code editor
    platforms: [macos, windows, linux]
    check_command: code --version
    optional: true  # Not required for core functionality
    category: development
```

### Adding Multiple Check Commands

```yaml
  - id: python
    name: Python 3
    display_name: Python 3
    description: Python programming language
    platforms: [macos, windows, linux]
    check_commands:
      - python3 --version  # Try this first
      - python --version   # Fallback
    version_filter: "Python 3"  # Only accept Python 3.x
    optional: false
    category: development
```

## API Usage

### From TypeScript/Frontend

```typescript
import { invoke } from '@tauri-apps/api'

// Get all prerequisites configuration
const config = await invoke('get_prerequisites_config')

// Get prerequisites for current platform
const prereqs = await invoke('get_platform_prerequisites_config', {
  platform: 'macos'
})
```

### From Rust/Backend

```rust
use crate::commands::prerequisites_config::PrerequisitesConfig;

// Load configuration
let config = PrerequisitesConfig::load()?;

// Get prerequisites for a platform
let macos_prereqs = config.get_platform_prerequisites("macos");
```

## Testing

To test your configuration changes:

1. Edit `prerequisites.yaml`
2. Rebuild the launcher: `cargo build`
3. Run the launcher: `cargo tauri dev`
4. Check the Prerequisites panel to verify your changes

## Notes

- The YAML file is parsed at runtime, so you can modify it without recompiling
- Prerequisites are checked in the order they appear in the file
- Use `optional: true` for nice-to-have tools
- Platform values are case-sensitive: use `macos`, `windows`, `linux`
