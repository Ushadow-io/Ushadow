/**
 * useDeploymentActions - Deployment lifecycle management with optimistic updates
 *
 * Pattern 2: Data Fetching Hook (mutations)
 * Handles stop, restart, remove actions with optimistic UI updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deploymentsApi } from '../services/api'
import type { ServiceConfigData } from './useServiceConfigData'

export interface UseDeploymentActionsResult {
  stopDeployment: (deploymentId: string) => Promise<void>
  restartDeployment: (deploymentId: string) => Promise<void>
  removeDeployment: (deploymentId: string) => Promise<void>
  isStopping: boolean
  isRestarting: boolean
  isRemoving: boolean
}

/**
 * Hook for deployment lifecycle actions.
 * Uses optimistic updates to make UI feel responsive.
 */
export function useDeploymentActions(): UseDeploymentActionsResult {
  const queryClient = useQueryClient()

  // Stop deployment
  const stopMutation = useMutation({
    mutationFn: deploymentsApi.stopDeployment,
    onMutate: async (deploymentId: string) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['service-configs'] })

      // Snapshot previous value
      const previous = queryClient.getQueryData<ServiceConfigData>(['service-configs'])

      // Optimistic update
      queryClient.setQueryData<ServiceConfigData>(['service-configs'], (old) => {
        if (!old) return old
        return {
          ...old,
          deployments: old.deployments.map((d) =>
            d.id === deploymentId ? { ...d, status: 'stopping' } : d
          ),
        }
      })

      return { previous }
    },
    onError: (err, variables, context) => {
      // Revert optimistic update on error
      if (context?.previous) {
        queryClient.setQueryData(['service-configs'], context.previous)
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['service-configs'] })
    },
  })

  // Restart deployment
  const restartMutation = useMutation({
    mutationFn: deploymentsApi.restartDeployment,
    onMutate: async (deploymentId: string) => {
      await queryClient.cancelQueries({ queryKey: ['service-configs'] })
      const previous = queryClient.getQueryData<ServiceConfigData>(['service-configs'])

      queryClient.setQueryData<ServiceConfigData>(['service-configs'], (old) => {
        if (!old) return old
        return {
          ...old,
          deployments: old.deployments.map((d) =>
            d.id === deploymentId ? { ...d, status: 'starting' } : d
          ),
        }
      })

      return { previous }
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['service-configs'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['service-configs'] })
    },
  })

  // Remove deployment
  const removeMutation = useMutation({
    mutationFn: deploymentsApi.removeDeployment,
    onMutate: async (deploymentId: string) => {
      await queryClient.cancelQueries({ queryKey: ['service-configs'] })
      const previous = queryClient.getQueryData<ServiceConfigData>(['service-configs'])

      // Optimistically remove from list
      queryClient.setQueryData<ServiceConfigData>(['service-configs'], (old) => {
        if (!old) return old
        return {
          ...old,
          deployments: old.deployments.filter((d) => d.id !== deploymentId),
        }
      })

      return { previous }
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['service-configs'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['service-configs'] })
    },
  })

  return {
    stopDeployment: stopMutation.mutateAsync,
    restartDeployment: restartMutation.mutateAsync,
    removeDeployment: removeMutation.mutateAsync,
    isStopping: stopMutation.isPending,
    isRestarting: restartMutation.isPending,
    isRemoving: removeMutation.isPending,
  }
}
