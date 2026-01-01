/**
 * Network and connection types for Ushadow mobile
 */

/**
 * Leader node capabilities
 */
export interface LeaderCapabilities {
  can_run_docker: boolean;
  can_run_gpu: boolean;
  can_become_leader: boolean;
  available_memory_mb: number;
  available_cpu_cores: number;
  available_disk_gb: number;
}

/**
 * Basic connection info - what we get from QR code
 */
export interface LeaderConnection {
  hostname: string;
  tailscaleIp: string;
  port: number;
  apiUrl: string;
}

/**
 * Service deployed on a unode
 */
export interface ServiceDeployment {
  name: string;
  display_name: string;
  status: string;
  unode_hostname: string;
}

/**
 * Full leader info - fetched from /api/unodes/leader/info after connection
 */
export interface LeaderInfo {
  hostname: string;
  tailscale_ip: string;
  capabilities: LeaderCapabilities;
  api_port: number;
  ws_pcm_url: string;
  ws_omi_url: string;
  unodes: UNode[];
  services: ServiceDeployment[];
}

/**
 * Combined discovered leader (connection + info)
 */
export interface DiscoveredLeader {
  hostname: string;
  tailscaleIp: string;
  apiUrl: string;
  streamUrl: string;  // Kept for backwards compatibility
  wsPcmUrl: string;   // WebSocket URL for PCM audio streaming
  wsOmiUrl: string;   // WebSocket URL for OMI format streaming
  role: 'leader';
  capabilities?: LeaderCapabilities;
  // Full leader info (fetched separately)
  leaderInfo?: LeaderInfo;
}

export interface UNode {
  id: string;
  hostname: string;
  tailscale_ip: string;
  status: 'online' | 'offline' | 'unknown';
  role: 'leader' | 'worker';
  platform: string;
  last_seen?: string;
  capabilities?: LeaderCapabilities;
  services?: string[];
  manager_version?: string;
}

export interface DiscoveryResult {
  success: boolean;
  leader: DiscoveredLeader | null;
  unodes: UNode[];
  error?: string;
}

export interface SavedLeaderConfig {
  hostname: string;
  tailscaleIp: string;
  port: number;
  lastConnected: number;
}
