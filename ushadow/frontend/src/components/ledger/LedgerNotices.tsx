/**
 * Shared states of the Ledger tabs: service not running, request error,
 * partial answer warning, empty state.
 */

import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, RefreshCw, ServerOff, XCircle } from 'lucide-react'
import { ledger } from '../../testing/ui-contract'
import { ledgerErrorMessage, type LedgerAnswer } from '../../services/ledgerApi'
import { useLedgerRetry } from '../../hooks/useLedger'

/** The service may not be deployed yet: say so, and offer a retry. */
export function LedgerUnavailable() {
  const retry = useLedgerRetry()
  return (
    <div
      className="card p-8 flex flex-col items-center text-center gap-3"
      data-testid={ledger.unavailable}
    >
      <ServerOff className="w-10 h-10 text-neutral-400" />
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        Ledger service is not running or not reachable
      </h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md">
        The page gets its data from the <span className="font-mono">ledger</span> service. Deploy
        and start it on the Services page, then try again.
      </p>
      <button
        type="button"
        onClick={retry}
        className="btn-secondary flex items-center gap-2"
        data-testid={ledger.retry}
      >
        <RefreshCw className="w-4 h-4" />
        Try again
      </button>
    </div>
  )
}

/** A request failed, but the service answered (403, 422, 500, ...). */
export function LedgerError({ error }: { error: unknown }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300"
      data-testid={ledger.error}
      role="alert"
    >
      <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{ledgerErrorMessage(error)}</span>
    </div>
  )
}

/** Unavailable or error, whichever applies; nothing when there is no error. */
export function LedgerQueryState({ error, isUnavailable }: { error: unknown; isUnavailable: boolean }) {
  if (isUnavailable) return <LedgerUnavailable />
  if (error) return <LedgerError error={error} />
  return null
}

/** Small warning when a part (e.g. memory) could not answer, or scope removed items. */
export function LedgerPartialWarning({ answer }: { answer?: Pick<LedgerAnswer, 'partial' | 'partialReasons' | 'withheld'> }) {
  if (!answer || (!answer.partial && !answer.withheld)) return null
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
      data-testid={ledger.partialWarning}
      role="status"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <div className="min-w-0">
        {answer.partial && (
          <p>
            This answer is not complete
            {answer.partialReasons.length > 0 ? `: ${answer.partialReasons.join('; ')}` : '.'}
          </p>
        )}
        {answer.withheld > 0 && <p>{answer.withheld} item(s) are hidden by your access scope.</p>}
      </div>
    </div>
  )
}

export function LedgerEmpty({ testId, title, children }: { testId: string; title: string; children?: ReactNode }) {
  return (
    <div className="card p-8 flex flex-col items-center text-center gap-2" data-testid={testId}>
      <Inbox className="w-8 h-8 text-neutral-400" />
      <p className="font-medium text-neutral-900 dark:text-neutral-100">{title}</p>
      {children && <p className="text-sm text-neutral-600 dark:text-neutral-400">{children}</p>}
    </div>
  )
}

export function LedgerLoading({ label }: { label: string }) {
  return (
    <p className="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center" role="status">
      {label}
    </p>
  )
}
