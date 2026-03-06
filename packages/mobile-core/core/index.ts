/**
 * @ushadow/mobile-core/core
 *
 * Cross-cutting utilities — theme, feature flags, lifecycle, logging.
 */

// Theme
export { ThemeProvider, useTheme } from './theme/ThemeProvider';
export type { AppTheme, ColorScale } from './theme/types';

// Hooks
export { useAppLifecycle } from './hooks/useAppLifecycle';
export type { UseAppLifecycleOptions, UseAppLifecycleReturn } from './hooks/useAppLifecycle';
export { useConnectionHealth } from './hooks/useConnectionHealth';
export type { UseConnectionHealthOptions, UseConnectionHealthReturn } from './hooks/useConnectionHealth';
export { useConnectionLog } from './hooks/useConnectionLog';
export type { UseConnectionLogReturn } from './hooks/useConnectionLog';

// Contexts
export { FeatureFlagProvider, useFeatureFlagContext } from './contexts/FeatureFlagContext';

// Services
export { createFeatureFlagService } from './services/featureFlagService';
export type { FeatureFlag, FeatureFlagsResponse, FeatureFlagServiceConfig } from './services/featureFlagService';
export {
  addPersistentLog,
  getPersistentLogs,
  clearPersistentLogs,
  getPersistentLogsText,
} from './services/persistentLogger';
export type { PersistentLogEntry } from './services/persistentLogger';

// Types
export * from './types/connectionLog';
