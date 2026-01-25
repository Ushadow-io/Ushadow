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

// Provider configuration and wiring hooks
export { useProviderConfigs } from './useProviderConfigs';
export type {
  ProviderOption,
  GroupedProviders,
  CreateConfigData,
  UseProviderConfigsResult,
} from './useProviderConfigs';

export { useServiceHierarchy, useInstalledServices, useServiceCards } from './useServiceHierarchy';
export type {
  ServiceGroup,
  ServiceHierarchyResult,
  ServiceCardInfo,
} from './useServiceHierarchy';

export { useWiringActions } from './useWiringActions';
export type { WiringConnection, UseWiringActionsResult } from './useWiringActions';
