---
title: Generic Installer
sidebar_position: 9
---


The generic installer system makes it easy to add new prerequisites without writing custom installation code. All prerequisite installations are now driven by the `prerequisites.yaml` configuration file.

## Quick Start

### Adding a New Prerequisite

1. Add the prerequisite to `prerequisites.yaml`:

```yaml
prerequisites:
  - id: nodejs
    name: Node.js
    display_name: Node.js
    description: JavaScript runtime
    platforms: [macos, windows, linux]
    check_command: node --version
    optional: false
    category: development
```

2. Add installation methods for each platform:

```yaml
installation_methods:
  nodejs:
    macos:
      method: homebrew
      package: node
    windows:
      method: winget
      package: OpenJS.NodeJS
    linux:
      method: package_manager
      packages:
        apt: nodejs
        yum: nodejs
        dnf: nodejs
```

3. Use the generic installer from frontend:

```typescript
import { invoke } from '@tauri-apps/api'

// Install Node.js
await invoke('install_prerequisite', { prerequisiteId: 'nodejs' })

// Start a service (for services like Docker)
await invoke('start_prerequisite', { prerequisiteId: 'docker' })
```

That's it! No Rust code changes needed.

## Installation Methods

The generic installer supports 6 installation strategies:

### 1. Homebrew (macOS)

Installs packages via Homebrew. Automatically detects if package is a cask or formula.

```yaml
method: homebrew
package: docker          # Package name
```

**Examples:**
- `docker` → Installs as cask with admin privileges
- `git` → Installs as formula
- `python@3.12` → Installs specific version

### 2. Winget (Windows)

Installs via Windows Package Manager.

```yaml
method: winget
package: Docker.DockerDesktop  # Package ID
```

**Examples:**
- `Docker.DockerDesktop`
- `Git.Git`
- `OpenJS.NodeJS`

### 3. Download

Downloads installer and opens it for manual installation.

```yaml
method: download
url: https://example.com/installer.exe
```

**Special Cases:**
- Homebrew `.pkg` files are downloaded and opened automatically
- Other files open the URL in the default browser

### 4. Script

Downloads and executes an installation script.

```yaml
method: script
url: https://get.docker.com
```

**Process:**
1. Downloads script from URL
2. Saves to temp directory
3. Makes executable (Unix only)
4. Executes with bash

**Security Note:** Only use scripts from trusted sources.

### 5. Package Manager (Linux)

Installs via system package manager (apt, yum, or dnf).

```yaml
method: package_manager
packages:
  apt: docker.io
  yum: docker
  dnf: docker
```

The installer automatically detects which package manager is available and uses the appropriate package name.

### 6. Cargo (Rust)

Installs Rust packages via cargo.

```yaml
method: cargo
package: workmux
```

## API Reference

### `install_prerequisite(prerequisite_id: String) -> Result<String, String>`

Generic installer that reads configuration and executes the appropriate installation method.

```typescript
// TypeScript
const result = await invoke('install_prerequisite', {
  prerequisiteId: 'docker'
})
console.log(result) // "docker installed successfully via Homebrew"
```

```rust
// Rust
let result = install_prerequisite("docker".to_string()).await?;
```

**Process:**
1. Loads `prerequisites.yaml`
2. Finds installation method for current platform
3. Executes appropriate installation strategy
4. Returns success message or error

### `start_prerequisite(prerequisite_id: String) -> Result<String, String>`

Starts a service prerequisite (only for prerequisites with `has_service: true`).

```typescript
// TypeScript
const result = await invoke('start_prerequisite', {
  prerequisiteId: 'docker'
})
console.log(result) // "Docker Desktop starting..."
```

**Supported Services:**
- `docker` - macOS/Windows/Linux

## Complete Example

Here's a complete example of adding PostgreSQL as a prerequisite:

### 1. Add to prerequisites.yaml

```yaml
prerequisites:
  - id: postgresql
    name: PostgreSQL
    display_name: PostgreSQL
    description: Relational database
    platforms: [macos, windows, linux]
    check_command: psql --version
    optional: true
    has_service: true
    category: infrastructure

installation_methods:
  postgresql:
    macos:
      method: homebrew
      package: postgresql@15
    windows:
      method: download
      url: https://www.postgresql.org/download/windows/
    linux:
      method: package_manager
      packages:
        apt: postgresql
        yum: postgresql
        dnf: postgresql
```

### 2. Use in Frontend

