/**
 * @ushadow/mobile-core (nar8 subset)
 *
 * Shared component library — trimmed for the nar8 standalone repo to
 * only include modules reachable from nar8's entry points.
 *
 * Import from subpaths for tree-shaking:
 *   import { ThemeProvider } from '@ushadow/mobile-core/core';
 *   import { BluetoothProvider } from '@ushadow/mobile-core/ble';
 *   import { useRoutines } from '@ushadow/mobile-core/routine';
 *
 * Modules:
 * - ble/      — Bluetooth / Omi device discovery
 * - core/     — Feature flags, lifecycle, theme, utilities
 * - feedback/ — Post-session feedback collection
 * - routine/  — Routine management and recording
 * - timeline/ — Timeline extraction and display
 */

// Re-export active modules for convenience (prefer subpath imports)
export * from './core';
export * from './timeline';
export * from './routine';
export * from './feedback';
