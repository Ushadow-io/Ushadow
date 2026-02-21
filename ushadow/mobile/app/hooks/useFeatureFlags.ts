/**
 * Feature Flag Hooks
 *
 * Convenience hooks for accessing feature flags in components.
 */

import { useFeatureFlagContext } from '../contexts/FeatureFlagContext';

/**
 * Hook to check if a specific feature flag is enabled.
 *
 * @param flagName - The name of the feature flag to check
 * @returns boolean indicating if the flag is enabled
 *
 * @example
 * const isDualSourceEnabled = useFeatureFlag('mobile_dual_source_conversations');
 */
export function useFeatureFlag(flagName: string): boolean {
  const { isEnabled } = useFeatureFlagContext();
  return isEnabled(flagName);
}

/**
 * Hook to access all feature flags and their state.
 *
 * @returns Feature flags object, loading state, error, and refresh function
 *
 * @example
 * const { flags, loading, error, refreshFlags } = useFeatureFlags();
 */
export function useFeatureFlags() {
  return useFeatureFlagContext();
}
