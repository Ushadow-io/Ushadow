/**
 * TabNavigation - Tab navigation for ServiceConfigsPage
 */

import { Activity, Database, HardDrive, Zap } from 'lucide-react'

export type TabType = 'services' | 'providers' | 'overview' | 'deployments'

interface Tab {
  id: TabType
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

interface TabNavigationProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  deploymentCount?: number
}

export default function TabNavigation({ activeTab, onTabChange, deploymentCount }: TabNavigationProps) {
  const tabs: Tab[] = [
    { id: 'services', label: 'Services', icon: Zap },
    { id: 'providers', label: 'Providers', icon: Database },
    { id: 'overview', label: 'System Overview', icon: Activity },
    {
      id: 'deployments',
      label: 'Deployments',
      icon: HardDrive,
      badge: deploymentCount,
    },
  ]

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-700">
      <nav className="flex gap-4" aria-label="View tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:hover:text-neutral-300'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.badge !== undefined && ` (${tab.badge})`}
              </div>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
