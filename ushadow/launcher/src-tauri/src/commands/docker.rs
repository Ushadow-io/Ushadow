use std::net::TcpListener;
use std::sync::Mutex;
use std::collections::HashMap;
use std::path::Path;
use tauri::State;
use crate::models::{ContainerStatus, ServiceInfo};
use super::utils::{silent_command, shell_command, quote_path_buf};
use super::platform::{Platform, PlatformOps};
use super::bundled;

/// Recursively copy a directory and all its contents
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());

        if path.is_dir() {
            // Skip __pycache__ directories
            if entry.file_name() == "__pycache__" {
                continue;
            }
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            // Skip .pyc files
            if let Some(ext) = path.extension() {
                if ext == "pyc" {
                    continue;
                }
            }
            std::fs::copy(&path, &dest_path)?;
        }
    }

    Ok(())
}

/// Find uv executable, checking common install locations on Windows
/// Returns the path/command to use for running uv
fn find_uv_executable() -> String {
    #[cfg(target_os = "windows")]
    {
        let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let userprofile = std::env::var("USERPROFILE").unwrap_or_default();

        let possible_paths = vec![
            format!("{}\\.local\\bin\\uv.exe", userprofile),  // Official installer location (first priority)
            format!("{}\\Programs\\uv\\uv.exe", localappdata),
            format!("{}\\.cargo\\bin\\uv.exe", userprofile),
            "uv".to_string(), // Try PATH as fallback
        ];

        possible_paths.iter()
            .find(|p| std::path::Path::new(p).exists() || p.as_str() == "uv")
            .cloned()
            .unwrap_or_else(|| "uv".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        "uv".to_string()
    }
}

/// Check if a port is available for binding
fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Check if default ports (8000, 3000) are available
/// Returns (backend_available, webui_available, suggested_offset)
#[tauri::command]
pub fn check_ports() -> (bool, bool, u16) {
    let backend_ok = is_port_available(8000);
    let webui_ok = is_port_available(3000);

    if backend_ok && webui_ok {
        return (true, true, 0);
    }

    // Find next available offset
    let mut offset = 10u16;
    while offset <= 1000 {
        if is_port_available(8000 + offset) && is_port_available(3000 + offset) {
            return (backend_ok, webui_ok, offset);
        }
        offset += 10;
    }

    (backend_ok, webui_ok, 0)
}

/// Find available ports starting from the given defaults
/// Returns (backend_port, webui_port)
fn find_available_ports(default_backend: u16, default_webui: u16) -> (u16, u16) {
    let mut offset = 0u16;

    loop {
        let backend_port = default_backend + offset;
        let webui_port = default_webui + offset;

        // Check both ports are available
        if is_port_available(backend_port) && is_port_available(webui_port) {
            return (backend_port, webui_port);
        }

        // Try next offset (increments of 10 to match script convention)
        offset += 10;

        // Safety limit - don't search forever
        if offset > 1000 {
            // Return defaults anyway, let docker handle the error
            return (default_backend, default_webui);
        }
    }
}

/// Application state
pub struct AppState {
    pub project_root: Mutex<Option<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            project_root: Mutex::new(None),
        }
    }
}

/// Set the project root directory
#[tauri::command]
pub fn set_project_root(path: String, state: State<AppState>) -> Result<(), String> {
    use super::utils::normalize_path;

    let mut root = state.project_root.lock().map_err(|e| e.to_string())?;
    // Normalize path separators (critical on Windows where frontend sends forward slashes)
    *root = Some(normalize_path(&path));
    Ok(())
}

