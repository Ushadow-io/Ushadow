/**
 * Feature Flag Service
 *
 * API client for fetching and managing feature flags from the backend.
 * Caches flags in AsyncStorage for offline support.
 *
 * Requires injectable config: getApiUrl and getToken callbacks.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@feature_flags';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

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

export interface FeatureFlagServiceConfig {
  getApiUrl: () => Promise<string>;
  getToken?: () => Promise<string | null>;
}

async function loadCachedFlags(): Promise<FeatureFlagsResponse | null> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (!cached) return null;

    const { flags, timestamp }: CachedFlags = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION_MS) {
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

async function saveCachedFlags(flags: FeatureFlagsResponse): Promise<void> {
  try {
    const cached: CachedFlags = { flags, timestamp: Date.now() };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
    console.log('[FeatureFlags] Saved to cache');
  } catch (error) {
    console.error('[FeatureFlags] Failed to save cached flags:', error);
  }
}

export function createFeatureFlagService(config: FeatureFlagServiceConfig) {
  const { getApiUrl } = config;

  async function fetchFeatureFlags(): Promise<FeatureFlagsResponse> {
    try {
      const apiUrl = await getApiUrl();

      if (!apiUrl) {
        console.log('[FeatureFlags] No API URL configured yet - checking cache');
        const cached = await loadCachedFlags();
        return cached || {};
      }

      const url = `${apiUrl}/api/feature-flags/status`;
      console.log(`[FeatureFlags] Fetching from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        console.error(`[FeatureFlags] Error ${response.status}: ${response.statusText}`);
        const cached = await loadCachedFlags();
        if (cached) return cached;
        throw new Error(`Failed to fetch feature flags: ${response.status}`);
      }

      const data = await response.json();
      const flags: FeatureFlagsResponse = data.flags || data;
      console.log(`[FeatureFlags] Fetched ${Object.keys(flags).length} flags`);

      await saveCachedFlags(flags);
      return flags;
    } catch (error) {
      console.error('[FeatureFlags] Failed to fetch feature flags:', error);
      const cached = await loadCachedFlags();
      return cached || {};
    }
  }

  async function isFeatureEnabled(flagName: string): Promise<boolean> {
    try {
      const flags = await fetchFeatureFlags();
      return flags[flagName]?.enabled ?? false;
    } catch (error) {
      console.error(`[FeatureFlags] Failed to check flag '${flagName}':`, error);
      return false;
    }
  }

  async function clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      console.log('[FeatureFlags] Cache cleared');
    } catch (error) {
      console.error('[FeatureFlags] Failed to clear cache:', error);
    }
  }

  return {
    fetchFeatureFlags,
    isFeatureEnabled,
    clearFeatureFlagsCache: clearCache,
  };
}
