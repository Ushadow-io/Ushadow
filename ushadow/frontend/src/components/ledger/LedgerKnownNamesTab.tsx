/**
 * Ledger "Known names" tab: the word list (names the system must recognise),
 * with a form to add an entry and a button to remove one.
 */

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import ConfirmDialog from '../ConfirmDialog'
import { ledger } from '../../testing/ui-contract'
import { useKnownEntities } from '../../hooks/useKnownEntities'
import type { KnownEntity } from '../../services/ledgerApi'
import LedgerKnownNameForm from './LedgerKnownNameForm'
import { LedgerEmpty, LedgerLoading, LedgerQueryState } from './LedgerNotices'

const ids = ledger.knownNames
const cell = 'px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300'
const headCell = 'px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400'

interface KnownNamesTableProps {
  entities: KnownEntity[]
  disabled: boolean
  onRemove: (entity: KnownEntity) => void
}

function KnownNamesTable({ entities, disabled, onRemove }: KnownNamesTableProps) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full" data-testid={ids.table}>
        <thead className="border-b border-neutral-200 dark:border-neutral-700">
          <tr>
            <th className={headCell}>Name</th>
            <th className={headCell}>Other names</th>
            <th className={headCell}>Type</th>
            <th className={headCell}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
          {entities.map((entity) => (
            <tr key={entity.id} data-testid={ids.row(entity.id)}>
              <td className={`${cell} font-medium text-neutral-900 dark:text-neutral-100`}>
                {entity.name}
              </td>
              <td className={cell}>{entity.aliases.join(', ') || '—'}</td>
              <td className={cell}>{entity.type ?? '—'}</td>
              <td className={`${cell} text-right`}>
                <button
                  type="button"
                  onClick={() => onRemove(entity)}
                  disabled={disabled}
                  aria-label={`Remove ${entity.name}`}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={ids.remove(entity.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function LedgerKnownNamesTab() {
  const { entities, isLoading, error, isUnavailable, add, isAdding, remove, isRemoving } =
    useKnownEntities()
  const [toRemove, setToRemove] = useState<KnownEntity | null>(null)

  const confirmRemove = () => {
    if (toRemove) remove(toRemove.name)
    setToRemove(null)
  }

  if (isUnavailable) return <LedgerQueryState error={error} isUnavailable />

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Names the system must recognise. A fact that says one of the other names is joined to the
        name.
      </p>
      <LedgerKnownNameForm onAdd={add} isAdding={isAdding} />
      <LedgerQueryState error={error} isUnavailable={false} />
      {isLoading && <LedgerLoading label="Loading known names…" />}
      {!isLoading && !error && entities.length === 0 && (
        <LedgerEmpty testId={ids.empty} title="No known names yet">
          Add the names of people, places and things you talk about.
        </LedgerEmpty>
      )}
      {entities.length > 0 && (
        <KnownNamesTable entities={entities} disabled={isRemoving} onRemove={setToRemove} />
      )}

      <ConfirmDialog
        isOpen={toRemove !== null}
        title="Remove this name?"
        message={`“${toRemove?.name ?? ''}” will be removed from the known names.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </div>
  )
}
