/**
 * One fact in the Ledger "Facts" tab.
 *
 * A fact with `heard === "unknown"` (only unknown speakers said it; it can be
 * media) is a beta evaluation feature: it MUST look clearly different (muted,
 * dashed border, "unknown speaker" badge) so the owner can judge it.
 */

import { HelpCircle, ThumbsDown, Trash2 } from 'lucide-react'
import { ledger } from '../../testing/ui-contract'
import type { LedgerItem } from '../../services/ledgerApi'
import { formatConfidence, formatDateTime } from './ledgerFormat'

export interface LedgerFactRowProps {
  fact: LedgerItem
  /** A write for this fact is running */
  busy?: boolean
  onWhy: (fact: LedgerItem) => void
  onForget: (fact: LedgerItem) => void
  onWrong: (fact: LedgerItem) => void
}

const ids = ledger.fact
const badge = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'
const actionButton =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

function FactBadges({ fact }: { fact: LedgerItem }) {
  const confidence = formatConfidence(fact.confidence)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {confidence && (
        <span
          className="text-xs font-mono text-neutral-500 dark:text-neutral-400"
          title="Confidence of memory in this fact"
          data-testid={ids.confidence(fact.id)}
        >
          {confidence}
        </span>
      )}
      {fact.heard === 'unknown' && (
        <span
          className={`${badge} border border-dashed border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300`}
          title="Only unknown speakers said this. It can be media (TV, radio, a video)."
          data-testid={ids.unknownSpeaker(fact.id)}
        >
          unknown speaker
        </span>
      )}
      {fact.heard === 'known' && (
        <span
          className={`${badge} bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300`}
          title="You or a recognised speaker said this"
          data-testid={ids.heard(fact.id)}
        >
          known speaker
        </span>
      )}
      {fact.validTo && (
        <span
          className={`${badge} bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300`}
          title={`Closed ${formatDateTime(fact.validTo)}`}
          data-testid={ids.closed(fact.id)}
        >
          no longer true
        </span>
      )}
      {fact.kind === 'action' && fact.subKind && (
        <span className={`${badge} bg-neutral-100 dark:bg-neutral-700/60 text-neutral-600 dark:text-neutral-300`}>
          {fact.subKind}
        </span>
      )}
    </div>
  )
}

export default function LedgerFactRow({ fact, busy = false, onWhy, onForget, onWrong }: LedgerFactRowProps) {
  const unknown = fact.heard === 'unknown'
  const closed = Boolean(fact.validTo)

  const container = unknown
    ? 'border-dashed border-amber-300 dark:border-amber-700 bg-neutral-50 dark:bg-neutral-900/40'
    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'
  const sentence = [
    unknown ? 'italic text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-neutral-100',
    closed ? 'line-through' : '',
  ].join(' ')

  return (
    <li
      className={`rounded-xl border p-4 ${container}`}
      data-testid={ids.row(fact.id)}
      data-heard={fact.heard ?? 'not-set'}
      data-closed={closed}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className={`break-words ${sentence}`}>{fact.text || '(no text)'}</p>
          <FactBadges fact={fact} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onWhy(fact)}
            className={`${actionButton} text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700`}
            data-testid={ids.why(fact.id)}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Why
          </button>
          <button
            type="button"
            onClick={() => onWrong(fact)}
            disabled={busy}
            className={`${actionButton} text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20`}
            title="This fact is wrong: retract it"
            data-testid={ids.wrong(fact.id)}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            Wrong
          </button>
          <button
            type="button"
            onClick={() => onForget(fact)}
            disabled={busy}
            className={`${actionButton} text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}
            title="Forget this fact; memory will not make it again"
            data-testid={ids.forget(fact.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Forget
          </button>
        </div>
      </div>
    </li>
  )
}
