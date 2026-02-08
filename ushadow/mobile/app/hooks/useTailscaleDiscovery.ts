/**
 * Tailscale Discovery Hook
 *
 * Connects to the Ushadow leader via QR code or manual IP entry.
 * Primary method: QR code from web dashboard
 * Fallback: Manual IP entry or reconnect to saved leader
 *
 * Flow:
 * 1. Scan QR code → get minimal connection info (hostname, ip, port)
 * 2. Save connection info → show "Connect" button
 * 3. On connect → probe the leader, then fetch full details from /api/unodes/leader/info
 */

import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DiscoveredLeader,
  DiscoveryResult,
  SavedLeaderConfig,
  LeaderCapabilities,
  LeaderInfo,
} from '../types/network';

const SAVED_LEADER_KEY = 'USHADOW_LEADER_CONFIG';

// Port for leader backend (default)
const LEADER_PORT = 8000;
// Timeout for probes (ms)
const PROBE_TIMEOUT = 3000;
// Timeout for fetching leader info (ms)
const LEADER_INFO_TIMEOUT = 5000;

/**
 * QR code data structure from web dashboard (v2 - minimal)
 * Full details are fetched from /api/unodes/leader/info after connection
 */
export interface UshadowConnectionData {
  type: 'ushadow-connect';
  v: number;
  hostname: string;
  ip: string;
  port: number;
  api_url: string;  // Full URL to leader info endpoint
}

/**
 * Saved server config (minimal - from QR code)
 */
export interface SavedServerConfig extends SavedLeaderConfig {
  // Full API URL from QR code (https://hostname/api/unodes/leader/info)
  apiUrl?: string;
  // Leader info is fetched separately and cached
  leaderInfo?: LeaderInfo;
}

interface UseDiscoveryResult {
  // State
  isOnTailscale: boolean | null;
  leader: DiscoveredLeader | null;
  leaderInfo: LeaderInfo | null;  // Full leader details from API
  error: string | null;
  savedLeader: SavedLeaderConfig | null;
  scannedServer: SavedServerConfig | null;  // Server from QR (may not be connected yet)
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'failed';

  // Actions
  saveFromQR: (data: UshadowConnectionData) => Promise<void>;  // Save without probing
  connectFromQR: (data: UshadowConnectionData) => Promise<DiscoveryResult>;
  connectToLeader: (ip: string, port?: number) => Promise<DiscoveryResult>;
  connectToEndpoint: (endpoint: string) => Promise<DiscoveryResult>;  // Connect using hostname or ip:port
  connectToScanned: () => Promise<DiscoveryResult>;  // Connect to scanned server
  fetchLeaderInfo: () => Promise<LeaderInfo | null>;  // Fetch full details from API
  clearSaved: () => Promise<void>;
  setError: (error: string | null) => void;
}

/**
 * Check if an IP is in the Tailscale CGNAT range (100.64.0.0/10)
 */
const isTailscaleIp = (ip: string): boolean => {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const first = parseInt(parts[0], 10);
  const second = parseInt(parts[1], 10);
  return first === 100 && second >= 64 && second <= 127;
};

/**
 * Probe for leader backend at the given IP
 */
const probeLeader = async (
  ip: string,
  port: number = LEADER_PORT
): Promise<{ reachable: boolean; hostname?: string }> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT);

    // Use HTTPS for Tailscale hostnames (.ts.net), HTTP for IP addresses
    const protocol = ip.includes('.ts.net') ? 'https' : 'http';
    const portSuffix = protocol === 'https' ? '' : `:${port}`;
    const url = `${protocol}://${ip}${portSuffix}/health`;

    console.log(`[Discovery] Probing leader at: ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      try {
        const data = await response.json();
        return { reachable: true, hostname: data.hostname };
      } catch {
        return { reachable: true };
      }
    }
    return { reachable: false };
  } catch (e) {
    console.log(`[Discovery] Probe failed for ${ip}:${port}:`, e);
    return { reachable: false };
  }
};

/**
 * Fetch full leader info from the API
 * @param urlOrIp - Either a full URL (https://...) or just the IP address or hostname
 * @param port - Port number (only used if urlOrIp is an IP)
 */
const fetchLeaderInfoFromApi = async (
  urlOrIp: string,
  port: number = LEADER_PORT
): Promise<LeaderInfo | null> => {
  // Use URL directly if provided, otherwise construct from IP/hostname:port
  let url: string;
  if (urlOrIp.startsWith('http')) {
    url = urlOrIp;
  } else {
    // Use HTTPS for Tailscale hostnames (.ts.net), HTTP for IP addresses
    const protocol = urlOrIp.includes('.ts.net') ? 'https' : 'http';
    const portSuffix = protocol === 'https' ? '' : `:${port}`;
    url = `${protocol}://${urlOrIp}${portSuffix}/api/unodes/leader/info`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LEADER_INFO_TIMEOUT);

    console.log('[Discovery] Fetching leader info from:', url);
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      console.log('[Discovery] Fetched leader info:', data.hostname);
      return data as LeaderInfo;
    }
    console.log(`[Discovery] Failed to fetch leader info: ${response.status}`);
    return null;
  } catch (e) {
    console.log(`[Discovery] Error fetching leader info from ${url}:`, e);
    return null;
  }
};

