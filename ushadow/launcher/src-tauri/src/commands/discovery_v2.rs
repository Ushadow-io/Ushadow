use crate::config::LauncherConfig;
use crate::models::{DiscoveryResult, EnvironmentStatus, UshadowEnvironment, WorktreeInfo};
use super::container_discovery::{
    discover_environment_containers, discover_infrastructure_containers,
    determine_environment_status, get_primary_service_port,
};
use super::prerequisites::{check_docker, check_tailscale};
use super::worktree::{list_worktrees, get_colors_for_name};
use std::collections::HashMap;
use tauri::State;
use super::docker::AppState;

/// Discover environments using config-based Docker Compose labels
#[tauri::command]
pub async fn discover_environments_v2(
    main_repo: Option<String>,
    state: State<'_, AppState>,
) -> Result<DiscoveryResult, String> {
    // Check prerequisites
    let (docker_installed, docker_running, _) = check_docker();
    let (tailscale_installed, tailscale_connected, _) = check_tailscale();

    let docker_ok = docker_installed && docker_running;
    let tailscale_ok = tailscale_installed && tailscale_connected;

    // Get config from state
    let config_lock = state.config.lock().map_err(|e| e.to_string())?;
    let config = match config_lock.as_ref() {
        Some(cfg) => cfg.clone(),
        None => {
            // Fallback: If no config loaded, try to load from project root
            drop(config_lock);
            let project_root_lock = state.project_root.lock().map_err(|e| e.to_string())?;
            let project_root = project_root_lock.as_ref().ok_or("No project root set")?;

            let loaded_config = LauncherConfig::load(&std::path::PathBuf::from(project_root))?;

            // Store it for future use
            drop(project_root_lock);
            let mut config_lock_mut = state.config.lock().map_err(|e| e.to_string())?;
            *config_lock_mut = Some(loaded_config.clone());

            loaded_config
        }
    };

    // Get project root for worktree listing
    let project_root_lock = state.project_root.lock().map_err(|e| e.to_string())?;
    let main_repo = if let Some(repo) = main_repo {
        repo
    } else if let Some(root) = project_root_lock.as_ref() {
        root.clone()
    } else {
        // Default fallback
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        format!("{}/repos/ushadow", home)
    };
    drop(project_root_lock);

    // Get worktrees (source of truth for environments)
    let worktrees = match list_worktrees(main_repo.clone()).await {
        Ok(wt) => {
            eprintln!("[discovery_v2] Found {} worktrees from {}", wt.len(), main_repo);
            wt
        }
        Err(e) => {
            eprintln!("[discovery_v2] Failed to list worktrees: {}", main_repo, e);
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

        // TODO: Implement webui port calculation
        // Currently hardcoded as backend - 5000, but this should come from:
        // 1. Docker port mapping for the webui service
        // 2. Or a config setting for port relationships
        let webui_port = backend_port.and_then(|p| if p >= 5000 { Some(p - 5000) } else { None });

        // Build localhost URL
        let localhost_url = if status == EnvironmentStatus::Running {
            webui_port.or(backend_port).map(|p| format!("http://localhost:{}", p))
        } else {
            None
        };

        // TODO: Implement Tailscale URL discovery
        // This requires querying the health endpoint: config.containers.health_endpoint
        // at http://localhost:{backend_port}{health_endpoint}
        let tailscale_url = None;
        let tailscale_active = false;

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
