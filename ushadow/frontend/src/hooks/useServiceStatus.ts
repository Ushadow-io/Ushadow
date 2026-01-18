import { useMemo } from 'react'
import {
  CheckCircle,
  AlertCircle,
  Circle,
  PlayCircle,
  LucideIcon,
} from 'lucide-react'
import type { ServiceServiceConfig, ContainerStatus, ConfigField } from '../contexts/ServicesContext'

// ============================================================================
// Types
// ============================================================================

export type ServiceState = 'running' | 'stopped' | 'active' | 'not_configured' | 'error'
export type StatusColor = 'success' | 'error' | 'neutral' | 'warning'

export interface ServiceStatusResult {
  state: ServiceState
  label: string
  color: StatusColor
  icon: LucideIcon
  canStart?: boolean
  canStop?: boolean
  canEdit?: boolean
  canConfigure?: boolean
}

// ============================================================================
// Helper Functions
// ============================================================================

function hasRequiredConfig(
  service: ServiceServiceConfig,
  config: Record<string, any> | undefined
): boolean {
  // No config needed (like mem0-ui) - always "configured"
  if (!service.config_schema || service.config_schema.length === 0) {
    return true
  }

  // Get list of required fields
  const requiredFields = service.config_schema.filter((f: ConfigField) => f.required)

  // If no required fields, service is always configured
  if (requiredFields.length === 0) {
    return true
  }

  // If no config saved at all, not configured
  if (!config || Object.keys(config).length === 0) {
    return false
  }

  // Check all required fields have non-null values
  return requiredFields.every((f: ConfigField) => {
    const value = config[f.key]
    return value !== undefined && value !== null && value !== ''
  })
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Calculate the status of a service based on its configuration and container state.
 *
 * Status priority:
 * 1. Not configured - Missing required config fields
 * 2. Cloud services - Always "active" if configured
 * 3. Local services - Check Docker container status
 */
export function useServiceStatus(
  service: ServiceServiceConfig,
  config: Record<string, any> | undefined,
  containerStatus: ContainerStatus | undefined
): ServiceStatusResult {
  return useMemo(() => {
    const isConfigured = hasRequiredConfig(service, config)

    // Rule 1: Not configured services - needs setup
    if (!isConfigured) {
      return {
        state: 'not_configured',
        label: 'Missing Config',
        color: 'error',
        icon: AlertCircle,
        canConfigure: true,
      }
    }

    // Rule 2: Cloud services - configured means active
    if (service.mode === 'cloud') {
      return {
        state: 'active',
        label: 'Active',
        color: 'success',
        icon: CheckCircle,
        canEdit: true,
      }
    }

    // Rule 3: Local services - check container status
    if (!containerStatus || containerStatus.status === 'not_found') {
      return {
        state: 'stopped',
        label: 'Stopped',
        color: 'neutral',
        icon: Circle,
        canStart: true,
        canEdit: true,
      }
    }

    if (containerStatus.status === 'running') {
      const isHealthy = containerStatus.health === 'healthy'
      return {
        state: 'running',
        label: isHealthy ? 'Running' : 'Starting',
        color: 'success',
        icon: PlayCircle,
        canStop: true,
        canEdit: true,
      }
    }

    if (containerStatus.status === 'exited' || containerStatus.status === 'stopped') {
      return {
        state: 'stopped',
        label: 'Stopped',
        color: 'neutral',
        icon: Circle,
        canStart: true,
        canEdit: true,
      }
    }

    // Unknown state - show as error
    return {
      state: 'error',
      label: 'Error',
      color: 'error',
      icon: AlertCircle,
      canEdit: true,
    }
  }, [service, config, containerStatus])
}

/**
 * Check if a conditional field should be shown based on current config values.
 * For example, neo4j_password only shows if enable_graph is true.
 */
export function shouldShowField(fieldKey: string, config: Record<string, any>): boolean {
  if (fieldKey === 'neo4j_password') {
    return config.enable_graph === true
  }
  return true
}

/**
 * Mask a secret value for display, showing only the last 4 characters.
 */
export function maskValue(value: string): string {
  if (value && value.length > 4) {
    return '●●●●●●' + value.slice(-4)
  }
  return '●●●●●●'
}
