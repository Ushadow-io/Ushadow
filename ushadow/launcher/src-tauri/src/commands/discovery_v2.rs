use crate::config::LauncherConfig;
use crate::models::{DiscoveryResult, EnvironmentStatus, UshadowEnvironment, WorktreeInfo};
use super::container_discovery::{
    discover_environment_containers, discover_infrastructure_containers,
    determine_environment_status, get_primary_service_port,
};
use super::prerequisites::{check_docker, check_tailscale};
use super::worktree::{list_worktrees, get_colors_for_name};
use std::collections::HashMap;

/// Discover environments using config-based Docker Compose labels
/// Note: The project_root parameter is required to load the config
/// The frontend should provide this from the user's project selection
#[tauri::command]
pub async fn discover_environments_v2(
    project_root: String,
    main_repo: Option<String>,
) -> Result<DiscoveryResult, String> {
    // Check prerequisites
    let (docker_installed, docker_running, _) = check_docker();
    let (tailscale_installed, tailscale_connected, _) = check_tailscale();

    let docker_ok = docker_installed && docker_running;
    let tailscale_ok = tailscale_installed && tailscale_connected;

    // Load config from project root
    let config = LauncherConfig::load(&std::path::PathBuf::from(&project_root))?;

    // Use provided main_repo or default to project_root
    let main_repo = main_repo.unwrap_or_else(|| project_root.clone());

    // Get worktrees (source of truth for environments)
    let worktrees = match list_worktrees(main_repo.clone()).await {
        Ok(wt) => {
            eprintln!("[discovery_v2] Found {} worktrees from {}", wt.len(), main_repo);
            wt
        }
        Err(e) => {
            eprintln!("[discovery_v2] Failed to list worktrees from {}: {}", main_repo, e);
            Vec::new()
        }
    };

    // Build worktree map
    let mut worktree_map: HashMap<String, WorktreeInfo> = HashMap::new();
    for wt in worktrees {
        worktree_map.insert(wt.name.clone(), wt);
    }

    // Discover infrastructure
    let infrastructure = if docker_ok {
        discover_infrastructure_containers(&config).unwrap_or_else(|e| {
            eprintln!("[discovery_v2] Infrastructure discovery error: {}", e);
            Vec::new()
        })
    } else {
        Vec::new()
    };

    // Discover environments
    let mut environments = Vec::new();

    for (env_name, wt) in &worktree_map {
        let (primary_color, _) = get_colors_for_name(env_name);

        // Discover containers for this environment using Docker Compose labels
        let containers = if docker_ok {
            discover_environment_containers(&config, env_name).unwrap_or_else(|e| {
                eprintln!("[discovery_v2] Container discovery error for {}: {}", env_name, e);
                Vec::new()
            })
        } else {
            Vec::new()
        };

        // Determine status from containers
        let status = determine_environment_status(&containers);

        // Get primary service port
        let backend_port = get_primary_service_port(&containers, &config.containers.primary_service);

        // Find webui port from containers (look for webui service)
        // Falls back to backend - 5000 if webui service not found
        let webui_port = containers
            .iter()
            .find(|c| c.service_name == "webui" || c.service_name == "frontend")
            .and_then(|c| c.ports.first())
            .map(|p| p.host_port)
            .or_else(|| backend_port.and_then(|p| if p >= 5000 { Some(p - 5000) } else { None }));

        // Build localhost URL (prefer webui port, fallback to backend)
        let localhost_url = if status == EnvironmentStatus::Running {
            webui_port.or(backend_port).map(|p| format!("http://localhost:{}", p))
        } else {
            None
        };

        // Generate Tailscale URL using the host's tailnet
        let tailscale_url = super::port_utils::generate_tailscale_url(
            env_name,
            config.containers.tailscale_project_prefix.as_deref(),
        )
        .unwrap_or(None);

        let tailscale_active = tailscale_url.is_some() && status == EnvironmentStatus::Running;

        // Container names for display
        let container_names: Vec<String> = containers.iter().map(|c| c.name.clone()).collect();

        let running = status == EnvironmentStatus::Running || status == EnvironmentStatus::Partial;

        environments.push(UshadowEnvironment {
            name: env_name.clone(),
            color: primary_color,
            path: Some(wt.path.clone()),
            branch: Some(wt.branch.clone()),
            status,
            running,
            localhost_url,
            tailscale_url,
            backend_port,
            webui_port,
            tailscale_active,
            containers: container_names,
            is_worktree: true,
        });
    }

    Ok(DiscoveryResult {
        infrastructure,
        environments,
        docker_ok,
        tailscale_ok,
    })
}
