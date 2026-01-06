use std::process::Command;
use std::sync::Mutex;
use tauri::State;
use crate::models::{ContainerStatus, ServiceInfo};
use super::utils::silent_command;

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

/// Start Docker containers
#[tauri::command]
pub async fn start_containers(state: State<'_, AppState>) -> Result<String, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    // Start infrastructure
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

    let mut running = state.containers_running.lock().map_err(|e| e.to_string())?;
    *running = true;

    Ok("Infrastructure started".to_string())
}

/// Stop Docker containers
#[tauri::command]
pub async fn stop_containers(state: State<'_, AppState>) -> Result<String, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    // Stop infra containers
    let output = silent_command("docker")
        .args(["compose", "-p", "infra", "down"])
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to stop containers: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Stop failed: {}", stderr));
    }

    let mut running = state.containers_running.lock().map_err(|e| e.to_string())?;
    *running = false;

    Ok("Containers stopped".to_string())
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
        Command::new("cmd")
            .args(["/C", "start", &url])
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



/// Create a new environment using go.sh
#[tauri::command]
pub async fn create_environment(state: State<'_, AppState>, name: Option<String>) -> Result<String, String> {
    let root = state.project_root.lock().map_err(|e| e.to_string())?;
    let project_root = root.clone().ok_or("Project root not set")?;
    drop(root);

    let env_name = name.unwrap_or_else(|| "default".to_string());

    // Run go.sh with --no-auto-open to prevent browser opening
    let output = silent_command("./go.sh")
        .args(["--no-auto-open"])
        .current_dir(&project_root)
        .env("ENV_NAME", &env_name)
        .output()
        .map_err(|e| format!("Failed to run go.sh: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("go.sh failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(format!("Environment '{}' created: {}", env_name, stdout))
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
