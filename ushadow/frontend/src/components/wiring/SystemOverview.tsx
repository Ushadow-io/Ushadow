/**
 * SystemOverview - Read-only visualization of service wiring
 *
 * Shows the system architecture as a dependency list:
 * - Groups by provider, showing which services use each
 * - Indicates connection status and configuration state
 * - Click to highlight/navigate to specific configs
 */

import { useMemo } from 'react'
import {
  Cloud,
  HardDrive,
  AlertCircle,
  CheckCircle,
  Circle,
  ArrowRight,
  Package,
} from 'lucide-react'
import type { Template, ServiceConfigSummary, Wiring } from '../../services/api'

// ============================================================================
// Types
// ============================================================================

export interface SystemOverviewProps {
  /** All templates */
  templates: Template[]
  /** All configs */
  configs: ServiceConfigSummary[]
  /** All wiring connections */
  wiring: Wiring[]
  /** Called when a provider is clicked */
  onProviderClick?: (providerId: string) => void
  /** Called when a consumer is clicked */
  onConsumerClick?: (consumerId: string) => void
}

interface ProviderUsage {
  provider: {
    id: string
    name: string
    capability: string
    mode?: 'cloud' | 'local'
    configured: boolean
    isTemplate: boolean
  }
  consumers: Array<{
    id: string
    name: string
    capability: string
    status: string
  }>
}

