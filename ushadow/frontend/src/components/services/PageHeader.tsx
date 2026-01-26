/**
 * PageHeader - Header for ServiceConfigsPage with title and actions
 */

import { Layers, Package, Plus, RefreshCw } from 'lucide-react'

interface PageHeaderProps {
  onOpenCatalog: () => void
  onRefresh: () => void
  showAddProvider?: boolean
  onAddProvider?: () => void
}

export default function PageHeader({
  onOpenCatalog,
  onRefresh,
  showAddProvider = false,
  onAddProvider,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center space-x-2">
          <Layers className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Services</h1>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700">
            BETA
          </span>
        </div>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Create and manage service instances from templates
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenCatalog}
          className="btn-primary flex items-center gap-2"
          data-testid="browse-services-button"
        >
          <Package className="h-4 w-4" />
          Browse Services
        </button>
        {showAddProvider && onAddProvider && (
          <button
            onClick={onAddProvider}
            className="btn-secondary flex items-center gap-2"
            data-testid="add-provider-button"
          >
            <Plus className="h-4 w-4" />
            Add Provider
          </button>
        )}
        <button onClick={onRefresh} className="btn-ghost p-2" title="Refresh" data-testid="instances-refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
