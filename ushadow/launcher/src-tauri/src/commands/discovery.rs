use std::collections::{HashMap, HashSet};
use crate::models::{DiscoveryResult, InfraService, UshadowEnvironment};
use super::prerequisites::{check_docker, check_tailscale};
use super::utils::silent_command;

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
    // Check prerequisites
    let (docker_installed, docker_running, _) = check_docker();
    let (tailscale_installed, tailscale_connected, _) = check_tailscale();

    let docker_ok = docker_installed && docker_running;
    let tailscale_ok = tailscale_installed && tailscale_connected;

    if !docker_ok {
        return Ok(DiscoveryResult {
            infrastructure: vec![],
            environments: vec![],
            docker_ok: false,
            tailscale_ok,
        });
    }

    // Get ALL Docker containers (including stopped with -a)
    let output = silent_command("docker")
        .args(["ps", "-a", "--format", "{{.Names}}|{{.Status}}|{{.Ports}}"])
        .output()
        .map_err(|e| format!("Failed to get containers: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Docker command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut infrastructure = Vec::new();
    let mut found_infra: HashSet<String> = HashSet::new();
    let mut env_map: HashMap<String, EnvContainerInfo> = HashMap::new();

    // Parse Docker ps output
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

        // Check Ushadow environment containers (backend, webui, etc.)
        if name.starts_with("ushadow") && !name.contains("chronicle") {
            // Extract environment name from container name
            // Patterns: ushadow-backend, ushadow-webui, ushadow-{env}-backend, ushadow-{env}-webui
            let env_name = extract_env_name(name);

            let entry = env_map.entry(env_name.clone()).or_insert(EnvContainerInfo {
                backend_port: None,
                containers: Vec::new(),
                has_running: false,
            });

            // Add container to the list
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

    // Build environment list
    let mut environments = Vec::new();
    for (env_name, info) in env_map {
        let backend_port = info.backend_port.unwrap_or(8000);
        let running = info.has_running;

        let tailscale_url = if running {
            get_tailscale_url(backend_port)
        } else {
            None
        };
        let tailscale_active = tailscale_url.is_some();

        let webui_port = if backend_port >= 8000 {
            Some(backend_port - 5000)
        } else {
            None
        };

        let localhost_url = if let Some(wp) = webui_port {
            format!("http://localhost:{}", wp)
        } else {
            format!("http://localhost:{}", backend_port)
        };

        environments.push(UshadowEnvironment {
            name: env_name.clone(),
            color: env_name,
            localhost_url,
            tailscale_url,
            backend_port,
            webui_port,
            running,
            tailscale_active,
            containers: info.containers,
            path: None, // Path discovery not yet implemented
        });
    }

    // Sort environments by name
    environments.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(DiscoveryResult {
        infrastructure,
        environments,
        docker_ok,
        tailscale_ok,
    })
}

/// Extract environment name from container name
fn extract_env_name(container_name: &str) -> String {
    // Remove "ushadow-" prefix
    let without_prefix = container_name.trim_start_matches("ushadow-");

    // Known suffixes to strip (service types and docker compose suffixes)
    let suffixes = ["-backend", "-webui", "-frontend", "-worker", "-tailscale", "-1"];

    let mut name = without_prefix.to_string();
    
    // Keep stripping suffixes until no more match (handles cases like "red-backend-1")
    loop {
        let mut changed = false;
        for suffix in suffixes {
            if name.ends_with(suffix) {
                name = name.trim_end_matches(suffix).to_string();
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }

    // If empty or just numbers, default to "ushadow"
    if name.is_empty() || name.chars().all(|c| c.is_numeric() || c == '-') {
        return "ushadow".to_string();
    }

    // Handle case where name is just a service type (i.e., ushadow-backend)
    if name == "backend" || name == "webui" || name == "frontend" || name == "worker" || name == "tailscale" {
        return "ushadow".to_string();
    }

    name
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

    #[test]
    fn test_extract_env_name_basic() {
        assert_eq!(extract_env_name("ushadow-red-backend"), "red");
        assert_eq!(extract_env_name("ushadow-red-webui"), "red");
        assert_eq!(extract_env_name("ushadow-red-frontend"), "red");
    }

    #[test]
    fn test_extract_env_name_tailscale() {
        // This was the bug: red-tailscale was being treated as separate environment
        assert_eq!(extract_env_name("ushadow-red-tailscale"), "red");
    }

    #[test]
    fn test_extract_env_name_with_compose_suffix() {
        // Docker compose adds -1 suffix
        assert_eq!(extract_env_name("ushadow-red-backend-1"), "red");
        assert_eq!(extract_env_name("ushadow-red-tailscale-1"), "red");
    }

    #[test]
    fn test_extract_env_name_default() {
        // Containers without env name should be "default"
        assert_eq!(extract_env_name("ushadow-backend"), "default");
        assert_eq!(extract_env_name("ushadow-webui"), "default");
        assert_eq!(extract_env_name("ushadow-tailscale"), "default");
    }

    #[test]
    fn test_extract_env_name_complex() {
        assert_eq!(extract_env_name("ushadow-my-env-backend-1"), "my-env");
        assert_eq!(extract_env_name("ushadow-production-worker"), "production");
    }
}
