use crate::config::LauncherConfig;
use crate::models::{EnvironmentStatus, InfraService, UshadowEnvironment};
use serde_json::Value;
use super::utils::silent_command;

/// Information about a discovered container
#[derive(Debug, Clone)]
pub struct ContainerInfo {
    pub name: String,
    pub service_name: String,
    pub status: String,
    pub ports: Vec<PortMapping>,
    pub compose_project: String,
}

/// Port mapping from container to host
#[derive(Debug, Clone)]
pub struct PortMapping {
    pub host_port: u16,
    pub container_port: u16,
    pub protocol: String,
}

/// Discover all containers for a specific environment using Docker Compose labels
pub fn discover_environment_containers(
    config: &LauncherConfig,
    env_name: &str,
) -> Result<Vec<ContainerInfo>, String> {
    // Determine the compose project name for this environment
    // For ushadow: "ushadow-orange", "ushadow-blue", or "ushadow" for default
    let compose_project = if env_name == "default" || env_name.is_empty() {
        config.project.name.clone()
    } else {
        format!("{}-{}", config.project.name, env_name)
    };

    // Query Docker for containers with this compose project label
    let output = silent_command("docker")
        .args([
            "ps",
            "-a",
            "--filter",
            &format!("label=com.docker.compose.project={}", compose_project),
            "--format",
            "{{.Names}}",
        ])
        .output()
        .map_err(|e| format!("Failed to query Docker: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Docker command failed: {}", stderr));
    }

    let container_names = String::from_utf8_lossy(&output.stdout);
    let mut containers = Vec::new();

    for container_name in container_names.lines() {
        if container_name.trim().is_empty() {
            continue;
        }

        // Inspect each container to get detailed information
        if let Ok(info) = inspect_container(container_name) {
            containers.push(info);
        }
    }

    Ok(containers)
}

/// Inspect a single container to extract service name, status, and ports
fn inspect_container(container_name: &str) -> Result<ContainerInfo, String> {
    let output = silent_command("docker")
        .args(["inspect", container_name])
        .output()
        .map_err(|e| format!("Failed to inspect container: {}", e))?;

    if !output.status.success() {
        return Err("Docker inspect failed".to_string());
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: Vec<Value> = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse Docker inspect JSON: {}", e))?;

    let container = json
        .first()
        .ok_or("No container info returned".to_string())?;

    // Extract labels
    let labels = container["Config"]["Labels"]
        .as_object()
        .ok_or("No labels found")?;

    let service_name = labels
        .get("com.docker.compose.service")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let compose_project = labels
        .get("com.docker.compose.project")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Extract status
    let status = container["State"]["Status"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    // Extract port mappings
    let ports = extract_port_mappings(container)?;

    Ok(ContainerInfo {
        name: container_name.to_string(),
        service_name,
        status,
        ports,
        compose_project,
    })
}

/// Extract port mappings from Docker inspect JSON
fn extract_port_mappings(container: &Value) -> Result<Vec<PortMapping>, String> {
    let mut mappings = Vec::new();

    let ports_obj = match container["NetworkSettings"]["Ports"].as_object() {
        Some(obj) => obj,
        None => return Ok(mappings), // No ports exposed
    };

    for (container_port_proto, host_bindings) in ports_obj {
        // container_port_proto format: "8000/tcp"
        let parts: Vec<&str> = container_port_proto.split('/').collect();
        if parts.len() != 2 {
            continue;
        }

        let container_port = parts[0].parse::<u16>().unwrap_or(0);
        let protocol = parts[1].to_string();

        // host_bindings is an array of {"HostIp": "0.0.0.0", "HostPort": "8240"}
        if let Some(bindings) = host_bindings.as_array() {
            for binding in bindings {
                if let Some(host_port_str) = binding["HostPort"].as_str() {
                    if let Ok(host_port) = host_port_str.parse::<u16>() {
                        mappings.push(PortMapping {
                            host_port,
                            container_port,
                            protocol: protocol.clone(),
                        });
                    }
                }
            }
        }
    }

    Ok(mappings)
}

/// Discover infrastructure containers using compose project label
pub fn discover_infrastructure_containers(
    config: &LauncherConfig,
) -> Result<Vec<InfraService>, String> {
    let output = silent_command("docker")
        .args([
            "ps",
            "-a",
            "--filter",
            &format!(
                "label=com.docker.compose.project={}",
                config.infrastructure.project_name
            ),
            "--format",
            "{{.Names}}",
        ])
        .output()
        .map_err(|e| format!("Failed to query Docker: {}", e))?;

    if !output.status.success() {
        return Ok(Vec::new()); // Infrastructure not running
    }

    let container_names = String::from_utf8_lossy(&output.stdout);
    let mut services = Vec::new();

    for container_name in container_names.lines() {
        if container_name.trim().is_empty() {
            continue;
        }

        if let Ok(info) = inspect_container(container_name) {
            // Format ports string for display
            let ports_str = if info.ports.is_empty() {
                None
            } else {
                Some(
                    info.ports
                        .iter()
                        .map(|p| format!("{}:{}", p.host_port, p.container_port))
                        .collect::<Vec<_>>()
                        .join(", "),
                )
            };

            services.push(InfraService {
                name: info.service_name.clone(),
                display_name: capitalize(&info.service_name),
                running: info.status == "running",
                ports: ports_str,
            });
        }
    }

    Ok(services)
}

/// Capitalize first letter of a string
fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().chain(chars).collect(),
    }
}

/// Determine environment status from container list
pub fn determine_environment_status(containers: &[ContainerInfo]) -> EnvironmentStatus {
    if containers.is_empty() {
        return EnvironmentStatus::Available;
    }

    let running_count = containers.iter().filter(|c| c.status == "running").count();

    if running_count == containers.len() {
        EnvironmentStatus::Running
    } else if running_count > 0 {
        EnvironmentStatus::Partial
    } else {
        EnvironmentStatus::Stopped
    }
}

/// Find the primary service port from container list
pub fn get_primary_service_port(
    containers: &[ContainerInfo],
    primary_service_name: &str,
) -> Option<u16> {
    containers
        .iter()
        .find(|c| c.service_name == primary_service_name)
        .and_then(|c| c.ports.first())
        .map(|p| p.host_port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capitalize() {
        assert_eq!(capitalize("mongo"), "Mongo");
        assert_eq!(capitalize("redis"), "Redis");
        assert_eq!(capitalize(""), "");
    }

    #[test]
    fn test_determine_status() {
        let running_containers = vec![
            ContainerInfo {
                name: "test-backend".to_string(),
                service_name: "backend".to_string(),
                status: "running".to_string(),
                ports: vec![],
                compose_project: "test".to_string(),
            },
            ContainerInfo {
                name: "test-webui".to_string(),
                service_name: "webui".to_string(),
                status: "running".to_string(),
                ports: vec![],
                compose_project: "test".to_string(),
            },
        ];

        assert_eq!(
            determine_environment_status(&running_containers),
            EnvironmentStatus::Running
        );

        let mut partial_containers = running_containers.clone();
        partial_containers[1].status = "exited".to_string();

        assert_eq!(
            determine_environment_status(&partial_containers),
            EnvironmentStatus::Partial
        );

        assert_eq!(
            determine_environment_status(&[]),
            EnvironmentStatus::Available
        );
    }
}
