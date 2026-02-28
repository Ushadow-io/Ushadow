/**
 * useServiceCatalog - Manage service catalog browsing and installation
 *
 * Pattern 2: Data Fetching Hook + Pattern 5: UI State Hook
 * Handles catalog modal state, fetching catalog, and installing/uninstalling services
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { servicesApi, svcConfigsApi } from '../services/api'

export interface UseServiceCatalogResult {
  // UI State
  isOpen: boolean
  open: () => void
  close: () => void

  // Data
  services: any[]
  isLoading: boolean
  error: Error | null

  // Actions
  install: (serviceId: string) => Promise<void>
  uninstall: (serviceId: string) => Promise<void>
  isInstalling: boolean
  installingServiceId: string | null
}

/**
 * Hook for managing the service catalog modal and installation.
 * Only fetches catalog when modal is opened (enabled: isOpen).
 */
export function useServiceCatalog(): UseServiceCatalogResult {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [installingServiceId, setInstallingServiceId] = useState<string | null>(null)

  // Fetch catalog (only when modal is open)
  const catalogQuery = useQuery({
    queryKey: ['service-catalog'],
    queryFn: async () => {
      const response = await servicesApi.getCatalog()
      return response.data
    },
    enabled: isOpen,
    staleTime: 30_000, // Cache for 30 seconds
  })

  // Install mutation
  const installMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      const serviceToInstall = catalogQuery.data?.find((s: any) => s.service_id === serviceId)

      // If service has a wizard AND still needs setup, navigate to wizard first.
      // If already configured (needs_setup === false), just install directly.
      if (serviceToInstall?.wizard && serviceToInstall?.needs_setup) {
        setIsOpen(false)
        navigate(`/wizard/${serviceToInstall.wizard}`)

        // Continue installation in background
        await servicesApi.install(serviceId)
      } else {
        // No setup required (or no wizard) — install directly
        await servicesApi.install(serviceId)
      }
    },
    onSuccess: () => {
      // Refresh service configs and catalog
      queryClient.invalidateQueries({ queryKey: ['service-configs'] })
      queryClient.invalidateQueries({ queryKey: ['service-catalog'] })
    },
    onSettled: () => {
      setInstallingServiceId(null)
    },
  })

  // Uninstall mutation
  const uninstallMutation = useMutation({
    mutationFn: servicesApi.uninstall,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-configs'] })
      queryClient.invalidateQueries({ queryKey: ['service-catalog'] })
    },
    onSettled: () => {
      setInstallingServiceId(null)
    },
  })

  const install = async (serviceId: string) => {
    setInstallingServiceId(serviceId)
    await installMutation.mutateAsync(serviceId)
  }

  const uninstall = async (serviceId: string) => {
    setInstallingServiceId(serviceId)
    await uninstallMutation.mutateAsync(serviceId)
  }

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    services: catalogQuery.data || [],
    isLoading: catalogQuery.isLoading,
    error: catalogQuery.error,
    install,
    uninstall,
    isInstalling: installMutation.isPending || uninstallMutation.isPending,
    installingServiceId,
  }
}
