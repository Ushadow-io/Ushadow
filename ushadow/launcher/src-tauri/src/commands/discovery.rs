use std::collections::{HashSet, HashMap};
use std::process::Command;
use crate::models::{DiscoveryResult, InfraService, UshadowEnvironment, EnvironmentStatus, WorktreeInfo};
use super::prerequisites::{check_docker, check_tailscale};
use super::worktree::{list_worktrees, get_colors_for_name};

/// Infrastructure service patterns
const INFRA_PATTERNS: &[(&str, &str)] = &[
    ("mongo", "MongoDB"),
    ("redis", "Redis"),
    ("neo4j", "Neo4j"),
    ("qdrant", "Qdrant"),
];

/// Discover all Ushadow environments (worktrees + running containers)
#[tauri::command]
pub async fn discover_environments() -> Result<DiscoveryResult, String> {
    discover_environments_with_config(None, None).await
}

/// Discover environments with configurable paths
#[tauri::command]
pub async fn discover_environments_with_config(
    main_repo: Option<String>,
    worktrees_dir: Option<String>,
) -> Result<DiscoveryResult, String> {
    // Check prerequisites
    let (docker_installed, docker_running, _) = check_docker();
    let (tailscale_installed, tailscale_connected, _) = check_tailscale();

    let docker_ok = docker_installed && docker_running;
    let tailscale_ok = tailscale_installed && tailscale_connected;

    // Default paths
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let main_repo = main_repo.unwrap_or_else(|| format!("{}/repos/ushadow", home));
    let _worktrees_dir = worktrees_dir.unwrap_or_else(|| format!("{}/repos/worktrees/ushadow", home));

    // Get worktrees first (source of truth for environments)
    let worktrees = list_worktrees(main_repo.clone()).await.unwrap_or_default();

    // Build a map of worktree name -> worktree info
    let mut worktree_map: HashMap<String, WorktreeInfo> = HashMap::new();
    for wt in worktrees {
        worktree_map.insert(wt.name.clone(), wt);
    }

    // Get running Docker containers if Docker is available
    let mut running_backends: HashMap<String, (u16, Option<String>)> = HashMap::new(); // name -> (port, tailscale_url)
    let mut infrastructure = Vec::new();

    if docker_ok {
        let output = Command::new("docker")
            .args(["ps", "--format", "{{.Names}}|{{.Status}}|{{.Ports}}"])
            .output()
            .map_err(|e| format!("Failed to get containers: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut found_infra: HashSet<String> = HashSet::new();

            for line in stdout.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }

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

                // Check Ushadow environment backends
                if name.contains("backend") && name.starts_with("ushadow") && !name.contains("chronicle") {
                    let env_name = if name == "ushadow-backend" {
                        "default".to_string()
                    } else {
                        name.trim_start_matches("ushadow-")
                            .trim_end_matches("-backend")
                            .to_string()
                    };

                    if let Some(ref port_str) = ports {
                        if let Some(port) = extract_port(port_str) {
                            if is_running {
                                let tailscale_url = get_tailscale_url(port);
                                running_backends.insert(env_name, (port, tailscale_url));
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

        // Check if this environment has running containers
        let (status, backend_port, webui_port, localhost_url, tailscale_url, tailscale_active) =
            if let Some((port, ts_url)) = running_backends.get(name) {
                let wp = if *port >= 8000 { Some(*port - 5000) } else { None };
                let url = wp.map(|p| format!("http://localhost:{}", p))
                    .unwrap_or_else(|| format!("http://localhost:{}", port));
                (
                    EnvironmentStatus::Running,
                    Some(*port),
                    wp,
                    Some(url),
                    ts_url.clone(),
                    ts_url.is_some(),
                )
            } else {
                (EnvironmentStatus::Available, None, None, None, None, false)
            };

        environments.push(UshadowEnvironment {
            name: name.clone(),
            color: primary,
            path: Some(wt.path.clone()),
            branch: Some(wt.branch.clone()),
            status,
            localhost_url,
            tailscale_url,
            backend_port,
            webui_port,
            tailscale_active,
        });
    }

    // Also add running environments that aren't worktrees (e.g., "default")
    for (name, (port, ts_url)) in &running_backends {
        if !worktree_map.contains_key(name) {
            let (primary, _dark) = get_colors_for_name(name);
            let wp = if *port >= 8000 { Some(*port - 5000) } else { None };
            let url = wp.map(|p| format!("http://localhost:{}", p))
                .unwrap_or_else(|| format!("http://localhost:{}", port));

            environments.push(UshadowEnvironment {
                name: name.clone(),
                color: primary,
                path: None,
                branch: None,
                status: EnvironmentStatus::Running,
                localhost_url: Some(url),
                tailscale_url: ts_url.clone(),
                backend_port: Some(*port),
                webui_port: wp,
                tailscale_active: ts_url.is_some(),
            });
        }
    }

    // Sort by name
    environments.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(DiscoveryResult {
        infrastructure,
        environments,
        docker_ok,
        tailscale_ok,
    })
}

/// Extract port from Docker ports string
fn extract_port(ports_str: &str) -> Option<u16> {
    // Format: "0.0.0.0:8000->8000/tcp" or "0.0.0.0:8050->8000/tcp"
    for part in ports_str.split(',') {
        if let Some(mapping) = part.split("->").next() {
            if let Some(port_str) = mapping.split(':').last() {
                if let Ok(port) = port_str.trim().parse::<u16>() {
                    return Some(port);
                }
            }
        }
    }
    None
}

/// Get Tailscale URL from leader info endpoint
fn get_tailscale_url(port: u16) -> Option<String> {
    let url = format!("http://localhost:{}/api/unodes/leader/info", port);

    let output = Command::new("curl")
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_port_simple() {
        let ports = "0.0.0.0:8000->8000/tcp";
        assert_eq!(extract_port(ports), Some(8000));
    }

    #[test]
    fn test_extract_port_mapped() {
        let ports = "0.0.0.0:8050->8000/tcp";
        assert_eq!(extract_port(ports), Some(8050));
    }

    #[test]
    fn test_extract_port_multiple() {
        let ports = "0.0.0.0:3000->80/tcp, [::]:3000->80/tcp";
        assert_eq!(extract_port(ports), Some(3000));
    }

    #[test]
    fn test_extract_port_empty() {
        assert_eq!(extract_port(""), None);
    }

    #[test]
    fn test_extract_port_no_mapping() {
        assert_eq!(extract_port("some random text"), None);
    }

    #[tokio::test]
    async fn test_discover_environments_runs() {
        // This test just verifies the function runs without panicking
        // Actual results depend on system state
        let result = discover_environments().await;
        assert!(result.is_ok());
        let discovery = result.unwrap();
        println!("Found {} infra, {} environments",
            discovery.infrastructure.len(),
            discovery.environments.len());
    }
}
