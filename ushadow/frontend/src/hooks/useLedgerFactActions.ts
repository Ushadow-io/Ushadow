/**
 * Ledger write hooks for one fact: "Wrong" (retract) and "Forget".
 *
 * State is not changed optimistically: after a write the searches are fetched again.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ledgerApi, ledgerErrorMessage } from '../services/ledgerApi'
import { useToast } from '../contexts/ToastContext'

export function useLedgerFactActions() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const refetchFacts = () => queryClient.invalidateQueries({ queryKey: ['ledger', 'search'] })

  const retractMutation = useMutation({
    mutationFn: (factId: string) => ledgerApi.retractFact(factId),
    onSuccess: () => {
      showToast('success', 'Fact marked as wrong')
      return refetchFacts()
    },
    onError: (error) => showToast('error', `Could not mark as wrong: ${ledgerErrorMessage(error)}`),
  })

  const forgetMutation = useMutation({
    mutationFn: (factId: string) => ledgerApi.forgetFacts([factId]),
    onSuccess: () => {
      showToast('success', 'Fact forgotten')
      return refetchFacts()
    },
    onError: (error) => showToast('error', `Could not forget: ${ledgerErrorMessage(error)}`),
  })

  const pendingFactId =
    (retractMutation.isPending && retractMutation.variables) ||
    (forgetMutation.isPending && forgetMutation.variables) ||
    null

  return {
    retract: retractMutation.mutate,
    forget: forgetMutation.mutate,
    /** The fact a write is running for, or null */
    pendingFactId,
  }
}