interface UnwiredCapability {
  consumerId: string
  consumerName: string
  capability: string
  status: string
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusIcon(status: string) {
  switch (status) {
    case 'running':
      return <CheckCircle className="h-3.5 w-3.5 text-success-500" />
    case 'configured':
    case 'ready':
      return <CheckCircle className="h-3.5 w-3.5 text-success-400" />
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 text-error-500" />
    default:
      return <Circle className="h-3.5 w-3.5 text-neutral-400" />
  }
}

// ============================================================================
// Component
// ============================================================================

export function SystemOverview({
  templates,
  configs,
  wiring,
  onProviderClick,
  onConsumerClick,
}: SystemOverviewProps) {
  // Build provider usage map
  const { providerUsages, unwiredCapabilities, stats } = useMemo(() => {
    const usageMap = new Map<string, ProviderUsage>()
    const unwired: UnwiredCapability[] = []

    // Build template and config lookups
    const templateById = new Map(templates.map(t => [t.id, t]))
    const configById = new Map(configs.map(c => [c.id, c]))

    // Find all consumers (services that require capabilities)
    const consumerTemplates = templates.filter(t => t.requires && t.requires.length > 0)

    // Process wiring to build provider usage
    for (const wire of wiring) {
      const sourceConfig = configById.get(wire.source_config_id)
      const targetConfig = configById.get(wire.target_config_id)
      const sourceTemplate = sourceConfig
        ? templateById.get(sourceConfig.template_id)
        : templateById.get(wire.source_config_id)
      const targetTemplate = targetConfig
        ? templateById.get(targetConfig.template_id)
        : templateById.get(wire.target_config_id)

      if (!sourceTemplate) continue

      const providerId = sourceConfig?.id || wire.source_config_id
      const providerName = sourceConfig?.name || sourceTemplate.name

      if (!usageMap.has(providerId)) {
        usageMap.set(providerId, {
          provider: {
            id: providerId,
            name: providerName,
            capability: wire.source_capability,
            mode: sourceTemplate.mode,
            configured: sourceTemplate.configured,
            isTemplate: !sourceConfig,
          },
          consumers: [],
        })
      }

      usageMap.get(providerId)!.consumers.push({
        id: wire.target_config_id,
        name: targetConfig?.name || targetTemplate?.name || wire.target_config_id,
        capability: wire.target_capability,
        status: targetConfig?.status || 'pending',
      })
    }

    // Find unwired capabilities
    for (const template of consumerTemplates) {
      const templateConfigs = configs.filter(c => c.template_id === template.id)
      const consumersToCheck = templateConfigs.length > 0
        ? templateConfigs.map(c => ({ id: c.id, name: c.name, status: c.status }))
        : [{ id: template.id, name: template.name, status: 'pending' }]

      for (const consumer of consumersToCheck) {
        for (const cap of template.requires) {
          const isWired = wiring.some(
            w => w.target_config_id === consumer.id && w.target_capability === cap
          )
          if (!isWired) {
            unwired.push({
              consumerId: consumer.id,
              consumerName: consumer.name,
              capability: cap,
              status: consumer.status,
            })
          }
        }
      }
    }

    // Calculate stats
    const totalProviders = usageMap.size
    const totalConsumers = new Set(wiring.map(w => w.target_config_id)).size
    const totalConnections = wiring.length
    const totalUnwired = unwired.length

    return {
      providerUsages: Array.from(usageMap.values()),
      unwiredCapabilities: unwired,
      stats: { totalProviders, totalConsumers, totalConnections, totalUnwired },
    }
  }, [templates, configs, wiring])

  // Render a provider section
  const renderProvider = (usage: ProviderUsage) => {
    const ModeIcon = usage.provider.mode === 'cloud' ? Cloud : HardDrive

    return (
      <div
        key={usage.provider.id}
        className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden"
      >
        {/* Provider header */}
        <button
          onClick={() => onProviderClick?.(usage.provider.id)}
          className="w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-750 transition-colors"
          data-testid={`overview-provider-${usage.provider.id}`}
        >
          <div className="flex items-center gap-2">
            <ModeIcon className="h-4 w-4 text-neutral-500" />
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {usage.provider.name}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
              {usage.provider.capability}
            </span>
            {usage.provider.isTemplate && (
              <span className="text-xs text-neutral-400">(default)</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <span>{usage.consumers.length} connection{usage.consumers.length !== 1 ? 's' : ''}</span>
            {usage.provider.configured ? (
              <CheckCircle className="h-4 w-4 text-success-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-warning-500" />
            )}
          </div>
        </button>

        {/* Consumer list */}
        {usage.consumers.length > 0 && (
          <div className="px-4 py-2 space-y-1 bg-white dark:bg-neutral-900">
            {usage.consumers.map((consumer, idx) => (
              <button
                key={`${consumer.id}-${consumer.capability}-${idx}`}
                onClick={() => onConsumerClick?.(consumer.id)}
                className="w-full flex items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-sm"
                data-testid={`overview-consumer-${consumer.id}`}
              >
                <ArrowRight className="h-3 w-3 text-neutral-400 flex-shrink-0" />
                {getStatusIcon(consumer.status)}
                <span className="text-neutral-700 dark:text-neutral-300 truncate">
                  {consumer.name}
                </span>
                <span className="text-xs text-neutral-400 truncate">
                  ({consumer.capability})
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Render unwired capabilities warning
  const renderUnwired = () => {
    if (unwiredCapabilities.length === 0) return null

    return (
      <div className="border border-warning-300 dark:border-warning-700 bg-warning-50 dark:bg-warning-900/20 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="h-4 w-4 text-warning-600 dark:text-warning-400" />
          <span className="font-medium text-warning-800 dark:text-warning-200">
            Unwired Capabilities ({unwiredCapabilities.length})
          </span>
        </div>
        <div className="space-y-1">
          {unwiredCapabilities.map((item, idx) => (
            <button
              key={`${item.consumerId}-${item.capability}-${idx}`}
              onClick={() => onConsumerClick?.(item.consumerId)}
              className="w-full flex items-center gap-2 py-1 px-2 -mx-2 rounded hover:bg-warning-100 dark:hover:bg-warning-900/30 transition-colors text-sm text-left"
            >
              <Package className="h-3 w-3 text-warning-500 flex-shrink-0" />
              <span className="text-warning-800 dark:text-warning-200 truncate">
                {item.consumerName}
              </span>
              <span className="text-xs text-warning-600 dark:text-warning-400">
                needs {item.capability}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="system-overview">
      {/* Stats bar */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-neutral-400" />
          <span className="text-neutral-600 dark:text-neutral-400">
            {stats.totalProviders} provider{stats.totalProviders !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-neutral-400" />
          <span className="text-neutral-600 dark:text-neutral-400">
            {stats.totalConsumers} service{stats.totalConsumers !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-neutral-400" />
          <span className="text-neutral-600 dark:text-neutral-400">
            {stats.totalConnections} connection{stats.totalConnections !== 1 ? 's' : ''}
          </span>
        </div>
        {stats.totalUnwired > 0 && (
          <div className="flex items-center gap-2 text-warning-600 dark:text-warning-400">
            <AlertCircle className="h-4 w-4" />
            <span>{stats.totalUnwired} unwired</span>
          </div>
        )}
      </div>

      {/* Unwired warnings */}
      {renderUnwired()}

      {/* Provider sections */}
      {providerUsages.length === 0 && unwiredCapabilities.length === 0 ? (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No services configured yet.</p>
          <p className="text-sm mt-1">
            Add services and connect providers to see the system overview.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {providerUsages.map(renderProvider)}
        </div>
      )}
    </div>
  )
}

export default SystemOverview
