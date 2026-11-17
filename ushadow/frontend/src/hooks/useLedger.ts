/**
 * Ledger read hooks: timeline of a day, fact search, and "why" of a fact.
 *
 * All calls go through the generic service proxy (services/ledgerApi.ts).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ledgerApi,
  clearLedgerConnectionCache,
  isLedgerUnavailable,
  type LedgerItemKind,
  type LedgerTimeRange,
} from '../services/ledgerApi'

export const ledgerKeys = {
  all: ['ledger'] as const,
  timeline: (range: LedgerTimeRange) => ['ledger', 'timeline', range.start, range.end] as const,
  search: (q: string, includeClosed: boolean) => ['ledger', 'search', q, includeClosed] as const,
  why: (factId: string) => ['ledger', 'why', factId] as const,
  knownEntities: ['ledger', 'known-entities'] as const,
}

/** Facts only: the Facts tab does not list conversations. */
const FACT_KINDS: LedgerItemKind[] = ['knowledge', 'action']

/** A "not running" answer will not get better by an automatic retry. */
const queryDefaults = { retry: false, staleTime: 30_000 } as const

/** Conversations and capture gaps of one time range (a day). */
export function useLedgerTimeline(range: LedgerTimeRange) {
  const query = useQuery({
    queryKey: ledgerKeys.timeline(range),
    queryFn: () => ledgerApi.timeline(range),
    ...queryDefaults,
  })
  return { ...query, isUnavailable: isLedgerUnavailable(query.error) }
}

/** Facts that match `q`. Does nothing while `q` is empty. */
export function useLedgerSearch(q: string, includeClosed: boolean) {
  const query = useQuery({
    queryKey: ledgerKeys.search(q, includeClosed),
    queryFn: () => ledgerApi.search({ q, kinds: FACT_KINDS, includeClosed, limit: 50 }),
    enabled: q.length > 0,
    ...queryDefaults,
  })
  return { ...query, isUnavailable: isLedgerUnavailable(query.error) }
}

/** Evidence and decisions of one fact. Does nothing while `factId` is null. */
export function useLedgerWhy(factId: string | null) {
  return useQuery({
    queryKey: ledgerKeys.why(factId ?? ''),
    queryFn: () => ledgerApi.whyFact(factId as string),
    enabled: factId !== null,
    ...queryDefaults,
  })
}

/** Retry after "service not running": forget the cached connection, ask again. */
export function useLedgerRetry() {
  const queryClient = useQueryClient()
  return () => {
    clearLedgerConnectionCache()
    return queryClient.invalidateQueries({ queryKey: ledgerKeys.all })
  }
}
