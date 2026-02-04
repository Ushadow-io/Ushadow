/**
 * Feature Flag Service
 *
 * API client for fetching and managing feature flags from the backend.
 * Caches flags in AsyncStorage for offline support.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthToken, getApiUrl, getDefaultServerUrl } from '../_utils/authStorage';
import { getActiveUnode } from '../_utils/unodeStorage';

// Storage key for cached feature flags
const STORAGE_KEY = '@ushadow_feature_flags';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Types matching backend feature flag responses
export interface FeatureFlag {
  enabled: boolean;
  description?: string;
  type?: 'release' | 'experiment' | 'ops';
}

export interface FeatureFlagsResponse {
  [key: string]: FeatureFlag;
}

interface CachedFlags {
  flags: FeatureFlagsResponse;
  timestamp: number;
}

/**
 * Get the backend API base URL.
 */
async function getBackendApiUrl(): Promise<string> {
  const activeUnode = await getActiveUnode();

  // First, check if UNode has explicit API URL
  if (activeUnode?.apiUrl) {
    console.log(`[FeatureFlags] Using UNode apiUrl: ${activeUnode.apiUrl}`);
    return activeUnode.apiUrl;
  }

  // Fall back to global storage (legacy)
  const storedUrl = await getApiUrl();
  if (storedUrl) {
    console.log(`[FeatureFlags] Using stored URL: ${storedUrl}`);
    return storedUrl;
  }

  // Default fallback - use configured default server URL
  const defaultUrl = await getDefaultServerUrl();
  console.log(`[FeatureFlags] Using default URL: ${defaultUrl}`);
  return defaultUrl;
}

/**
 * Get the auth token from active UNode or global storage.
 */
async function getToken(): Promise<string | null> {
  // First, try to get token from active UNode
  const activeUnode = await getActiveUnode();
  if (activeUnode?.authToken) {
    return activeUnode.authToken;
  }

  // Fall back to global storage (legacy)
  return getAuthToken();
}

/**
 * Load cached feature flags from AsyncStorage.
 */
async function loadCachedFlags(): Promise<FeatureFlagsResponse | null> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (!cached) {
      return null;
    }

    const { flags, timestamp }: CachedFlags = JSON.parse(cached);

    // Check if cache is still valid
    const now = Date.now();
    if (now - timestamp > CACHE_DURATION_MS) {
      console.log('[FeatureFlags] Cache expired');
      return null;
    }

    console.log('[FeatureFlags] Loaded from cache');
    return flags;
  } catch (error) {
    console.error('[FeatureFlags] Failed to load cached flags:', error);
    return null;
  }
}

/**
 * Save feature flags to AsyncStorage cache.
 */
async function saveCachedFlags(flags: FeatureFlagsResponse): Promise<void> {
  try {
    const cached: CachedFlags = {
      flags,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    console.log('[FeatureFlags] Saved to cache');
  } catch (error) {
    console.error('[FeatureFlags] Failed to save cached flags:', error);
  }
}

/**
 * Fetch feature flags from the backend API.
 * Returns cached flags on network error.
 */
export async function fetchFeatureFlags(): Promise<FeatureFlagsResponse> {
  try {
    const apiUrl = await getBackendApiUrl();

    // If no API URL configured yet, return cached flags or empty
    if (!apiUrl) {
      console.log('[FeatureFlags] No API URL configured yet - checking cache');
      const cached = await loadCachedFlags();
      if (cached) {
        console.log('[FeatureFlags] Using cached flags');
        return cached;
      }
      console.log('[FeatureFlags] No cache available - returning empty flags');
      return {};
    }

    const url = `${apiUrl}/api/feature-flags/status`;
    console.log(`[FeatureFlags] Fetching from: ${url}`);

    // Note: /api/feature-flags/status is a public endpoint (no auth required)
    // This allows fetching flags before user has authenticated
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000, // 5 second timeout
    });

    if (!response.ok) {
      console.error(`[FeatureFlags] Error ${response.status}: ${response.statusText}`);

      // On error, try to use cached flags
      const cached = await loadCachedFlags();
      if (cached) {
        console.log('[FeatureFlags] Using cached flags after API error');
        return cached;
      }

      throw new Error(`Failed to fetch feature flags: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[FeatureFlags] Raw response:`, data);

    // Extract flags from response (backend returns { flags: {...}, enabled: true, ... })
    const flags: FeatureFlagsResponse = data.flags || data;
    console.log(`[FeatureFlags] Fetched ${Object.keys(flags).length} flags`);

    // Cache the flags
    await saveCachedFlags(flags);

    return flags;
  } catch (error) {
    console.error('[FeatureFlags] Failed to fetch feature flags:', error);

    // On network error, try to use cached flags
    const cached = await loadCachedFlags();
    if (cached) {
      console.log('[FeatureFlags] Using cached flags after network error');
      return cached;
    }

    // If no cache available, return empty object
    console.log('[FeatureFlags] No cache available - returning empty flags');
    return {};
  }
}

/**
 * Check if a specific feature flag is enabled.
 */
export async function isFeatureEnabled(flagName: string): Promise<boolean> {
  try {
    const flags = await fetchFeatureFlags();
    return flags[flagName]?.enabled ?? false;
  } catch (error) {
    console.error(`[FeatureFlags] Failed to check flag '${flagName}':`, error);
    return false;
  }
}

/**
 * Clear cached feature flags.
 * Useful for forcing a refresh or during logout.
 */
export async function clearFeatureFlagsCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('[FeatureFlags] Cache cleared');
  } catch (error) {
    console.error('[FeatureFlags] Failed to clear cache:', error);
  }
}
