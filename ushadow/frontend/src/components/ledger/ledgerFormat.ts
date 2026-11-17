/**
 * Pure helpers for the Ledger page: local days, time labels, timeline order.
 */

import type {
  LedgerCaptureGap,
  LedgerGapCause,
  LedgerItem,
  LedgerTimeRange,
} from '../../services/ledgerApi'

const pad = (n: number) => String(n).padStart(2, '0')

/** A local calendar day as `YYYY-MM-DD` (the value of a date input). */
export function toDayString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dayStart(day: string, addDays = 0): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d + addDays)
}

export function shiftDay(day: string, days: number): string {
  return toDayString(dayStart(day, days))
}

/** The local day as a UTC range: local midnight to the next local midnight. */
export function dayRange(day: string): LedgerTimeRange {
  return { start: dayStart(day).toISOString(), end: dayStart(day, 1).toISOString() }
}

export function formatDayLabel(day: string): string {
  return dayStart(day).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** `13:05` in the browser's time zone; empty when there is no time. */
export function formatTime(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatTimeRange(start?: string | null, end?: string | null): string {
  const from = formatTime(start)
  const to = formatTime(end)
  return to ? `${from}–${to}` : from
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

/** `0.87` -> `87%`; null when memory gave no confidence. */
export function formatConfidence(confidence?: number | null): string | null {
  if (confidence === null || confidence === undefined) return null
  return `${Math.round(confidence * 100)}%`
}

/** Comma separated names to a list: `"Bob, Bobby ,"` -> `["Bob", "Bobby"]` */
export function parseAliases(text: string): string[] {
  const aliases = text.split(',').map((alias) => alias.trim()).filter(Boolean)
  return Array.from(new Set(aliases))
}

const GAP_CAUSE_LABELS: Record<LedgerGapCause, string> = {
  device_offline: 'device offline',
  disconnected: 'disconnected',
  paused: 'paused',
  excluded: 'excluded',
  not_recording: 'not recording',
  unknown: 'cause unknown',
}

export function gapCauseLabel(cause: string): string {
  return GAP_CAUSE_LABELS[cause as LedgerGapCause] ?? cause
}

export type TimelineRow =
  | { type: 'conversation'; key: string; at: number; conversation: LedgerItem }
  | { type: 'gap'; key: string; at: number; gap: LedgerCaptureGap }

const toMillis = (iso?: string | null) => (iso ? new Date(iso).getTime() || 0 : 0)

/** Conversations and capture gaps of a day as one list, in time order. */
export function buildTimelineRows(
  conversations: LedgerItem[],
  gaps: LedgerCaptureGap[]
): TimelineRow[] {
  const rows: TimelineRow[] = [
    ...conversations.map((conversation) => ({
      type: 'conversation' as const,
      key: `c-${conversation.id}`,
      at: toMillis(conversation.at),
      conversation,
    })),
    ...gaps.map((gap) => ({
      type: 'gap' as const,
      key: `g-${gap.id}`,
      at: toMillis(gap.range.start),
      gap,
    })),
  ]
  return rows.sort((a, b) => a.at - b.at)
}
