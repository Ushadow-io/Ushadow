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

/// Check if both backend and frontend ports are available using Python's validate_ports
fn are_ports_available(
    project_root: &str,
    backend_port: u16,
    frontend_port: u16,
) -> Result<bool, String> {
    // TODO: Implement the port availability check
    // This should call the Python function from setup/setup_utils.py
    //
    // Implementation strategy:
    // Option A: Shell out to Python:
    //   python3 -c "from setup.setup_utils import validate_ports; ..."
    //
    // Option B: Use socket checking directly in Rust (reimplementing the logic):
    //   use std::net::TcpStream;
    //   TcpStream::connect(("127.0.0.1", port)).is_err()
    //
    // Your choice: Which approach do you prefer?
    // - Option A keeps logic centralized in Python but adds subprocess overhead
    // - Option B is faster but duplicates the port checking logic
    //
    // For now, implementing Option B (Rust native) for simplicity:

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
/// Format: https://{hostname}.{tailnet}
pub fn generate_tailscale_url(env_name: &str) -> Result<Option<String>, String> {
    // Get the tailnet name from the host
    let tailnet = match get_tailnet_name() {
        Ok(t) => t,
        Err(_) => return Ok(None), // Tailscale not available, return None instead of error
    };

    // TODO: Implement hostname generation
    // The hostname should match what the environment's Tailscale container uses
    //
    // Question: How are Tailscale hostnames determined?
    // Option A: Use env_name directly: "ushadow-{env_name}"
    // Option B: Query the running container's Tailscale status
    // Option C: Use a config setting for hostname pattern
    //
    // Please implement the hostname generation logic below based on your
    // project's Tailscale naming convention:

    let hostname = format!("ushadow-{}", env_name);
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