/// Start shared infrastructure containers
#[tauri::command]
pub async fn start_infrastructure(state: State<'_, AppState>) -> Result<String, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    let mut log_messages = Vec::new();
    log_messages.push("Creating Docker networks...".to_string());

    // Create Docker networks directly (don't require uv/Python)
    let networks = vec!["ushadow-network", "infra-network"];
    for network in networks {
        log_messages.push(format!("Checking network: {}", network));

        // Check if network exists
        let check_output = shell_command("docker")
            .args(&["network", "inspect", network])
            .output();

        let network_exists = check_output.is_ok() && check_output.unwrap().status.success();

        if network_exists {
            log_messages.push(format!("✓ Network '{}' already exists", network));
        } else {
            log_messages.push(format!("Creating network: {}", network));

            // Create network
            let create_output = shell_command("docker")
                .args(&["network", "create", network])
                .output()
                .map_err(|e| {
                    let error_log = log_messages.join("\n");
                    format!("{}\n\nFailed to create network {}: {}", error_log, network, e)
                })?;

            if !create_output.status.success() {
                let stderr = String::from_utf8_lossy(&create_output.stderr);
                // Ignore if network already exists (race condition)
                if stderr.contains("already exists") {
                    log_messages.push(format!("✓ Network '{}' already exists (race condition)", network));
                } else {
                    log_messages.push(format!("⚠ Failed to create network {}: {}", network, stderr));
                }
            } else {
                log_messages.push(format!("✓ Network '{}' created successfully", network));
            }
        }
    }

    log_messages.push("Starting infrastructure containers...".to_string());

    // Get bundled compose file if available
    let bundled_compose_file = bundled::get_compose_file(&project_root, "docker-compose.infra.yml");

    // Copy bundled compose to working directory if it's from the bundled location
    // This avoids permission issues on Windows where Program Files requires admin
    let working_compose_dir = std::path::Path::new(&project_root).join("compose");
    let working_compose_file = working_compose_dir.join("docker-compose.infra.yml");

    if bundled_compose_file != working_compose_file {
        log_messages.push(format!("Copying bundled compose file to working directory..."));

        // Create compose directory if needed
        if !working_compose_dir.exists() {
            std::fs::create_dir_all(&working_compose_dir)
                .map_err(|e| format!("Failed to create compose directory: {}", e))?;
        }

        // Copy the compose file
        std::fs::copy(&bundled_compose_file, &working_compose_file)
            .map_err(|e| format!("Failed to copy compose file: {}", e))?;
    }

    let compose_path_quoted = quote_path_buf(&working_compose_file);

    log_messages.push(format!("Running: docker compose -f {} -p infra --profile infra up -d", compose_path_quoted));

    let compose_command = format!("docker compose -f {} -p infra --profile infra up -d", compose_path_quoted);
    let infra_output = shell_command(&compose_command)
        .current_dir(&project_root)
        .output()
        .map_err(|e| {
            let error_log = log_messages.join("\n");
            format!("{}\n\nFailed to start infrastructure (docker not found or not executable): {}", error_log, e)
        })?;

    let stderr = String::from_utf8_lossy(&infra_output.stderr);
    let stdout = String::from_utf8_lossy(&infra_output.stdout);

    if !stdout.is_empty() {
        log_messages.push(format!("Docker compose stdout:\n{}", stdout));
    }
    if !stderr.is_empty() {
        log_messages.push(format!("Docker compose stderr:\n{}", stderr));
    }

    if !infra_output.status.success() {
        let error_log = log_messages.join("\n");
        return Err(format!("{}\n\nInfrastructure failed to start", error_log));
    }

    log_messages.push("✓ Infrastructure started successfully".to_string());
    Ok(log_messages.join("\n"))
}

/// Stop shared infrastructure containers
#[tauri::command]
pub async fn stop_infrastructure(state: State<'_, AppState>) -> Result<String, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    let output = shell_command("docker compose -p infra down")
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to stop infrastructure (docker not found or not executable): {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Stop failed: {}", stderr));
    }

    Ok("Infrastructure stopped".to_string())
}

/// Restart shared infrastructure containers
#[tauri::command]
pub async fn restart_infrastructure(state: State<'_, AppState>) -> Result<String, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    // Stop first
    let _ = shell_command("docker compose -p infra down")
        .current_dir(&project_root)
        .output();

    // Start again
    let output = shell_command("docker compose -f compose/docker-compose.infra.yml -p infra --profile infra up -d")
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to restart infrastructure (docker not found or not executable): {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Restart failed: {}", stderr));
    }

    Ok("Infrastructure restarted".to_string())
}

