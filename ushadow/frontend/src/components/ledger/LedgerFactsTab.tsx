/**
 * Ledger "Facts" tab: search facts, see why each exists, mark it wrong or forget it.
 */

import { useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import ConfirmDialog from '../ConfirmDialog'
import { ledger } from '../../testing/ui-contract'
import { useLedgerSearch } from '../../hooks/useLedger'
import { useLedgerFactActions } from '../../hooks/useLedgerFactActions'
import type { LedgerItem } from '../../services/ledgerApi'
import LedgerFactRow from './LedgerFactRow'
import LedgerWhyModal from './LedgerWhyModal'
import { LedgerEmpty, LedgerLoading, LedgerPartialWarning, LedgerQueryState } from './LedgerNotices'

const ids = ledger.facts

interface SearchFormProps {
  includeClosed: boolean
  onIncludeClosedChange: (value: boolean) => void
  onSearch: (query: string) => void
}

function SearchForm({ includeClosed, onIncludeClosedChange, onSearch }: SearchFormProps) {
  const [text, setText] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSearch(text.trim())
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3" data-testid={ids.form}>
      <div className="relative flex-1 min-w-[16rem]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Search facts, e.g. a name or a topic"
          aria-label="Search facts"
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          data-testid={ids.queryField}
        />
      </div>
      <button
        type="submit"
        disabled={text.trim().length === 0}
        className="btn-primary"
        data-testid={ids.search}
      >
        Search
      </button>
      <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
        <input
          type="checkbox"
          checked={includeClosed}
          onChange={(e) => onIncludeClosedChange(e.target.checked)}
          data-testid={ids.includeClosed}
        />
        Show facts that are no longer true
      </label>
    </form>
  )
}

export default function LedgerFactsTab() {
  const [query, setQuery] = useState('')
  const [includeClosed, setIncludeClosed] = useState(true)
  const [whyFact, setWhyFact] = useState<LedgerItem | null>(null)
  const [forgetFact, setForgetFact] = useState<LedgerItem | null>(null)

  const { data, isFetching, error, isUnavailable } = useLedgerSearch(query, includeClosed)
  const { retract, forget, pendingFactId } = useLedgerFactActions()
  const facts = data?.items ?? []

  const confirmForget = () => {
    if (forgetFact) forget(forgetFact.id)
    setForgetFact(null)
  }

  return (
    <div className="space-y-4">
      <SearchForm
        includeClosed={includeClosed}
        onIncludeClosedChange={setIncludeClosed}
        onSearch={setQuery}
      />
      <LedgerQueryState error={error} isUnavailable={isUnavailable} />
      <LedgerPartialWarning answer={data} />
      {isFetching && !data && <LedgerLoading label="Searching…" />}
      {!query && !error && (
        <LedgerEmpty testId={ids.empty} title="Search your facts">
          Type a name or a topic to see what memory knows, with the proof of each fact.
        </LedgerEmpty>
      )}
      {query && data && facts.length === 0 && (
        <LedgerEmpty testId={ids.empty} title="No facts found">
          Nothing matches “{query}”.
        </LedgerEmpty>
      )}
      {facts.length > 0 && (
        <ul className="space-y-2" data-testid={ids.list}>
          {facts.map((fact) => (
            <LedgerFactRow
              key={fact.id}
              fact={fact}
              busy={pendingFactId === fact.id}
              onWhy={setWhyFact}
              onWrong={(item) => retract(item.id)}
              onForget={setForgetFact}
            />
          ))}
        </ul>
      )}

      <LedgerWhyModal fact={whyFact} onClose={() => setWhyFact(null)} />
      <ConfirmDialog
        isOpen={forgetFact !== null}
        title="Forget this fact?"
        message={`“${forgetFact?.text ?? ''}” will be removed from memory and will not be made again. This cannot be undone.`}
        confirmLabel="Forget"
        variant="danger"
        onConfirm={confirmForget}
        onCancel={() => setForgetFact(null)}
      />
    </div>
  )
}
