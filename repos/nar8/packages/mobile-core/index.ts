/**
 * @ushadow/mobile-core
 *
 * Shared component library for ushadow mobile apps (ushadow, nar8, etc.).
 *
 * Import from subpaths for tree-shaking:
 *   import { useAudioStreamer } from '@ushadow/mobile-core/audio';
 *   import { TimelineView } from '@ushadow/mobile-core/timeline';
 *   import { useRoutines } from '@ushadow/mobile-core/routine';
 *   import { ThemeProvider } from '@ushadow/mobile-core/core';
 *
 * Modules:
 * - audio/    — Audio streaming hooks and components
 * - ble/      — Bluetooth / Omi device discovery
 * - auth/     — Keycloak OAuth and token management
 * - session/  — Session tracking and persistence
 * - data/     — Backend API clients
 * - timeline/ — Timeline extraction and display (NEW)
 * - routine/  — Routine management and recording (NEW)
 * - feedback/ — Post-session feedback collection (NEW)
 * - analysis/ — Trend analysis and suggestions (NEW, Phase 3)
 * - schedule/ — Schedule monitoring and alerts (NEW, Phase 4)
 * - location/ — GPS tracking during recording (NEW, Phase 4)
 * - chat/     — Chat message components
 * - core/     — Feature flags, lifecycle, theme, utilities
 */

// Re-export active modules for convenience (prefer subpath imports)
export * from './core';
export * from './timeline';
export * from './routine';
export * from './feedback';
