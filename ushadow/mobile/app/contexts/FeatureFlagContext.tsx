/**
 * Feature Flag Context
 *
 * Provides global feature flag state management for the mobile app.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchFeatureFlags, FeatureFlagsResponse, clearFeatureFlagsCache } from '../services/featureFlagService';

interface FeatureFlagContextValue {
  flags: FeatureFlagsResponse;
  loading: boolean;
  error: string | null;
  refreshFlags: () => Promise<void>;
  isEnabled: (flagName: string) => boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | undefined>(undefined);

interface FeatureFlagProviderProps {
  children: React.ReactNode;
}

export function FeatureFlagProvider({ children }: FeatureFlagProviderProps) {
  const [flags, setFlags] = useState<FeatureFlagsResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    console.log('[FeatureFlagContext] Loading feature flags...');
    try {
      setLoading(true);
      setError(null);
      const fetchedFlags = await fetchFeatureFlags();
      console.log('[FeatureFlagContext] Loaded flags:', Object.keys(fetchedFlags).length);
      setFlags(fetchedFlags);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load feature flags';
      setError(message);
      console.error('[FeatureFlagContext] Error loading flags:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshFlags = useCallback(async () => {
    // Clear cache to force fresh fetch
    await clearFeatureFlagsCache();
    await loadFlags();
  }, [loadFlags]);

  const isEnabled = useCallback(
    (flagName: string): boolean => {
      return flags[flagName]?.enabled ?? false;
    },
    [flags]
  );

  // Load flags on mount
  useEffect(() => {
    console.log('[FeatureFlagContext] Provider mounted, loading flags on startup...');
    loadFlags();
  }, [loadFlags]);

  const value: FeatureFlagContextValue = {
    flags,
    loading,
    error,
    refreshFlags,
    isEnabled,
  };

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

/**
 * Hook to access feature flags context.
 */
export function useFeatureFlagContext() {
  const context = useContext(FeatureFlagContext);
  if (context === undefined) {
    throw new Error('useFeatureFlagContext must be used within a FeatureFlagProvider');
  }
  return context;
}
