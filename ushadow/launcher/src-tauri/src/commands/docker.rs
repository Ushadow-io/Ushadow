use std::net::TcpListener;
use std::process::Command;
use std::sync::Mutex;
use tauri::State;
use crate::models::{ContainerStatus, ServiceInfo};
use super::utils::silent_command;

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
    pub containers_running: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            project_root: Mutex::new(None),
            containers_running: Mutex::new(false),
        }
    }
}

/// Set the project root directory
#[tauri::command]
pub fn set_project_root(path: String, state: State<AppState>) -> Result<(), String> {
    let mut root = state.project_root.lock().map_err(|e| e.to_string())?;
    *root = Some(path);
    Ok(())
}

/// Start shared infrastructure containers
#[tauri::command]
pub async fn start_infrastructure(state: State<'_, AppState>) -> Result<String, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    let infra_output = silent_command("docker")
        .args([
            "compose",
            "-f", "compose/docker-compose.infra.yml",
            "-p", "infra",
            "--profile", "infra",
            "up", "-d",
        ])
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to start infrastructure: {}", e))?;

    if !infra_output.status.success() {
        let stderr = String::from_utf8_lossy(&infra_output.stderr);
        return Err(format!("Infrastructure failed: {}", stderr));
    }

    Ok("Infrastructure started".to_string())
}

/// Stop shared infrastructure containers
#[tauri::command]
pub async fn stop_infrastructure(state: State<'_, AppState>) -> Result<String, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    let output = silent_command("docker")
        .args(["compose", "-p", "infra", "down"])
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to stop infrastructure: {}", e))?;

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
    let _ = silent_command("docker")
        .args(["compose", "-p", "infra", "down"])
        .current_dir(&project_root)
        .output();

    // Start again
    let output = silent_command("docker")
        .args([
            "compose",
            "-f", "compose/docker-compose.infra.yml",
            "-p", "infra",
            "--profile", "infra",
            "up", "-d",
        ])
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to restart infrastructure: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Restart failed: {}", stderr));
    }

    Ok("Infrastructure restarted".to_string())
}

/// Start a specific environment by name
#[tauri::command]
pub async fn start_environment(_state: State<'_, AppState>, env_name: String) -> Result<String, String> {
    // Find all stopped containers for this environment by name pattern
    let pattern = if env_name == "default" {
        "ushadow-".to_string()
    } else {
        format!("ushadow-{}-", env_name)
    };

    // Get matching stopped container names
    let output = silent_command("docker")
        .args(["ps", "-a", "--filter", "status=exited", "--format", "{{.Names}}"])
        .output()
        .map_err(|e| format!("Failed to list containers: {}", e))?;

    if !output.status.success() {
        return Err("Failed to list containers".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let containers: Vec<&str> = stdout
        .lines()
        .filter(|name| {
            if env_name == "default" {
                name.starts_with(&pattern) && 
                (*name == "ushadow-backend" || *name == "ushadow-webui" || 
                 *name == "ushadow-frontend" || *name == "ushadow-worker" ||
                 *name == "ushadow-tailscale" ||
                 name.starts_with("ushadow-backend-") || name.starts_with("ushadow-webui-") ||
                 name.starts_with("ushadow-frontend-") || name.starts_with("ushadow-worker-") ||
                 name.starts_with("ushadow-tailscale-"))
            } else {
                name.starts_with(&pattern)
            }
        })
        .collect();

    if containers.is_empty() {
        return Ok(format!("No stopped containers found for environment '{}'", env_name));
    }

    // Start all matching containers
    let mut start_args = vec!["start"];
    start_args.extend(containers.iter().copied());

    let output = silent_command("docker")
        .args(&start_args)
        .output()
        .map_err(|e| format!("Failed to start containers: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Start failed: {}", stderr));
    }

    Ok(format!("Environment '{}' started ({} containers)", env_name, containers.len()))
}

/// Stop a specific environment by name
#[tauri::command]
pub async fn stop_environment(_state: State<'_, AppState>, env_name: String) -> Result<String, String> {
    // Find all containers for this environment by name pattern
    let pattern = if env_name == "default" {
        // Default env uses ushadow-backend, ushadow-webui pattern
        "ushadow-".to_string()
    } else {
        format!("ushadow-{}-", env_name)
    };

    // Get matching container names
    let output = silent_command("docker")
        .args(["ps", "-a", "--format", "{{.Names}}"])
        .output()
        .map_err(|e| format!("Failed to list containers: {}", e))?;

    if !output.status.success() {
        return Err("Failed to list containers".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let containers: Vec<&str> = stdout
        .lines()
        .filter(|name| {
            if env_name == "default" {
                // Match ushadow-backend, ushadow-webui but NOT ushadow-envname-*
                name.starts_with(&pattern) && !name.contains("-backend-") && 
                (*name == "ushadow-backend" || *name == "ushadow-webui" || 
                 *name == "ushadow-frontend" || *name == "ushadow-worker" ||
                 *name == "ushadow-tailscale" ||
                 name.starts_with("ushadow-backend-") || name.starts_with("ushadow-webui-") ||
                 name.starts_with("ushadow-frontend-") || name.starts_with("ushadow-worker-") ||
                 name.starts_with("ushadow-tailscale-"))
            } else {
                name.starts_with(&pattern)
            }
        })
        .collect();

    if containers.is_empty() {
        return Ok(format!("No containers found for environment '{}'", env_name));
    }

    // Stop all matching containers
    let mut stop_args = vec!["stop"];
    stop_args.extend(containers.iter().copied());

    let output = silent_command("docker")
        .args(&stop_args)
        .output()
        .map_err(|e| format!("Failed to stop containers: {}", e))?;

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

    let output = silent_command("docker")
        .args(["compose", "ps", "--format", "{{.Name}}\t{{.Status}}\t{{.Ports}}"])
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to get status: {}", e))?;

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



/// Create a new environment using start-dev.sh
/// mode: "dev" for hot-reload, "prod" for production build
#[tauri::command]
pub async fn create_environment(state: State<'_, AppState>, name: String, mode: Option<String>) -> Result<String, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    // Check if start-dev.sh exists
    let script_path = std::path::Path::new(&project_root).join("start-dev.sh");
    if !script_path.exists() {
        return Err(format!("start-dev.sh not found in {}. Make sure you're pointing to a valid Ushadow repository.", project_root));
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

    // Run start-dev.sh in quick mode with environment name and port offset
    let output = silent_command("bash")
        .args(["start-dev.sh", "--quick", mode_flag])
        .current_dir(&project_root)
        .env("ENV_NAME", &name)
        .env("PORT_OFFSET", port_offset.to_string())
        .env("USHADOW_NO_BROWSER", "1")  // Custom env var we can check in script
        .output()
        .map_err(|e| format!("Failed to run start-dev.sh: {}", e))?;

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
