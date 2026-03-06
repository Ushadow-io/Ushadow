/**
 * Feature Flag Context
 *
 * Provides global feature flag state management.
 * Requires a featureFlagService instance (created via createFeatureFlagService).
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { FeatureFlagsResponse } from '../services/featureFlagService';

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
  fetchFlags: () => Promise<FeatureFlagsResponse>;
  clearCache: () => Promise<void>;
}

export function FeatureFlagProvider({ children, fetchFlags, clearCache }: FeatureFlagProviderProps) {
  const [flags, setFlags] = useState<FeatureFlagsResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    console.log('[FeatureFlagContext] Loading feature flags...');
    try {
      setLoading(true);
      setError(null);
      const fetchedFlags = await fetchFlags();
      console.log('[FeatureFlagContext] Loaded flags:', Object.keys(fetchedFlags).length);
      setFlags(fetchedFlags);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load feature flags';
      setError(message);
      console.error('[FeatureFlagContext] Error loading flags:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchFlags]);

  const refreshFlags = useCallback(async () => {
    await clearCache();
    await loadFlags();
  }, [loadFlags, clearCache]);

  const isEnabled = useCallback(
    (flagName: string): boolean => {
      return flags[flagName]?.enabled ?? false;
    },
    [flags]
  );

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

export function useFeatureFlagContext() {
  const context = useContext(FeatureFlagContext);
  if (context === undefined) {
    throw new Error('useFeatureFlagContext must be used within a FeatureFlagProvider');
  }
  return context;
}
