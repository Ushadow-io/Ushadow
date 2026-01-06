use std::collections::HashSet;
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

/// Discover running Ushadow environments and infrastructure
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

    // Get all Docker containers
    let output = silent_command("docker")
        .args(["ps", "--format", "{{.Names}}|{{.Status}}|{{.Ports}}"])
        .output()
        .map_err(|e| format!("Failed to get containers: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Docker command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut infrastructure = Vec::new();
    let mut env_backends: Vec<(String, u16)> = Vec::new();
    let mut found_infra: HashSet<String> = HashSet::new();

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
                        env_backends.push((env_name, port));
                    }
                }
            }
        }
    }

    // Build environment list with Tailscale URLs
    let mut environments = Vec::new();
    for (env_name, backend_port) in env_backends {
        let color = env_name.clone();
        let tailscale_url = get_tailscale_url(backend_port);
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
            name: env_name,
            color,
            localhost_url,
            tailscale_url,
            backend_port,
            webui_port,
            running: true,
            tailscale_active,
        });
    }

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
}
