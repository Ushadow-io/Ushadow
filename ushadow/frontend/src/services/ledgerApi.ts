/**
 * Ledger API Client
 *
 * Typed client for the ledger read API (/v1), reached ONLY through the generic
 * service proxy (see docs/SERVICE-INTEGRATION-CHECKLIST.md). The backend proxy
 * adds the user's auth; the ledger acts for the signed-in user, so every call
 * sends `userId=me` and never a real user id.
 *
 * Shapes mirror `ledger/src/ledger/read_models.py`.
 */

import axios from 'axios'
import { api } from './api'

const LEDGER_SERVICE = 'ledger'
const ME = 'me'

// =============================================================================
// Types
// =============================================================================

export interface LedgerTimeRange {
  start: string
  end: string
}

export interface LedgerEvidence {
  recordingId: string
  range: LedgerTimeRange
  transcriptRevision?: string | null
  quote?: string | null
}

export type LedgerGapCause =
  | 'device_offline'
  | 'disconnected'
  | 'paused'
  | 'excluded'
  | 'not_recording'
  | 'unknown'

export interface LedgerCaptureGap {
  id: string
  sourceId: string
  recordingId?: string | null
  range: LedgerTimeRange
  cause: LedgerGapCause
}

export type LedgerItemKind = 'conversation' | 'knowledge' | 'action'
export type LedgerHeard = 'known' | 'unknown'

/** A fact (from memory) or a conversation (from the ledger), with its proof. */
export interface LedgerItem {
  kind: LedgerItemKind
  subKind?: string | null
  sensitivity?: string
  id: string
  /** Fact sentence, or conversation title */
  text?: string | null
  summary?: string | null
  /** Fact valid from / conversation start */
  at?: string | null
  /** Conversation end */
  end?: string | null
  /** Fact closed at (not current) */
  validTo?: string | null
  open?: boolean | null
  source?: string | null
  direction?: string | null
  due?: string | null
  about?: string[]
  people?: string[]
  conversationId?: string | null
  /** Fact: 0..1, how sure memory is */
  confidence?: number | null
  heard?: LedgerHeard | null
  evidence?: LedgerEvidence[]
}

export interface LedgerLink {
  id: string
  kind: string
  fromId: string
  toId?: string | null
  at?: string | null
  decidedBy: string
  confidence?: number | null
  reason?: string | null
}

export interface LedgerWhyStep {
  kind: LedgerItemKind
  /** opened_by | joined | split | closed_by | asserted */
  role: string
  /** human | model | rule */
  decidedBy: string
  source?: string | null
  link?: LedgerLink | null
  conversationId?: string | null
  at?: string | null
  /** Human decision: the human's own words */
  text?: string | null
}

/** Fields every read answer carries next to its items. */
export interface LedgerAnswer {
  userId: string
  range?: LedgerTimeRange | null
  gaps: LedgerCaptureGap[]
  withheld: number
  partial: boolean
  partialReasons: string[]
}

export interface LedgerTimelineAnswer extends LedgerAnswer {
  conversations: LedgerItem[]
}

export interface LedgerSearchAnswer extends LedgerAnswer {
  query: string
  items: LedgerItem[]
}

export interface LedgerWhyAnswer extends LedgerAnswer {
  target: Record<string, string>
  item?: LedgerItem | null
  conversations: LedgerItem[]
  steps: LedgerWhyStep[]
}

export interface LedgerWriteAnswer {
  userId: string
  owner: 'memory' | 'ledger'
  decisions: Record<string, unknown>[]
}

export const KNOWN_ENTITY_TYPES = [
  'Person',
  'Place',
  'Organization',
  'Thing',
  'Topic',
  'Event',
  'Other',
] as const
export type KnownEntityType = (typeof KNOWN_ENTITY_TYPES)[number]

export interface KnownEntity {
  id: string
  name: string
  aliases: string[]
  type: KnownEntityType | null
  at: string
}

export interface KnownEntityInput {
  name: string
  aliases: string[]
  type: KnownEntityType | null
}

