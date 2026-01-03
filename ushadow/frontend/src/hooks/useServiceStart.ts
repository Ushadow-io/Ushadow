/**
 * Hook for starting services with port conflict detection and resolution.
 *
 * This hook provides a unified way to start services across the application,
 * handling port conflicts by prompting the user to choose an alternative port.
 */

import { useState, useCallback } from 'react'
import { servicesApi } from '../services/api'

export interface PortConflict {
  port: number
  envVar: string | null
  usedBy: string
  suggestedPort: number
}

export interface PortConflictDialogState {
  isOpen: boolean
  serviceId: string | null
  serviceName: string | null
  conflicts: PortConflict[]
}

export interface UseServiceStartResult {
  // State
  isStarting: boolean
  portConflictDialog: PortConflictDialogState
  error: string | null

  // Actions
  startService: (serviceId: string, serviceName?: string) => Promise<boolean>
  resolvePortConflict: (envVar: string, newPort: number) => Promise<boolean>
  dismissPortConflict: () => void
}

/**
 * Hook for starting services with automatic port conflict detection.
 *
 * @param onSuccess - Callback when service starts successfully
 * @param onError - Callback when service fails to start
 */
export function useServiceStart(
  onSuccess?: (serviceId: string, message: string) => void,
  onError?: (serviceId: string, message: string) => void
): UseServiceStartResult {
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [portConflictDialog, setPortConflictDialog] = useState<PortConflictDialogState>({
    isOpen: false,
    serviceId: null,
    serviceName: null,
    conflicts: []
  })

  /**
   * Start a service, checking for port conflicts first.
   * If conflicts are found, opens the port conflict dialog.
   */
  const startService = useCallback(async (serviceId: string, serviceName?: string): Promise<boolean> => {
    setIsStarting(true)
    setError(null)

    try {
      // First, run preflight check for port conflicts
      const preflightResponse = await servicesApi.preflightCheck(serviceId)
      const preflight = preflightResponse.data

      if (!preflight.can_start && preflight.port_conflicts.length > 0) {
        // Port conflicts detected - show dialog
        setPortConflictDialog({
          isOpen: true,
          serviceId,
          serviceName: serviceName || serviceId,
          conflicts: preflight.port_conflicts.map(c => ({
            port: c.port,
            envVar: c.env_var,
            usedBy: c.used_by,
            suggestedPort: c.suggested_port
          }))
        })
        setIsStarting(false)
        return false
      }

      // No conflicts - proceed with start
      const startResponse = await servicesApi.startService(serviceId)

      if (startResponse.data.success) {
        onSuccess?.(serviceId, startResponse.data.message)
        return true
      } else {
        setError(startResponse.data.message)
        onError?.(serviceId, startResponse.data.message)
        return false
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Failed to start service'
      setError(message)
      onError?.(serviceId, message)
      return false
    } finally {
      setIsStarting(false)
    }
  }, [onSuccess, onError])

  /**
   * Resolve a port conflict by setting a new port and retrying start.
   */
  const resolvePortConflict = useCallback(async (envVar: string, newPort: number): Promise<boolean> => {
    const { serviceId, serviceName } = portConflictDialog
    if (!serviceId) return false

    setIsStarting(true)
    setError(null)

    try {
      // Set the port override
      await servicesApi.setPortOverride(serviceId, envVar, newPort)

      // Close the dialog
      setPortConflictDialog({
        isOpen: false,
        serviceId: null,
        serviceName: null,
        conflicts: []
      })

      // Retry the start
      const startResponse = await servicesApi.startService(serviceId)

      if (startResponse.data.success) {
        onSuccess?.(serviceId, startResponse.data.message)
        return true
      } else {
        setError(startResponse.data.message)
        onError?.(serviceId, startResponse.data.message)
        return false
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Failed to resolve port conflict'
      setError(message)
      onError?.(serviceId, message)
      return false
    } finally {
      setIsStarting(false)
    }
  }, [portConflictDialog, onSuccess, onError])

  /**
   * Dismiss the port conflict dialog without resolving.
   */
  const dismissPortConflict = useCallback(() => {
    setPortConflictDialog({
      isOpen: false,
      serviceId: null,
      serviceName: null,
      conflicts: []
    })
    setIsStarting(false)
  }, [])

  return {
    isStarting,
    portConflictDialog,
    error,
    startService,
    resolvePortConflict,
    dismissPortConflict
  }
}
