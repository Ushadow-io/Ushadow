/**
 * Custom Hooks
 */

// Wizard hooks
export { useWizardSteps } from './useWizardSteps';
export type { UseWizardStepsReturn } from '../types/wizard';

// Service management hooks
export { useServiceStatus, shouldShowField, maskValue } from './useServiceStatus';
export type { ServiceState, StatusColor, ServiceStatusResult } from './useServiceStatus';

// Service start with port conflict handling
export { useServiceStart } from './useServiceStart';
export type { PortConflict, PortConflictDialogState, UseServiceStartResult } from './useServiceStart';

// Memory and graph hooks
export { useMemories, useMemory, useRelatedMemories } from './useMemories';
export { useGraphApi } from './useGraphApi';

// Generic QR code hook (mobile, Tailscale auth, etc.)
export { useQrCode, useMobileQrCode } from './useQrCode';
export type { QrCodeData, UseQrCodeOptions } from './useQrCode';