export interface LedgerSearchParams {
  q: string
  kinds?: LedgerItemKind[]
  includeClosed?: boolean
  limit?: number
}

// =============================================================================
// Connection (cached) and "service not running" detection
// =============================================================================

/** The ledger service is not deployed, not running, or the proxy cannot reach it. */
export class LedgerUnavailableError extends Error {
  constructor(message = 'The ledger service is not running or not reachable.') {
    super(message)
    this.name = 'LedgerUnavailableError'
  }
}

const UNREACHABLE_STATUSES = [502, 503, 504]

export function isLedgerUnavailable(error: unknown): boolean {
  if (error instanceof LedgerUnavailableError) return true
  if (!axios.isAxiosError(error)) return false
  // No response at all (network error / timeout), or a gateway status from the proxy
  return !error.response || UNREACHABLE_STATUSES.includes(error.response.status)
}

/** A short text for an error: the service's `detail` when it gave one. */
export function ledgerErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    return error.message
  }
  return error instanceof Error ? error.message : 'Unknown error'
}

let proxyUrlCache: string | null = null

/** Proxy base URL of the ledger. Only a usable answer is cached, so a later start is seen. */
export async function getLedgerProxyUrl(): Promise<string> {
  if (proxyUrlCache) return proxyUrlCache

  let info: { proxy_url: string | null; available: boolean }
  try {
    const response = await api.get(`/api/services/${LEDGER_SERVICE}/connection-info`)
    info = response.data
  } catch (error) {
    // 404 here = the backend does not know a service named "ledger" (not deployed yet)
    if (axios.isAxiosError(error) && (error.response?.status === 404 || isLedgerUnavailable(error))) {
      throw new LedgerUnavailableError()
    }
    throw error
  }
  if (!info.available || !info.proxy_url) throw new LedgerUnavailableError()

  proxyUrlCache = info.proxy_url
  return proxyUrlCache
}

/** Clear the cached connection (call before a retry, e.g. after the service was started). */
export function clearLedgerConnectionCache() {
  proxyUrlCache = null
}

async function get<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const proxyUrl = await getLedgerProxyUrl()
  // A list goes as ONE comma-separated value (kinds=a,b): the generic proxy keeps only one
  // value of a repeated key, and the ledger reads both forms.
  const flat = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value])
  )
  const response = await api.get<T>(`${proxyUrl}${path}`, { params: { userId: ME, ...flat } })
  return response.data
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const proxyUrl = await getLedgerProxyUrl()
  const response = await api.post<T>(`${proxyUrl}${path}`, { userId: ME, ...body })
  return response.data
}

// =============================================================================
// API
// =============================================================================

export const ledgerApi = {
  /** Conversations in order, and the capture gaps of the range (ISO times with offset). */
  timeline: (range: LedgerTimeRange) =>
    get<LedgerTimelineAnswer>('/v1/timeline', { start: range.start, end: range.end }),

  /** Facts and conversations that match, each with its proof. */
  search: (params: LedgerSearchParams) => get<LedgerSearchAnswer>('/v1/search', { ...params }),

  /** Evidence of a fact, the conversations it comes from and the decisions. */
  whyFact: (factId: string) => get<LedgerWhyAnswer>('/v1/why', { factId }),

  /** "Wrong": retract a fact (a human correction, sent to memory). */
  retractFact: (factId: string) =>
    post<LedgerWriteAnswer>('/v1/correct', { fact: { factId, retract: true } }),

  /** Forget facts; memory blocks them from being made again. */
  forgetFacts: (factIds: string[]) => post<LedgerWriteAnswer>('/v1/forget', { factIds }),

  knownEntities: () =>
    get<{ userId: string; entities: KnownEntity[] }>('/v1/known-entities', {}),

  addKnownEntity: (entry: KnownEntityInput) =>
    post<KnownEntity>('/v1/known-entities', { ...entry }),

  removeKnownEntity: (name: string) =>
    post<{ removed: boolean }>('/v1/known-entities/remove', { name }),
}
