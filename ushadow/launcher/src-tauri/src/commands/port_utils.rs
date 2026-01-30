use std::process::Command;

/// Port pair for backend and frontend (webui)
#[derive(Debug, Clone)]
pub struct PortPair {
    pub backend: u16,
    pub frontend: u16,
}

/// Find available ports by calling Python's validate_ports from setup_utils.py
/// This uses the existing port validation logic and maintains the 5000 port separation
pub fn find_available_ports(
    project_root: &str,
    preferred_backend_port: u16,
) -> Result<PortPair, String> {
    // Frontend port is always backend - 5000
    let preferred_frontend_port = if preferred_backend_port >= 5000 {
        preferred_backend_port - 5000
    } else {
        return Err(format!(
            "Backend port {} too low (must be >= 5000 to maintain frontend separation)",
            preferred_backend_port
        ));
    };

    // Call Python to check if these ports are available
    // Using the same logic as setup/run.py
    if are_ports_available(project_root, preferred_backend_port, preferred_frontend_port)? {
        return Ok(PortPair {
            backend: preferred_backend_port,
            frontend: preferred_frontend_port,
        });
    }

    // Ports not available, find alternatives by incrementing offset
    // This mirrors the logic in setup/run.py:145-160
    let base_backend = 8000;
    let base_frontend = 3000;
    let initial_offset = preferred_backend_port - base_backend;

    for attempt in 1..=100 {
        let new_offset = initial_offset + (attempt * 10);
        let backend = base_backend + new_offset;
        let frontend = base_frontend + new_offset;

        if are_ports_available(project_root, backend, frontend)? {
            return Ok(PortPair { backend, frontend });
        }
    }

    Err("Could not find available ports after 100 attempts".to_string())
}

/// Check if both backend and frontend ports are available
/// Uses native Rust implementation (faster than calling Python subprocess)
/// This mirrors the logic from setup/setup_utils.py::check_port_in_use
fn are_ports_available(
    _project_root: &str,
    backend_port: u16,
    frontend_port: u16,
) -> Result<bool, String> {
    Ok(is_port_available(backend_port) && is_port_available(frontend_port))
}

/// Check if a single port is available by attempting to bind to it
fn is_port_available(port: u16) -> bool {
    use std::net::TcpListener;

    match TcpListener::bind(("127.0.0.1", port)) {
        Ok(_) => true,  // Port is available
        Err(_) => false, // Port is in use
    }
}

/// Get the Tailscale tailnet name from the host machine
/// Returns the tailnet domain (e.g., "thestumonkey.github")
pub fn get_tailnet_name() -> Result<String, String> {
    let output = Command::new("tailscale")
        .args(["status", "--json"])
        .output()
        .map_err(|e| format!("Failed to run tailscale command: {}", e))?;

    if !output.status.success() {
        return Err("Tailscale not running or not available".to_string());
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse tailscale JSON: {}", e))?;

    let tailnet = json["CurrentTailnet"]["Name"]
        .as_str()
        .ok_or("Could not find tailnet name in status")?;

    Ok(tailnet.to_string())
}

/// Generate Tailscale URL for an environment
/// Format: https://{env_name}.{tailnet} or https://{project}-{env_name}.{tailnet}
///
/// # Arguments
/// * `env_name` - Environment name (e.g., "orange", "blue")
/// * `project_prefix` - Optional project prefix for multi-project setups (e.g., Some("ushadow"))
pub fn generate_tailscale_url(
    env_name: &str,
    project_prefix: Option<&str>,
) -> Result<Option<String>, String> {
    // Get the tailnet name from the host
    let tailnet = match get_tailnet_name() {
        Ok(t) => t,
        Err(_) => return Ok(None), // Tailscale not available, return None instead of error
    };

    // Build hostname: either "envname" or "project-envname"
    let hostname = if let Some(prefix) = project_prefix {
        format!("{}-{}", prefix, env_name)
    } else {
        env_name.to_string()
    };

    let url = format!("https://{}.{}", hostname, tailnet);

    Ok(Some(url))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_port_availability() {
        // Test that port checking works
        // Note: This test might be flaky if ports are actually in use
        let available = is_port_available(65432); // Use high port unlikely to be used
        assert!(available, "High port should be available");
    }

    #[test]
    fn test_port_pair_separation() {
        let pair = PortPair {
            backend: 8000,
            frontend: 3000,
        };

        assert_eq!(pair.backend - pair.frontend, 5000);
    }
}
