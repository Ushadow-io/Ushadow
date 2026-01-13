/**
 * UNode Storage Utility
 *
 * Manages multiple UNode connections with persistence.
 * Allows switching between different leader nodes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const UNODES_KEY = '@ushadow_unodes';
const ACTIVE_UNODE_KEY = '@ushadow_active_unode';

export interface UNode {
  id: string;
  name: string;
  apiUrl: string;
  chronicleApiUrl?: string;  // Chronicle/OMI backend API URL (different port)
  streamUrl: string;
  tailscaleIp?: string;
  addedAt: string;
  lastConnectedAt?: string;
  authToken?: string;
}

export interface StreamUrlConfig {
  protocol: 'ws' | 'wss';
  host: string;
  path: string;
}

/**
 * Generate a unique ID for a UNode
 */
function generateUnodeId(): string {
  return `unode-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse stream URL into configurable parts
 */
export function parseStreamUrl(url: string): StreamUrlConfig {
  try {
    const match = url.match(/^(wss?):\/\/([^\/]+)(\/.*)?$/);
    if (match) {
      return {
        protocol: match[1] as 'ws' | 'wss',
        host: match[2],
        path: match[3] || '/chronicle/ws_pcm',
      };
    }
  } catch (e) {
    console.error('[UnodeStorage] Failed to parse stream URL:', e);
  }
  return {
    protocol: 'wss',
    host: url,
    path: '/chronicle/ws_pcm',
  };
}

/**
 * Build stream URL from parts
 */
export function buildStreamUrl(config: StreamUrlConfig): string {
  return `${config.protocol}://${config.host}${config.path}`;
}

/**
 * Get all saved UNodes
 */
export async function getUnodes(): Promise<UNode[]> {
  try {
    const stored = await AsyncStorage.getItem(UNODES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[UnodeStorage] Failed to get unodes:', error);
  }
  return [];
}

/**
 * Save a new UNode or update existing
 */
export async function saveUnode(unode: Omit<UNode, 'id' | 'addedAt'> & { id?: string }): Promise<UNode> {
  try {
    const unodes = await getUnodes();

    // Check if UNode with same API URL already exists
    const existingIndex = unodes.findIndex(u => u.apiUrl === unode.apiUrl);

    const now = new Date().toISOString();
    const savedUnode: UNode = {
      ...unode,
      id: unode.id || generateUnodeId(),
      addedAt: existingIndex >= 0 ? unodes[existingIndex].addedAt : now,
      lastConnectedAt: now,
    };

    if (existingIndex >= 0) {
      unodes[existingIndex] = savedUnode;
    } else {
      unodes.unshift(savedUnode);
    }

    await AsyncStorage.setItem(UNODES_KEY, JSON.stringify(unodes));
    console.log('[UnodeStorage] Saved unode:', savedUnode.name);

    return savedUnode;
  } catch (error) {
    console.error('[UnodeStorage] Failed to save unode:', error);
    throw error;
  }
}

/**
 * Remove a UNode
 */
export async function removeUnode(id: string): Promise<void> {
  try {
    const unodes = await getUnodes();
    const filtered = unodes.filter(u => u.id !== id);
    await AsyncStorage.setItem(UNODES_KEY, JSON.stringify(filtered));

    // Clear active if removed
    const activeId = await getActiveUnodeId();
    if (activeId === id) {
      await AsyncStorage.removeItem(ACTIVE_UNODE_KEY);
    }

    console.log('[UnodeStorage] Removed unode:', id);
  } catch (error) {
    console.error('[UnodeStorage] Failed to remove unode:', error);
    throw error;
  }
}

/**
 * Get the active UNode ID
 */
export async function getActiveUnodeId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_UNODE_KEY);
  } catch (error) {
    console.error('[UnodeStorage] Failed to get active unode:', error);
    return null;
  }
}

/**
 * Set the active UNode
 */
export async function setActiveUnode(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_UNODE_KEY, id);

    // Update last connected time (skip for demo UNode since it's not in storage)
    if (id !== 'demo-unode-001') {
      const unodes = await getUnodes();
      const index = unodes.findIndex(u => u.id === id);
      if (index >= 0) {
        unodes[index].lastConnectedAt = new Date().toISOString();
        await AsyncStorage.setItem(UNODES_KEY, JSON.stringify(unodes));
      }
    }

    console.log('[UnodeStorage] Set active unode:', id);
  } catch (error) {
    console.error('[UnodeStorage] Failed to set active unode:', error);
    throw error;
  }
}