/// Start a specific environment by name
#[tauri::command]
pub async fn start_environment(state: State<'_, AppState>, env_name: String, env_path: Option<String>) -> Result<String, String> {
    eprintln!("\n[start_env] ========================================");
    eprintln!("[start_env] Starting environment: {}", env_name);
    eprintln!("[start_env] ========================================");

    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    // Use env_path if provided (for worktrees), otherwise use project_root
    let working_dir = env_path.unwrap_or_else(|| project_root.clone());

    eprintln!("[start_env] Project root: {}", project_root);
    eprintln!("[start_env] Working directory: {}", working_dir);

    // Find all stopped containers for this environment by name pattern
    let pattern = if env_name == "default" || env_name == "ushadow" {
        "ushadow-".to_string()
    } else {
        format!("ushadow-{}-", env_name)
    };

    // Get matching stopped container names
    let output = shell_command("docker ps -a --filter status=exited --format '{{.Names}}'")
        .output()
        .map_err(|e| format!("Failed to list containers (docker not found or not executable): {}", e))?;

    if !output.status.success() {
        return Err("Failed to list containers".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    eprintln!("DEBUG: All stopped containers:\n{}", stdout);

    let containers: Vec<&str> = stdout
        .lines()
        .filter(|name| {
            if env_name == "default" || env_name == "ushadow" {
                // For default env, match ushadow-{service} or ushadow-{service}-{number}
                // but NOT ushadow-{envname}-{service}
                if !name.starts_with(&pattern) {
                    return false;
                }

                // Check if this is a default env container by checking if it matches known services
                let after_prefix = &name[pattern.len()..];
                let services = ["backend", "webui", "frontend", "worker", "tailscale"];

                services.iter().any(|service| {
                    after_prefix == *service || after_prefix.starts_with(&format!("{}-", service))
                })
            } else {
                name.starts_with(&pattern)
            }
        })
        .collect();

    eprintln!("[start_env] Found {} stopped containers: {:?}", containers.len(), containers);

    // If no stopped containers found, check if ANY containers exist for this env
    if containers.is_empty() {
        eprintln!("[start_env] No stopped containers, checking for running containers...");
        // Check for running containers
        let output = shell_command("docker ps --format '{{.Names}}'")
            .output()
            .map_err(|e| format!("Failed to list running containers (docker not found or not executable): {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            eprintln!("DEBUG: All running containers:\n{}", stdout);

            let running: Vec<&str> = stdout
                .lines()
                .filter(|name| {
                    if env_name == "default" || env_name == "ushadow" {
                        // For default env, match ushadow-{service} or ushadow-{service}-{number}
                        // but NOT ushadow-{envname}-{service}
                        if !name.starts_with(&pattern) {
                            return false;
                        }

                        // Check if this is a default env container by checking if it matches known services
                        let after_prefix = &name[pattern.len()..];
                        let services = ["backend", "webui", "frontend", "worker", "tailscale"];

                        services.iter().any(|service| {
                            after_prefix == *service || after_prefix.starts_with(&format!("{}-", service))
                        })
                    } else {
                        name.starts_with(&pattern)
                    }
                })
                .collect();

            eprintln!("[start_env] Found {} running containers: {:?}", running.len(), running);

            if !running.is_empty() {
                eprintln!("[start_env] Environment already running - nothing to do");
                return Ok(format!("Environment '{}' is already running ({} containers: {})",
                    env_name, running.len(), running.join(", ")));
            }
        }

        // No containers exist - need to build and create them
        eprintln!("[start_env] No containers exist - initializing environment");

        // Calculate port offset from environment name to avoid conflicts
        // Hash the env name to get a deterministic offset
        let port_offset = if &env_name == "ushadow" || env_name.is_empty() {
            0
        } else {
            // Simple hash: sum ASCII values and mod by reasonable range
            let hash: u32 = env_name.bytes().map(|b| b as u32).sum();
            ((hash % 50) * 10) as u16  // Gives offsets: 0, 10, 20, ... 490
        };

        let mut status_log = Vec::new();  // User-visible status messages
        let mut debug_log = Vec::new();   // Detailed debug info (only shown on error)

        // Log to both status and debug
        status_log.push(format!("Initializing environment '{}'...", env_name));
        debug_log.push(format!("========== INITIALIZING ENVIRONMENT =========="));
        debug_log.push(format!("Working directory: {}", working_dir));
        debug_log.push(format!("ENV_NAME={}", env_name));
        debug_log.push(format!("PORT_OFFSET={} (calculated from env name hash)", port_offset));

        // Find uv executable (assumes uv is installed via prerequisites)
        let uv_cmd = find_uv_executable();
        debug_log.push(format!("Using uv at: {}", uv_cmd));

        // Verify uv is accessible
        let uv_check = if uv_cmd == "uv" {
            // If using PATH, verify with --version
            shell_command("uv --version").output().is_ok()
        } else {
            // If using specific path, verify file exists
            std::path::Path::new(&uv_cmd).exists()
        };

        if !uv_check {
            let error_msg = format!(
                "uv not found or not accessible (tried: {})\n\nPlease install uv via the Prerequisites panel before starting an environment.",
                uv_cmd
            );
            status_log.push(error_msg.clone());
            debug_log.push(error_msg);
            return Err(format!("{}\n\n=== Debug Log ===\n{}",
                status_log.join("\n"),
                debug_log.join("\n")));
        }

        // Run setup with uv in dev mode with calculated port offset
        // Note: Removed --skip-admin flag so admin user can be auto-created from secrets.yaml
        status_log.push(format!("Running setup script..."));

        // Get bundled setup scripts if available
        let bundled_setup_dir = bundled::get_setup_dir(&working_dir);

        // Copy bundled setup to working directory if it's from the bundled location
        // This avoids permission issues on Windows where Program Files requires admin
        let working_setup_dir = std::path::Path::new(&working_dir).join("setup");

        if bundled_setup_dir != working_setup_dir {
            debug_log.push(format!("Copying bundled setup from {:?} to {:?}", bundled_setup_dir, working_setup_dir));

            // Recursively copy the entire setup directory
            if let Err(e) = copy_dir_recursive(&bundled_setup_dir, &working_setup_dir) {
                debug_log.push(format!("Warning: Failed to copy setup directory: {}", e));
                // Continue anyway - might be a partial copy that still works
            } else {
                debug_log.push(format!("✓ Bundled setup copied successfully"));
            }
        }

        let run_py_path = working_setup_dir.join("run.py");
        let run_py_quoted = quote_path_buf(&run_py_path);

        debug_log.push(format!("Using setup script: {:?}", run_py_path));
        debug_log.push(format!("Running: {} run --with pyyaml {} --dev --quick", uv_cmd, run_py_quoted));

        // Build the full command string using platform abstraction
        // Pass PORT_OFFSET for compatibility with both old and new setup scripts
        let mut env_vars = HashMap::new();
        env_vars.insert("ENV_NAME".to_string(), env_name.clone());
        env_vars.insert("PORT_OFFSET".to_string(), port_offset.to_string());

        let command = format!("{} run --with pyyaml {} --dev --quick", uv_cmd, run_py_quoted);
        let setup_command = Platform::build_env_command(&working_dir, env_vars, &command);

        let output = shell_command(&setup_command)
            .output()
            .map_err(|e| {
                let full_log = format!("{}\n\n=== Debug Log ===\n{}",
                    status_log.join("\n"),
                    debug_log.join("\n"));
                format!("{}\n\nFailed to run setup (uv not found at '{}'. Try installing manually: https://docs.astral.sh/uv/getting-started/installation/): {}", full_log, uv_cmd, e)
            })?;

        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);

        if !stdout.is_empty() {
            debug_log.push(format!("Setup stdout:\n{}", stdout));
        }
        if !stderr.is_empty() {
            debug_log.push(format!("Setup stderr:\n{}", stderr));
        }

        if !output.status.success() {
            // Get the full error message, not just the last line
            let error_msg = if !stderr.is_empty() {
                stderr.to_string()
            } else {
                stdout.to_string()
            };

            // Show last 10 lines of error for better context
            let error_lines: Vec<&str> = error_msg.lines().collect();
            let context_lines = if error_lines.len() > 10 {
                &error_lines[error_lines.len()-10..]
            } else {
                &error_lines[..]
            };

            // On error, show both status and debug logs
            let full_log = format!("{}\n\n=== Debug Log ===\n{}",
                status_log.join("\n"),
                debug_log.join("\n"));

            return Err(format!(
                "{}\n\n❌ Failed to initialize environment '{}'\n\nError output:\n{}",
                full_log,
                env_name,
                context_lines.join("\n")
            ));
        }

        // On success, only show status log
        status_log.push(format!("✓ Environment '{}' initialized and started", env_name));
        return Ok(status_log.join("\n"));
    }

    // Containers exist and are stopped - just start them
    eprintln!("[start_env] Found {} stopped containers: {:?}", containers.len(), containers);

    let container_names = containers.join(" ");
    let start_command = format!("docker start {}", container_names);
    eprintln!("[start_env] Starting containers: {}", start_command);

    let output = shell_command(&start_command)
        .output()
        .map_err(|e| format!("Failed to start containers (docker not found or not executable): {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    eprintln!("[start_env] Start result - stdout: {}, stderr: {}", stdout, stderr);

    if !output.status.success() {
        return Err(format!("Failed to start containers: {}", stderr));
    }

    let started: Vec<&str> = stdout.lines().collect();
    Ok(format!("Environment '{}' started: {} containers ({})",
        env_name,
        started.len(),
        started.join(", ")
    ))
}

/// Stop a specific environment by name
#[tauri::command]
pub async fn stop_environment(_state: State<'_, AppState>, env_name: String) -> Result<String, String> {
    // Find all containers for this environment by name pattern
    let pattern = if env_name == "default" || env_name == "ushadow" {
        // Default/ushadow env uses ushadow-backend, ushadow-webui pattern
        "ushadow-".to_string()
    } else {
        format!("ushadow-{}-", env_name)
    };

    // Get matching container names
    let output = shell_command("docker ps -a --format '{{.Names}}'")
        .output()
        .map_err(|e| format!("Failed to list containers (docker not found or not executable): {}", e))?;

    if !output.status.success() {
        return Err("Failed to list containers".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let containers: Vec<&str> = stdout
        .lines()
        .filter(|name| {
            if env_name == "default" || env_name == "ushadow" {
                // For default env, match ushadow-{service} or ushadow-{service}-{number}
                // but NOT ushadow-{envname}-{service}
                if !name.starts_with(&pattern) {
                    return false;
                }

                // Check if this is a default env container by checking if it matches known services
                let after_prefix = &name[pattern.len()..];
                let services = ["backend", "webui", "frontend", "worker", "tailscale"];

                services.iter().any(|service| {
                    after_prefix == *service || after_prefix.starts_with(&format!("{}-", service))
                })
            } else {
                name.starts_with(&pattern)
            }
        })
        .collect();

    if containers.is_empty() {
        return Ok(format!("No containers found for environment '{}'", env_name));
    }

    // Stop all matching containers
    let container_names = containers.join(" ");
    let stop_command = format!("docker stop {}", container_names);

    let output = shell_command(&stop_command)
        .output()
        .map_err(|e| format!("Failed to stop containers (docker not found or not executable): {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Stop failed: {}", stderr));
    }

    Ok(format!("Environment '{}' stopped ({} containers)", env_name, containers.len()))
}

/// Legacy: Start Docker containers (starts infra)
#[tauri::command]
pub async fn start_containers(state: State<'_, AppState>) -> Result<String, String> {
    start_infrastructure(state).await
}

/// Legacy: Stop Docker containers (stops infra)
#[tauri::command]
pub async fn stop_containers(state: State<'_, AppState>) -> Result<String, String> {
    stop_infrastructure(state).await
}

/// Get container status
#[tauri::command]
pub fn get_container_status(state: State<AppState>) -> Result<ContainerStatus, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = match root.clone() {
        Some(p) => p,
        None => {
            return Ok(ContainerStatus {
                running: false,
                backend_healthy: false,
                frontend_healthy: false,
                services: vec![],
            })
        }
    };
    drop(root);

    let output = shell_command("docker compose ps --format '{{.Name}}\t{{.Status}}\t{{.Ports}}'")
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to get status (docker not found or not executable): {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut services = Vec::new();
    let mut backend_healthy = false;
    let mut frontend_healthy = false;

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            let name = parts[0].to_string();
            let status = parts[1].to_string();
            let ports = parts.get(2).map(|s| s.to_string());

            if name.contains("backend") && status.contains("Up") {
                backend_healthy = true;
            }
            if name.contains("frontend") && status.contains("Up") {
                frontend_healthy = true;
            }

            services.push(ServiceInfo { name, status, ports });
        }
    }

    let running = !services.is_empty() && services.iter().any(|s| s.status.contains("Up"));

    Ok(ContainerStatus {
        running,
        backend_healthy,
        frontend_healthy,
        services,
    })
}

/// Check if backend API is healthy
#[tauri::command]
pub async fn check_backend_health(port: u16) -> Result<bool, String> {
    let url = format!("http://localhost:{}/health", port);

    let output = silent_command("curl")
        .args(["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "2", &url])
        .output();

    match output {
        Ok(out) => {
            let code = String::from_utf8_lossy(&out.stdout);
            Ok(code.trim() == "200")
        }
        Err(_) => Ok(false),
    }
}

/// Check if web UI is responding
#[tauri::command]
pub async fn check_webui_health(port: u16) -> Result<bool, String> {
    let url = format!("http://localhost:{}", port);

    let output = silent_command("curl")
        .args(["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "2", &url])
        .output();

    match output {
        Ok(out) => {
            let code = String::from_utf8_lossy(&out.stdout);
            let code_num = code.trim();
            // Accept any 2xx or 3xx response (web UI is serving)
            Ok(code_num.starts_with('2') || code_num.starts_with('3'))
        }
        Err(_) => Ok(false),
    }
}

/// Focus the main window (bring to foreground)
#[tauri::command]
pub fn focus_window(window: tauri::Window) -> Result<(), String> {
    window.set_focus().map_err(|e| e.to_string())?;

    // On macOS, also activate the app to ensure it comes to front
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("osascript")
            .args(["-e", "tell application \"Ushadow Launcher\" to activate"])
            .spawn();
    }

    Ok(())
}

/// Open URL in default browser
#[tauri::command]
pub fn open_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        // Use silent_command to avoid console window flash
        silent_command("cmd")
            .args(["/C", "start", "", &url])  // Empty string prevents window title issue
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}



/// Create a new environment using dev.sh
/// mode: "dev" for hot-reload, "prod" for production build
#[tauri::command]
pub async fn create_environment(state: State<'_, AppState>, name: String, mode: Option<String>) -> Result<String, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    // Check if dev.sh exists
    let script_path = std::path::Path::new(&project_root).join("dev.sh");
    if !script_path.exists() {
        return Err(format!("dev.sh not found in {}. Make sure you're pointing to a valid Ushadow repository.", project_root));
    }

    // Find available ports (default: 8000 for backend, 3000 for webui)
    let (backend_port, webui_port) = find_available_ports(8000, 3000);

    // Calculate port offset (both ports use same offset from defaults)
    let port_offset = backend_port - 8000;

    // Determine mode flag
    let mode_flag = match mode.as_deref() {
        Some("prod") => "--prod",
        _ => "--dev", // Default to dev mode (hot-reload)
    };

    // Run dev.sh in quick mode with environment name and port offset
    let output = silent_command("bash")
        .args(["dev.sh", "--quick", mode_flag])
        .current_dir(&project_root)
        .env("ENV_NAME", &name)
        .env("PORT_OFFSET", port_offset.to_string())
        .env("USHADOW_NO_BROWSER", "1")  // Custom env var we can check in script
        .output()
        .map_err(|e| format!("Failed to run dev.sh: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let error_msg = if !stderr.is_empty() { stderr.to_string() } else { stdout.to_string() };
        return Err(format!("Failed to start environment: {}", error_msg.lines().last().unwrap_or(&error_msg)));
    }

    let port_info = if port_offset > 0 {
        format!(" (ports: backend={}, webui={})", backend_port, webui_port)
    } else {
        String::new()
    };

    Ok(format!("Environment '{}' started{}", name, port_info))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_state_creation() {
        let state = AppState::new();
        let root = state.project_root.lock().unwrap();
        assert!(root.is_none());
    }
}
