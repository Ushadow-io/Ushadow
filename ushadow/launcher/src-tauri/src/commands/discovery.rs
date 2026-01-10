use std::collections::{HashMap, HashSet};
use crate::models::{DiscoveryResult, EnvironmentStatus, InfraService, UshadowEnvironment, WorktreeInfo};
use super::prerequisites::{check_docker, check_tailscale};
use super::utils::silent_command;
use super::worktree::{list_worktrees, get_colors_for_name};

/// Infrastructure service patterns
const INFRA_PATTERNS: &[(&str, &str)] = &[
    ("mongo", "MongoDB"),
    ("redis", "Redis"),
    ("neo4j", "Neo4j"),
    ("qdrant", "Qdrant"),
];

/// Environment container info
struct EnvContainerInfo {
    backend_port: Option<u16>,
    containers: Vec<String>,
    has_running: bool,
}

/// Discover Ushadow environments and infrastructure (running and stopped)
#[tauri::command]
pub async fn discover_environments() -> Result<DiscoveryResult, String> {
    discover_environments_with_config(None, None).await
}

/// Discover environments with configurable paths
#[tauri::command]
pub async fn discover_environments_with_config(
    main_repo: Option<String>,
    _worktrees_dir: Option<String>,
) -> Result<DiscoveryResult, String> {
    // Check prerequisites
    let (docker_installed, docker_running, _) = check_docker();
    let (tailscale_installed, tailscale_connected, _) = check_tailscale();

    let docker_ok = docker_installed && docker_running;
    let tailscale_ok = tailscale_installed && tailscale_connected;

    // Default paths
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let main_repo = main_repo.unwrap_or_else(|| format!("{}/repos/ushadow", home));

    // Get worktrees first (source of truth for environments)
    let worktrees = match list_worktrees(main_repo.clone()).await {
        Ok(wt) => {
            eprintln!("[discovery] Found {} worktrees from {}", wt.len(), main_repo);
            wt
        }
        Err(e) => {
            eprintln!("[discovery] Failed to list worktrees from {}: {}", main_repo, e);
            Vec::new()
        }
    };

    // Build a map of worktree name -> worktree info
    let mut worktree_map: HashMap<String, WorktreeInfo> = HashMap::new();
    for wt in worktrees {
        worktree_map.insert(wt.name.clone(), wt);
    }

    // Infrastructure and environment maps
    let mut infrastructure = Vec::new();
    let mut found_infra = HashSet::new();
    let mut env_map: HashMap<String, EnvContainerInfo> = HashMap::new();

    if docker_ok {
        let output = silent_command("docker")
            .args(["ps", "-a", "--format", "{{.Names}}|{{.Status}}|{{.Ports}}"])
            .output()
            .map_err(|e| format!("Failed to get containers: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);

            for line in stdout.lines() {
                let parts: Vec<&str> = line.split('|').collect();
                if parts.len() < 2 {
                    continue;
                }

                let name = parts[0].trim();
                let status = parts[1].trim();
                let ports = if parts.len() > 2 { Some(parts[2].trim().to_string()) } else { None };
                let is_running = status.contains("Up");

                // Check infrastructure services
                for (pattern, display_name) in INFRA_PATTERNS {
                    if name == *pattern || name.ends_with(&format!("-{}", pattern)) || name.ends_with(&format!("-{}-1", pattern)) {
                        if !found_infra.contains(*pattern) {
                            found_infra.insert(pattern.to_string());
                            infrastructure.push(InfraService {
                                name: pattern.to_string(),
                                display_name: display_name.to_string(),
                                running: is_running,
                                ports: ports.clone(),
                            });
                        }
                    }
                }

                // Check Ushadow environment containers (backend, webui, etc.)
                if name.starts_with("ushadow") && !name.contains("chronicle") {
                    let env_name = extract_env_name(name);

                    let entry = env_map.entry(env_name.clone()).or_insert(EnvContainerInfo {
                        backend_port: None,
                        containers: Vec::new(),
                        has_running: false,
                    });

                    entry.containers.push(name.to_string());

                    if is_running {
                        entry.has_running = true;
                    }

                    // Extract backend port if this is the backend container
                    if name.contains("backend") && is_running {
                        if let Some(ref port_str) = ports {
                            if let Some(port) = extract_port(port_str) {
                                entry.backend_port = Some(port);
                            }
                        }
                    }
                }
            }
        }
    }

    // Build environment list from worktrees, enriched with Docker status
    let mut environments = Vec::new();

    for (name, wt) in &worktree_map {
        let (primary, _dark) = get_colors_for_name(name);

        // Check if this environment has Docker containers
        let (status, backend_port, webui_port, localhost_url, tailscale_url, tailscale_active, containers) =
            if let Some(info) = env_map.remove(name) {
                let port = info.backend_port.unwrap_or(8000);
                let wp = if port >= 8000 { Some(port - 5000) } else { None };

                let (url, ts_url, ts_active) = if info.has_running {
                    let localhost = wp.map(|p| format!("http://localhost:{}", p))
                        .unwrap_or_else(|| format!("http://localhost:{}", port));
                    let ts = get_tailscale_url(name, port);
                    let active = ts.is_some();
                    (Some(localhost), ts, active)
                } else {
                    (None, None, false)
                };

                let env_status = if info.has_running {
                    EnvironmentStatus::Running
                } else {
                    EnvironmentStatus::Stopped
                };

                (env_status, info.backend_port, wp, url, ts_url, ts_active, info.containers)
            } else {
                (EnvironmentStatus::Available, None, None, None, None, false, Vec::new())
            };

        let running = status == EnvironmentStatus::Running || status == EnvironmentStatus::Partial;
        environments.push(UshadowEnvironment {
            name: name.clone(),
            color: primary,
            path: Some(wt.path.clone()),
            branch: Some(wt.branch.clone()),
            status,
            running,
            localhost_url,
            tailscale_url,
            backend_port,
            webui_port,
            tailscale_active,
            containers,
            is_worktree: true,
        });
    }

    // Also add environments that have Docker containers but no worktree
    for (name, info) in env_map {
        let (primary, _dark) = get_colors_for_name(&name);
        let port = info.backend_port.unwrap_or(8000);
        let wp = if port >= 8000 { Some(port - 5000) } else { None };

        let (localhost_url, tailscale_url, tailscale_active) = if info.has_running {
            let localhost = wp.map(|p| format!("http://localhost:{}", p))
                .unwrap_or_else(|| format!("http://localhost:{}", port));
            let ts = get_tailscale_url(&name, port);
            let active = ts.is_some();
            (Some(localhost), ts, active)
        } else {
            (None, None, false)
        };

        let status = if info.has_running {
            EnvironmentStatus::Running
        } else {
            EnvironmentStatus::Stopped
        };

        let running = status == EnvironmentStatus::Running;
        environments.push(UshadowEnvironment {
            name: name.clone(),
            color: primary,
            path: None,
            branch: None,
            status,
            running,
            localhost_url,
            tailscale_url,
            backend_port: info.backend_port,
            webui_port: wp,
            tailscale_active,
            containers: info.containers,
            is_worktree: false,
        });
    }

    // Sort environments by name
    environments.sort_by(|a, b| a.name.cmp(&b.name));

    eprintln!("[discovery] Returning {} environments:", environments.len());
    for env in &environments {
        eprintln!("[discovery]   - {} (path: {:?}, branch: {:?})", env.name, env.path, env.branch);
    }

    Ok(DiscoveryResult {
        infrastructure,
        environments,
        docker_ok,
        tailscale_ok,
    })
}

/// Extract environment name from container name
/// Examples:
///   ushadow-gold-backend -> gold (colored environment)
///   ushadow-backend -> ushadow (default environment)
fn extract_env_name(container_name: &str) -> String {
    let parts: Vec<&str> = container_name.split('-').collect();
    if parts[0] == "ushadow" {
        if parts.len() == 3 {
            // ushadow-gold-backend -> gold (colored environment)
            parts[1].to_string()
        } else if parts.len() == 2 {
            // ushadow-backend -> ushadow (default environment)
            "ushadow".to_string()
        } else {
            // Fallback for unexpected patterns
            parts.get(1).unwrap_or(&"ushadow").to_string()
        }
    } else {
        container_name.to_string()
    }
}

/// Extract port from Docker port string (e.g., "0.0.0.0:8000->8000/tcp" -> Some(8000))
fn extract_port(port_str: &str) -> Option<u16> {
    // Format: "0.0.0.0:8000->8000/tcp" or "8000/tcp"
    port_str.split("->")
        .next()
        .and_then(|s| s.split(':').nth(1))
        .and_then(|s| s.parse().ok())
}

/// Get Tailscale URL by querying the backend service's leader info endpoint
/// The backend service knows its own Tailscale URL and reports it via the API
fn get_tailscale_url(_env_name: &str, port: u16) -> Option<String> {
    let url = format!("http://localhost:{}/api/unodes/leader/info", port);

    // Query the backend service to get its Tailscale URL
    let output = silent_command("curl")
        .args(["-s", "--connect-timeout", "1", "--max-time", "2", &url])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse JSON to extract ushadow_api_url
    for line in stdout.split(',') {
        if line.contains("ushadow_api_url") {
            if let Some(start) = line.find("https://") {
                let rest = &line[start..];
                if let Some(end) = rest.find('"') {
                    return Some(rest[..end].to_string());
                }
            }
        }
    }

    None
}
