/**
 * Known names (the ledger's word list): list, add, remove.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ledgerApi,
  ledgerErrorMessage,
  isLedgerUnavailable,
  type KnownEntityInput,
} from '../services/ledgerApi'
import { useToast } from '../contexts/ToastContext'
import { ledgerKeys } from './useLedger'

export function useKnownEntities() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const query = useQuery({
    queryKey: ledgerKeys.knownEntities,
    queryFn: async () => (await ledgerApi.knownEntities()).entities,
    retry: false,
    staleTime: 30_000,
  })

  const refetchList = () => queryClient.invalidateQueries({ queryKey: ledgerKeys.knownEntities })

  const addMutation = useMutation({
    mutationFn: (entry: KnownEntityInput) => ledgerApi.addKnownEntity(entry),
    onSuccess: (entry) => {
      showToast('success', `Added "${entry.name}"`)
      return refetchList()
    },
    onError: (error) => showToast('error', `Could not add: ${ledgerErrorMessage(error)}`),
  })

  const removeMutation = useMutation({
    mutationFn: (name: string) => ledgerApi.removeKnownEntity(name),
    onSuccess: (_data, name) => {
      showToast('success', `Removed "${name}"`)
      return refetchList()
    },
    // 404 = no such entry: the list is old, so fetch it again
    onError: (error) => {
      showToast('error', `Could not remove: ${ledgerErrorMessage(error)}`)
      return refetchList()
    },
  })

  return {
    entities: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    isUnavailable: isLedgerUnavailable(query.error),
    add: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    remove: removeMutation.mutate,
    isRemoving: removeMutation.isPending,
  }
}
