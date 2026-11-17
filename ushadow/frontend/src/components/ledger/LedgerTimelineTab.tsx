/**
 * Ledger "Timeline" tab: the conversations of one day in time order, with the
 * capture gaps of the day shown between them.
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, MicOff, Users } from 'lucide-react'
import { ledger } from '../../testing/ui-contract'
import { useLedgerTimeline } from '../../hooks/useLedger'
import type { LedgerCaptureGap, LedgerItem } from '../../services/ledgerApi'
import {
  buildTimelineRows,
  dayRange,
  formatDayLabel,
  formatTimeRange,
  gapCauseLabel,
  shiftDay,
  toDayString,
} from './ledgerFormat'
import { LedgerEmpty, LedgerLoading, LedgerPartialWarning, LedgerQueryState } from './LedgerNotices'

const ids = ledger.timeline

function DayPicker({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const today = toDayString(new Date())
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftDay(day, -1))}
        className="btn-secondary px-2"
        aria-label="Previous day"
        data-testid={ids.prevDay}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <input
        type="date"
        value={day}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="Day"
        className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        data-testid={ids.dateField}
      />
      <button
        type="button"
        onClick={() => onChange(shiftDay(day, 1))}
        className="btn-secondary px-2"
        aria-label="Next day"
        data-testid={ids.nextDay}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange(today)}
        disabled={day === today}
        className="btn-ghost text-sm"
        data-testid={ids.today}
      >
        Today
      </button>
      <span className="text-sm text-neutral-600 dark:text-neutral-400">{formatDayLabel(day)}</span>
    </div>
  )
}

function ConversationRow({ conversation }: { conversation: LedgerItem }) {
  const people = conversation.people ?? []
  return (
    <li className="card p-4" data-testid={ids.conversation(conversation.id)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100 min-w-0 truncate">
          {conversation.text || 'Untitled conversation'}
        </h3>
        <span className="shrink-0 text-sm font-mono text-neutral-600 dark:text-neutral-400">
          {formatTimeRange(conversation.at, conversation.end)}
          {conversation.open && ' (open)'}
        </span>
      </div>
      {conversation.summary && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{conversation.summary}</p>
      )}
      {people.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span className="min-w-0 truncate">{people.join(', ')}</span>
        </p>
      )}
    </li>
  )
}

/** A capture gap: clearly not a conversation ("no recording 13:00–13:20", with its cause). */
function GapRow({ gap }: { gap: LedgerCaptureGap }) {
  return (
    <li
      className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300"
      data-testid={ids.gap(gap.id)}
    >
      <MicOff className="w-4 h-4 shrink-0" />
      <span>
        no recording{' '}
        <span className="font-mono">{formatTimeRange(gap.range.start, gap.range.end)}</span>
      </span>
      <span className="text-xs text-amber-700 dark:text-amber-400">({gapCauseLabel(gap.cause)})</span>
    </li>
  )
}

export default function LedgerTimelineTab() {
  const [day, setDay] = useState(() => toDayString(new Date()))
  const range = useMemo(() => dayRange(day), [day])
  const { data, isLoading, error, isUnavailable } = useLedgerTimeline(range)

  const rows = useMemo(
    () => buildTimelineRows(data?.conversations ?? [], data?.gaps ?? []),
    [data]
  )

  return (
    <div className="space-y-4">
      <DayPicker day={day} onChange={setDay} />
      <LedgerQueryState error={error} isUnavailable={isUnavailable} />
      <LedgerPartialWarning answer={data} />
      {isLoading && <LedgerLoading label="Loading the day…" />}
      {data && rows.length === 0 && (
        <LedgerEmpty testId={ids.empty} title="Nothing on this day">
          No conversations and no capture gaps were recorded for this day.
        </LedgerEmpty>
      )}
      {rows.length > 0 && (
        <ol className="space-y-2" data-testid={ids.list}>
          {rows.map((row) =>
            row.type === 'gap' ? (
              <GapRow key={row.key} gap={row.gap} />
            ) : (
              <ConversationRow key={row.key} conversation={row.conversation} />
            )
          )}
        </ol>
      )}
    </div>
  )
}