const SCANNED_SERVER_KEY = 'USHADOW_SCANNED_SERVER';

/**
 * Helper to construct base API URL with correct protocol
 */
const buildApiUrl = (hostOrIp: string, port: number = LEADER_PORT): string => {
  const protocol = hostOrIp.includes('.ts.net') ? 'https' : 'http';
  const portSuffix = protocol === 'https' ? '' : `:${port}`;
  return `${protocol}://${hostOrIp}${portSuffix}`;
};

/**
 * Helper to construct WebSocket URL with correct protocol
 */
const buildWsUrl = (hostOrIp: string, port: number = LEADER_PORT, path: string = '/ws_pcm'): string => {
  const protocol = hostOrIp.includes('.ts.net') ? 'wss' : 'ws';
  const portSuffix = protocol === 'wss' ? '' : `:${port}`;
  return `${protocol}://${hostOrIp}${portSuffix}${path}`;
};

export const useTailscaleDiscovery = (): UseDiscoveryResult => {
  const [isOnTailscale, setIsOnTailscale] = useState<boolean | null>(null);
  const [leader, setLeader] = useState<DiscoveredLeader | null>(null);
  const [leaderInfo, setLeaderInfo] = useState<LeaderInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedLeader, setSavedLeader] = useState<SavedLeaderConfig | null>(null);
  const [scannedServer, setScannedServer] = useState<SavedServerConfig | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');

  // Load saved config on mount
  useEffect(() => {
    const loadSaved = async () => {
      try {
        // Load saved leader config
        const leaderJson = await AsyncStorage.getItem(SAVED_LEADER_KEY);
        if (leaderJson) {
          const saved = JSON.parse(leaderJson);
          setSavedLeader(saved);

          // Check if saved leader is reachable to determine Tailscale status
          console.log('[Discovery] Checking saved leader:', saved.tailscaleIp);
          const result = await probeLeader(saved.tailscaleIp, saved.port);
          setIsOnTailscale(result.reachable);

          if (result.reachable) {
            console.log('[Discovery] Saved leader is reachable');
          } else {
            console.log('[Discovery] Saved leader not reachable');
          }
        }

        // Load scanned server config (from QR)
        const scannedJson = await AsyncStorage.getItem(SCANNED_SERVER_KEY);
        if (scannedJson) {
          const scanned = JSON.parse(scannedJson);
          setScannedServer(scanned);
          console.log('[Discovery] Loaded scanned server:', scanned.hostname);
        }
      } catch (e) {
        console.error('[Discovery] Error loading saved config:', e);
      }
    };
    loadSaved();
  }, []);

  /**
   * Save QR code data without attempting to connect
   * This allows showing server details immediately after scanning
   */
  const saveFromQR = useCallback(
    async (data: UshadowConnectionData): Promise<void> => {
      console.log('[Discovery] Saving from QR:', data);
      setError(null);

      // Validate the data
      if (!data.ip || !data.port) {
        setError('Invalid QR code: missing connection details');
        return;
      }

      // Check if it's a valid Tailscale IP
      if (!isTailscaleIp(data.ip)) {
        setError(`Invalid Tailscale IP: ${data.ip}. Expected 100.64.x.x - 100.127.x.x`);
        return;
      }

      // Save minimal scanned server config (full details fetched after connection)
      const serverConfig: SavedServerConfig = {
        hostname: data.hostname || 'leader',
        tailscaleIp: data.ip,
        port: data.port,
        lastConnected: 0,  // Not connected yet
      };

      await AsyncStorage.setItem(SCANNED_SERVER_KEY, JSON.stringify(serverConfig));
      setScannedServer(serverConfig);
      setConnectionStatus('idle');

      console.log('[Discovery] Saved scanned server:', serverConfig.hostname);
    },
    []
  );

  /**
   * Connect to the previously scanned server and fetch full details
   */
  const connectToScanned = useCallback(
    async (): Promise<DiscoveryResult> => {
      if (!scannedServer) {
        const errorMsg = 'No scanned server to connect to';
        setError(errorMsg);
        return { success: false, leader: null, unodes: [], error: errorMsg };
      }

      console.log('[Discovery] Connecting to scanned server:', scannedServer.hostname);
      setError(null);
      setConnectionStatus('connecting');

      // Fetch leader info directly (no separate probe needed)
      const info = await fetchLeaderInfoFromApi(
        scannedServer.apiUrl || scannedServer.tailscaleIp,
        scannedServer.port
      );

      if (info) {
        // Build DiscoveredLeader with info from API
        // Use HTTPS URL from QR code if available, otherwise construct with correct protocol
        // Extract base URL by removing any /api/... path
        const baseApiUrl = scannedServer.apiUrl
          ? scannedServer.apiUrl.replace(/\/api\/.*$/, '')
          : buildApiUrl(scannedServer.tailscaleIp, scannedServer.port);
        const discoveredLeader: DiscoveredLeader = {
          hostname: info.hostname || scannedServer.hostname,
          tailscaleIp: info?.tailscale_ip || scannedServer.tailscaleIp,
          apiUrl: baseApiUrl,
          chronicleApiUrl: info?.chronicle_api_url,
          streamUrl: info?.ws_pcm_url || buildWsUrl(scannedServer.tailscaleIp, scannedServer.port, '/ws_pcm'),
          wsPcmUrl: info?.ws_pcm_url || buildWsUrl(scannedServer.tailscaleIp, scannedServer.port, '/ws_pcm'),
          wsOmiUrl: info?.ws_omi_url || buildWsUrl(scannedServer.tailscaleIp, scannedServer.port, '/ws_omi'),
          role: 'leader',
          capabilities: info?.capabilities,
          leaderInfo: info || undefined,
        };

        // Update saved config with connection timestamp and leader info
        const updatedConfig: SavedServerConfig = {
          ...scannedServer,
          lastConnected: Date.now(),
          leaderInfo: info || undefined,
        };
        await AsyncStorage.setItem(SCANNED_SERVER_KEY, JSON.stringify(updatedConfig));
        await AsyncStorage.setItem(SAVED_LEADER_KEY, JSON.stringify(updatedConfig));

        setScannedServer(updatedConfig);
        setSavedLeader(updatedConfig);
        setLeader(discoveredLeader);
        setLeaderInfo(info);
        setIsOnTailscale(true);
        setConnectionStatus('connected');

        console.log('[Discovery] Connected to scanned server:', discoveredLeader.hostname);
        return { success: true, leader: discoveredLeader, unodes: info?.unodes || [] };
      }

      setConnectionStatus('failed');
      const errorMsg = `Could not connect to ${scannedServer.hostname}. Make sure you're connected to Tailscale.`;
      setError(errorMsg);
      return { success: false, leader: null, unodes: [], error: errorMsg };
    },
    [scannedServer]
  );

  /**
   * Connect using QR code data from web dashboard
   * (Saves and connects in one step, then fetches full details)
   */
  const connectFromQR = useCallback(
    async (data: UshadowConnectionData): Promise<DiscoveryResult> => {
      console.log('[Discovery] Connecting from QR:', data);
      setError(null);
      setConnectionStatus('connecting');

      // Validate the data
      if (!data.ip || !data.port) {
        const errorMsg = 'Invalid QR code: missing connection details';
        setError(errorMsg);
        setConnectionStatus('failed');
        return { success: false, leader: null, unodes: [], error: errorMsg };
      }

      // Check if it's a valid Tailscale IP
      if (!isTailscaleIp(data.ip)) {
        const errorMsg = `Invalid Tailscale IP: ${data.ip}. Expected 100.64.x.x - 100.127.x.x`;
        setError(errorMsg);
        setConnectionStatus('failed');
        return { success: false, leader: null, unodes: [], error: errorMsg };
      }

      // Save minimal server config first (including api_url from QR)
      const serverConfig: SavedServerConfig = {
        hostname: data.hostname || 'leader',
        tailscaleIp: data.ip,
        port: data.port,
        apiUrl: data.api_url,
        lastConnected: 0,
      };
      await AsyncStorage.setItem(SCANNED_SERVER_KEY, JSON.stringify(serverConfig));
      setScannedServer(serverConfig);

      // Fetch leader info directly from api_url (no separate probe needed)
      const info = await fetchLeaderInfoFromApi(data.api_url || data.ip, data.port);

      if (info) {

        // Build DiscoveredLeader with info from API (or defaults)
        // Use HTTPS URL from QR code, falling back to constructed URL with correct protocol
        // Extract base URL by removing any /api/... path
        const baseApiUrl = data.api_url
          ? data.api_url.replace(/\/api\/.*$/, '')
          : buildApiUrl(data.ip, data.port);
        const discoveredLeader: DiscoveredLeader = {
          hostname: info.hostname || data.hostname || 'leader',
          tailscaleIp: info?.tailscale_ip || data.ip,
          apiUrl: baseApiUrl,
          chronicleApiUrl: info?.chronicle_api_url,
          streamUrl: info?.ws_pcm_url || buildWsUrl(data.ip, data.port, '/ws_pcm'),
          wsPcmUrl: info?.ws_pcm_url || buildWsUrl(data.ip, data.port, '/ws_pcm'),
          wsOmiUrl: info?.ws_omi_url || buildWsUrl(data.ip, data.port, '/ws_omi'),
          role: 'leader',
          capabilities: info?.capabilities,
          leaderInfo: info || undefined,
        };

        // Save for quick reconnection
        const config: SavedServerConfig = {
          hostname: discoveredLeader.hostname,
          tailscaleIp: data.ip,
          port: data.port,
          lastConnected: Date.now(),
          leaderInfo: info || undefined,
        };
        await AsyncStorage.setItem(SAVED_LEADER_KEY, JSON.stringify(config));
        setSavedLeader(config);
        setLeader(discoveredLeader);
        setLeaderInfo(info);
        setIsOnTailscale(true);
        setConnectionStatus('connected');

        console.log('[Discovery] Connected to leader:', discoveredLeader.hostname);
        return { success: true, leader: discoveredLeader, unodes: info?.unodes || [] };
      }

      // Connection failed, but server is saved
      setConnectionStatus('failed');
      const errorMsg = `Server saved! Could not connect yet - make sure you're on Tailscale.`;
      setError(errorMsg);
      return { success: false, leader: null, unodes: [], error: errorMsg };
    },
    []
  );

  /**
   * Parse an endpoint string into host and port
   * Supports: hostname, hostname:port, ip, ip:port
   */
  const parseEndpoint = (endpoint: string): { host: string; port: number } => {
    const trimmed = endpoint.trim();

    // Check if it contains a port (look for last colon, handle IPv6 edge cases)
    const lastColonIndex = trimmed.lastIndexOf(':');

    if (lastColonIndex > 0) {
      const potentialPort = trimmed.slice(lastColonIndex + 1);
      const portNum = parseInt(potentialPort, 10);

      // If it's a valid port number, split host:port
      if (!isNaN(portNum) && portNum > 0 && portNum <= 65535) {
        return {
          host: trimmed.slice(0, lastColonIndex),
          port: portNum,
        };
      }
    }

    // No port specified, use default
    return { host: trimmed, port: LEADER_PORT };
  };

  /**
   * Connect using an endpoint string (hostname or ip, with optional port)
   * Supports Tailscale MagicDNS names like "my-leader.tailnet.ts.net"
   */
  const connectToEndpoint = useCallback(
    async (endpoint: string): Promise<DiscoveryResult> => {
      const { host, port } = parseEndpoint(endpoint);
      console.log('[Discovery] Connecting to endpoint:', { host, port, original: endpoint });
      setError(null);
      setConnectionStatus('connecting');

      // Probe the leader at this endpoint
      const result = await probeLeader(host, port);

      if (result.reachable) {
        // Fetch full leader info from API
        const info = await fetchLeaderInfoFromApi(host, port);

        const discoveredLeader: DiscoveredLeader = {
          hostname: info?.hostname || result.hostname || host,
          tailscaleIp: info?.tailscale_ip || host,
          apiUrl: buildApiUrl(host, port),
          chronicleApiUrl: info?.chronicle_api_url,
          streamUrl: info?.ws_pcm_url || buildWsUrl(host, port, '/ws_pcm'),
          wsPcmUrl: info?.ws_pcm_url || buildWsUrl(host, port, '/ws_pcm'),
          wsOmiUrl: info?.ws_omi_url || buildWsUrl(host, port, '/ws_omi'),
          role: 'leader',
          capabilities: info?.capabilities,
          leaderInfo: info || undefined,
        };

        const config: SavedServerConfig = {
          hostname: discoveredLeader.hostname,
          tailscaleIp: host,
          port,
          lastConnected: Date.now(),
          leaderInfo: info || undefined,
        };
        await AsyncStorage.setItem(SAVED_LEADER_KEY, JSON.stringify(config));
        await AsyncStorage.setItem(SCANNED_SERVER_KEY, JSON.stringify(config));

        setSavedLeader(config);
        setScannedServer(config);
        setLeader(discoveredLeader);
        setLeaderInfo(info);
        setIsOnTailscale(true);
        setConnectionStatus('connected');

        console.log('[Discovery] Connected to endpoint:', discoveredLeader.hostname);
        return { success: true, leader: discoveredLeader, unodes: info?.unodes || [] };
      }

      setConnectionStatus('failed');
      const errorMsg = `Could not connect to ${host}:${port}. Check the address and ensure you're connected to Tailscale.`;
      setError(errorMsg);
      return { success: false, leader: null, unodes: [], error: errorMsg };
    },
    []
  );

  /**
   * Connect directly to a leader by IP (also fetches full details)
   */
  const connectToLeader = useCallback(
    async (ip: string, port: number = LEADER_PORT): Promise<DiscoveryResult> => {
      console.log('[Discovery] Connecting to:', ip, port);
      setError(null);

      const result = await probeLeader(ip, port);

      if (result.reachable) {
        // Fetch full leader info from API
        const info = await fetchLeaderInfoFromApi(ip, port);

        const discoveredLeader: DiscoveredLeader = {
          hostname: info?.hostname || result.hostname || 'leader',
          tailscaleIp: info?.tailscale_ip || ip,
          apiUrl: buildApiUrl(ip, port),
          chronicleApiUrl: info?.chronicle_api_url,
          streamUrl: info?.ws_pcm_url || buildWsUrl(ip, port, '/ws_pcm'),
          wsPcmUrl: info?.ws_pcm_url || buildWsUrl(ip, port, '/ws_pcm'),
          wsOmiUrl: info?.ws_omi_url || buildWsUrl(ip, port, '/ws_omi'),
          role: 'leader',
          capabilities: info?.capabilities,
          leaderInfo: info || undefined,
        };

        const config: SavedServerConfig = {
          hostname: discoveredLeader.hostname,
          tailscaleIp: ip,
          port,
          lastConnected: Date.now(),
          leaderInfo: info || undefined,
        };
        await AsyncStorage.setItem(SAVED_LEADER_KEY, JSON.stringify(config));
        setSavedLeader(config);
        setLeader(discoveredLeader);
        setLeaderInfo(info);
        setIsOnTailscale(true);

        return { success: true, leader: discoveredLeader, unodes: info?.unodes || [] };
      }

      const errorMsg = `Could not connect to ${ip}:${port}. Check the IP and ensure Tailscale is connected.`;
      setError(errorMsg);
      return { success: false, leader: null, unodes: [], error: errorMsg };
    },
    []
  );

  /**
   * Fetch/refresh leader info from the API
   */
  const fetchLeaderInfo = useCallback(async (): Promise<LeaderInfo | null> => {
    if (!leader) {
      console.log('[Discovery] No leader connected, cannot fetch info');
      return null;
    }

    // Extract host and port from apiUrl (handles both http:// and https://)
    const urlWithoutProtocol = leader.apiUrl.replace(/^https?:\/\//, '');
    const [host, portStr] = urlWithoutProtocol.split(':');
    const port = parseInt(portStr, 10) || LEADER_PORT;

    const info = await fetchLeaderInfoFromApi(host, port);
    if (info) {
      setLeaderInfo(info);
      // Update leader with new info
      setLeader(prev => prev ? { ...prev, capabilities: info.capabilities, leaderInfo: info } : null);
    }
    return info;
  }, [leader]);

  /**
   * Clear saved connection data
   */
  const clearSaved = useCallback(async () => {
    await AsyncStorage.removeItem(SAVED_LEADER_KEY);
    await AsyncStorage.removeItem(SCANNED_SERVER_KEY);
    setSavedLeader(null);
    setScannedServer(null);
    setLeader(null);
    setLeaderInfo(null);
    setIsOnTailscale(null);
    setConnectionStatus('idle');
    setError(null);
  }, []);

  return {
    isOnTailscale,
    leader,
    leaderInfo,
    error,
    savedLeader,
    scannedServer,
    connectionStatus,
    saveFromQR,
    connectFromQR,
    connectToLeader,
    connectToEndpoint,
    connectToScanned,
    fetchLeaderInfo,
    clearSaved,
    setError,
  };
};

export default useTailscaleDiscovery;
