/**
 * "Why" of a fact: its evidence quotes, the conversations they come from and
 * the decisions (who decided what), from GET /v1/why.
 */

import Modal from '../Modal'
import { ledger } from '../../testing/ui-contract'
import { useLedgerWhy } from '../../hooks/useLedger'
import { isLedgerUnavailable } from '../../services/ledgerApi'
import type { LedgerEvidence, LedgerItem, LedgerWhyStep } from '../../services/ledgerApi'
import { formatDateTime, formatTimeRange } from './ledgerFormat'
import { LedgerLoading, LedgerPartialWarning, LedgerQueryState } from './LedgerNotices'

const heading = 'text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2'
const muted = 'text-xs text-neutral-500 dark:text-neutral-400'

function EvidenceList({ evidence }: { evidence: LedgerEvidence[] }) {
  if (evidence.length === 0) return <p className={muted}>No evidence was given for this fact.</p>
  return (
    <ul className="space-y-2">
      {evidence.map((ref, index) => (
        <li
          key={`${ref.recordingId}-${ref.range.start}-${index}`}
          className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3"
          data-testid={`${ledger.facts.whyModal}-evidence-${index}`}
        >
          {ref.quote ? (
            <blockquote className="text-sm text-neutral-800 dark:text-neutral-200 break-words">
              “{ref.quote}”
            </blockquote>
          ) : (
            <p className={muted}>(no quote)</p>
          )}
          <p className={`mt-1 ${muted}`}>
            {formatDateTime(ref.range.start)} ({formatTimeRange(ref.range.start, ref.range.end)}) ·
            recording <span className="font-mono">{ref.recordingId}</span>
          </p>
        </li>
      ))}
    </ul>
  )
}

function ConversationList({ conversations }: { conversations: LedgerItem[] }) {
  if (conversations.length === 0) return null
  return (
    <section>
      <h3 className={heading}>From these conversations</h3>
      <ul className="space-y-1">
        {conversations.map((conversation) => (
          <li key={conversation.id} className="text-sm text-neutral-700 dark:text-neutral-300">
            {conversation.text || 'Untitled conversation'}{' '}
            <span className={muted}>{formatDateTime(conversation.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function StepList({ steps }: { steps: LedgerWhyStep[] }) {
  if (steps.length === 0) return <p className={muted}>No decisions were recorded.</p>
  return (
    <ul className="space-y-2">
      {steps.map((step, index) => {
        const words = step.text || step.link?.reason
        return (
          <li
            key={`${step.role}-${index}`}
            className="text-sm text-neutral-700 dark:text-neutral-300"
            data-testid={`${ledger.facts.whyModal}-step-${index}`}
          >
            <span className="font-medium">{step.role.replace(/_/g, ' ')}</span>
            {' · decided by '}
            <span className="font-medium">{step.decidedBy}</span>
            {step.source && step.source !== step.decidedBy && ` (${step.source})`}
            {step.at && <span className={muted}> · {formatDateTime(step.at)}</span>}
            {words && <p className={`mt-0.5 ${muted}`}>{words}</p>}
          </li>
        )
      })}
    </ul>
  )
}

export interface LedgerWhyModalProps {
  /** The fact to explain; null = closed */
  fact: LedgerItem | null
  onClose: () => void
}

export default function LedgerWhyModal({ fact, onClose }: LedgerWhyModalProps) {
  const { data, isLoading, error } = useLedgerWhy(fact?.id ?? null)
  // The search answer already has evidence; /v1/why is the full proof
  const evidence = data?.item?.evidence ?? fact?.evidence ?? []

  return (
    <Modal
      isOpen={fact !== null}
      onClose={onClose}
      title="Why this fact"
      maxWidth="2xl"
      testId={ledger.facts.whyModal}
    >
      <div className="space-y-5">
        <p className="text-neutral-900 dark:text-neutral-100 break-words">{fact?.text}</p>
        <LedgerQueryState error={error} isUnavailable={isLedgerUnavailable(error)} />
        <LedgerPartialWarning answer={data} />
        {isLoading && <LedgerLoading label="Loading the proof…" />}
        <section>
          <h3 className={heading}>Evidence</h3>
          <EvidenceList evidence={evidence} />
        </section>
        {data && (
          <>
            <ConversationList conversations={data.conversations} />
            <section>
              <h3 className={heading}>Decisions</h3>
              <StepList steps={data.steps} />
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}
