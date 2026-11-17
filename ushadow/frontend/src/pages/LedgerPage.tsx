/**
 * LedgerPage - what the ledger service knows about the signed-in user.
 *
 * Tabs: Timeline (conversations and capture gaps of a day), Facts (search,
 * why, wrong, forget) and Known names (the word list).
 * Behind the feature flag `ledger_memory`.
 */

import { useState } from 'react'
import { BookOpenCheck, CalendarDays, ListChecks, Tags } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ledger, page, tabs } from '../testing/ui-contract'
import LedgerTimelineTab from '../components/ledger/LedgerTimelineTab'
import LedgerFactsTab from '../components/ledger/LedgerFactsTab'
import LedgerKnownNamesTab from '../components/ledger/LedgerKnownNamesTab'

type LedgerTabId = (typeof ledger.tabs)[keyof typeof ledger.tabs]

const TABS: { id: LedgerTabId; label: string; icon: LucideIcon }[] = [
  { id: ledger.tabs.timeline, label: 'Timeline', icon: CalendarDays },
  { id: ledger.tabs.facts, label: 'Facts', icon: ListChecks },
  { id: ledger.tabs.knownNames, label: 'Known names', icon: Tags },
]

export default function LedgerPage() {
  const [activeTab, setActiveTab] = useState<LedgerTabId>(ledger.tabs.timeline)

  return (
    <div className="space-y-6" data-testid={page.container(ledger.pageName)}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
          <BookOpenCheck className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Ledger</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Your conversations and facts, each with its proof
          </p>
        </div>
      </div>

      <div
        className="flex items-center gap-4 border-b border-neutral-200 dark:border-neutral-700"
        role="tablist"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            data-testid={tabs.button(id)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === id
                ? 'border-primary-500 text-neutral-900 dark:text-neutral-100'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" data-testid={tabs.panel(activeTab)}>
        {activeTab === ledger.tabs.timeline && <LedgerTimelineTab />}
        {activeTab === ledger.tabs.facts && <LedgerFactsTab />}
        {activeTab === ledger.tabs.knownNames && <LedgerKnownNamesTab />}
      </div>
    </div>
  )
}