/**
 * Get the active UNode
 *
 * Note: For demo UNode, returns the DEMO_UNODE object from mockData
 * without checking storage, since it's never saved there.
 */
export async function getActiveUnode(): Promise<UNode | null> {
  try {
    const activeId = await getActiveUnodeId();
    if (!activeId) return null;

    // For demo UNode, return DEMO_UNODE from mockData if in demo mode
    if (activeId === 'demo-unode-001') {
      const { isDemoMode } = await import('./demoModeStorage');
      const { DEMO_UNODE } = await import('./mockData');
      const inDemoMode = await isDemoMode();

      if (inDemoMode) {
        console.log('[UnodeStorage] Returning demo UNode object');
        return DEMO_UNODE as UNode;
      } else {
        console.log('[UnodeStorage] Demo UNode ID set but not in demo mode - returning null');
        return null;
      }
    }

    const unodes = await getUnodes();
    return unodes.find(u => u.id === activeId) || null;
  } catch (error) {
    console.error('[UnodeStorage] Failed to get active unode:', error);
    return null;
  }
}

/**
 * Update UNode's auth token
 */
export async function updateUnodeToken(id: string, token: string): Promise<void> {
  try {
    const unodes = await getUnodes();
    const index = unodes.findIndex(u => u.id === id);
    if (index >= 0) {
      unodes[index].authToken = token;
      await AsyncStorage.setItem(UNODES_KEY, JSON.stringify(unodes));
      console.log('[UnodeStorage] Updated token for unode:', id);
    }
  } catch (error) {
    console.error('[UnodeStorage] Failed to update token:', error);
    throw error;
  }
}

/**
 * Update UNode's stream URL path (keeps host, updates path)
 */
export async function updateUnodeStreamPath(id: string, newPath: string): Promise<void> {
  try {
    const unodes = await getUnodes();
    const index = unodes.findIndex(u => u.id === id);
    if (index >= 0) {
      const config = parseStreamUrl(unodes[index].streamUrl);
      config.path = newPath;
      unodes[index].streamUrl = buildStreamUrl(config);
      await AsyncStorage.setItem(UNODES_KEY, JSON.stringify(unodes));
      console.log('[UnodeStorage] Updated stream path for unode:', id, 'to:', unodes[index].streamUrl);
    }
  } catch (error) {
    console.error('[UnodeStorage] Failed to update stream path:', error);
    throw error;
  }
}

/**
 * Update UNode's full stream URL config (protocol, host, path)
 */
export async function updateUnodeStreamConfig(
  id: string,
  updates: Partial<StreamUrlConfig>
): Promise<void> {
  try {
    const unodes = await getUnodes();
    const index = unodes.findIndex(u => u.id === id);
    if (index >= 0) {
      const config = parseStreamUrl(unodes[index].streamUrl);
      // Apply updates
      if (updates.protocol) config.protocol = updates.protocol;
      if (updates.host) config.host = updates.host;
      if (updates.path) config.path = updates.path;
      unodes[index].streamUrl = buildStreamUrl(config);
      await AsyncStorage.setItem(UNODES_KEY, JSON.stringify(unodes));
      console.log('[UnodeStorage] Updated stream config for unode:', id, 'to:', unodes[index].streamUrl);
    }
  } catch (error) {
    console.error('[UnodeStorage] Failed to update stream config:', error);
    throw error;
  }
}

/**
 * Update UNode's API URLs
 */
export async function updateUnodeUrls(
  id: string,
  updates: { apiUrl?: string; chronicleApiUrl?: string }
): Promise<void> {
  try {
    const unodes = await getUnodes();
    const index = unodes.findIndex(u => u.id === id);
    if (index >= 0) {
      if (updates.apiUrl !== undefined) {
        unodes[index].apiUrl = updates.apiUrl;
      }
      if (updates.chronicleApiUrl !== undefined) {
        unodes[index].chronicleApiUrl = updates.chronicleApiUrl;
      }
      await AsyncStorage.setItem(UNODES_KEY, JSON.stringify(unodes));
      console.log('[UnodeStorage] Updated URLs for unode:', id);
    }
  } catch (error) {
    console.error('[UnodeStorage] Failed to update URLs:', error);
    throw error;
  }
}