```typescript
import { invoke } from '@tauri-apps/api'

// Install PostgreSQL
try {
  const result = await invoke('install_prerequisite', {
    prerequisiteId: 'postgresql'
  })
  console.log(result)
} catch (error) {
  console.error('Installation failed:', error)
}

// Start PostgreSQL (if it's a service)
try {
  const result = await invoke('start_prerequisite', {
    prerequisiteId: 'postgresql'
  })
  console.log(result)
} catch (error) {
  console.error('Start failed:', error)
}
```

## Migration from Old System

### Before (Custom Installer)

```rust
// src/commands/installer.rs
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn install_nodejs_macos() -> Result<String, String> {
    if !check_brew_installed() {
        return Err("Homebrew is not installed".to_string());
    }
    let output = brew_command()
        .args(["install", "node"])
        .output()
        .map_err(|e| format!("Failed to run brew: {}", e))?;
    if output.status.success() {
        Ok("Node.js installed successfully via Homebrew".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Brew install failed: {}", stderr))
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn install_nodejs_windows() -> Result<String, String> {
    // Windows implementation...
}

// main.rs - Add to invoke_handler
install_nodejs_macos,
install_nodejs_windows,
```

### After (Generic Installer)

```yaml
# prerequisites.yaml
installation_methods:
  nodejs:
    macos:
      method: homebrew
      package: node
    windows:
      method: winget
      package: OpenJS.NodeJS
```

```typescript
// Frontend
await invoke('install_prerequisite', { prerequisiteId: 'nodejs' })
```

**Benefits:**
- ✅ No Rust code changes
- ✅ No main.rs updates
- ✅ Easy to maintain
- ✅ Consistent across platforms
- ✅ YAML validation

## Advanced Usage

### Custom Installation Logic

For prerequisites requiring custom installation logic, you can still add custom methods in `generic_installer.rs`:

```rust
async fn execute_installation(
    prereq_id: &str,
    method: &InstallationMethod,
    platform: &str,
) -> Result<String, String> {
    match method.method.as_str() {
        "homebrew" => install_via_homebrew(prereq_id, method).await,
        "custom_nodejs" => install_nodejs_custom(prereq_id, method).await,  // Custom
        _ => Err(format!("Unknown installation method: {}", method.method))
    }
}
```

Then in YAML:

```yaml
nodejs:
  macos:
    method: custom_nodejs
```

### Platform Detection

The installer automatically detects the platform:
- macOS → `"macos"`
- Windows → `"windows"`
- Linux → `"linux"`

You can have different installation methods per platform in the YAML.

### Error Handling

All installation methods return `Result<String, String>`:
- `Ok(message)` - Installation succeeded with a success message
- `Err(message)` - Installation failed with an error message

## Testing

### Test Prerequisites Installation

```bash
# Run the launcher in dev mode
cargo tauri dev

# In the app, try installing a prerequisite
# Check the console for debug output
```

### Debug Mode

Enable debug output to see what's happening:

```rust
eprintln!("Installing {} via Homebrew: {}", prereq_id, package);
```

## Best Practices

1. **Use Generic Installer** - Prefer adding to YAML over writing custom code
2. **Test on Each Platform** - Verify installation works on macOS/Windows/Linux
3. **Handle Errors Gracefully** - Provide helpful error messages
4. **Document Prerequisites** - Add clear descriptions in YAML
5. **Keep YAML Simple** - Avoid complex logic in configuration
6. **Version Pin When Needed** - Use specific versions (e.g., `python@3.12`)

## Troubleshooting

### Installation Fails Silently

Check if the method is registered in `execute_installation()`:

```rust
match method.method.as_str() {
    "your_method" => { /* handler */ }
    _ => Err(format!("Unknown installation method: {}", method.method))
}
```

### Package Not Found

- **Homebrew**: Check package name with `brew search <name>`
- **Winget**: Check package ID with `winget search <name>`
- **Linux**: Verify package name with `apt search <name>` etc.

### Permission Denied

Some installations require admin privileges:
- macOS: osascript with administrator privileges
- Windows: UAC prompt
- Linux: sudo

The generic installer handles this automatically for supported methods.

## Future Enhancements

Potential improvements to the generic installer:

1. **Post-install hooks** - Run commands after installation
2. **Dependency checking** - Ensure prerequisites are installed in order
3. **Version validation** - Check installed version meets requirements
4. **Rollback support** - Uninstall on failure
5. **Progress tracking** - Report installation progress
6. **Batch installation** - Install multiple prerequisites at once

## Summary

The generic installer makes it trivial to add new prerequisites:

1. Add prerequisite definition to YAML
2. Add installation methods to YAML
3. Call `install_prerequisite(id)` from frontend

No Rust code changes needed! ✨
