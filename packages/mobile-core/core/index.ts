/**
 * @ushadow/mobile-core/core
 *
 * Cross-cutting utilities — feature flags, lifecycle, logging, theme.
 *
 * Active exports:
 */

// Theme
export { ThemeProvider, useTheme } from './theme/ThemeProvider';
export type { AppTheme, ColorScale } from './theme/types';

/**
 * Planned exports (extraction pending):
 * - useAppLifecycle (from app/hooks/useAppLifecycle.ts)
 * - useConnectionLog (from app/hooks/useConnectionLog.ts)
 * - useConnectionHealth (from app/hooks/useConnectionHealth.ts)
 * - useFeatureFlags (from app/hooks/useFeatureFlags.ts)
 * - FeatureFlagContext (from app/contexts/FeatureFlagContext.tsx)
 * - featureFlagService (from app/services/featureFlagService.ts)
 * - persistentLogger (from app/services/persistentLogger.ts)
 * - unodeStorage (from app/_utils/unodeStorage.ts)
 * - omiDeviceStorage (from app/_utils/omiDeviceStorage.ts)
 */
