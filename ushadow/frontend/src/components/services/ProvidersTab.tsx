/**
 * ProvidersTab - Providers tab content with grouped provider cards
 */

import { Database } from 'lucide-react'
import { useMemo } from 'react'
import ProviderCard from './ProviderCard'
import EmptyState from './EmptyState'
import { EnvVarInfo, EnvVarConfig, Template } from '../../services/api'

interface ProvidersTabProps {
  providers: Template[]
  expandedProviderId: string | null
  onToggleExpand: (providerId: string) => void
  envVars: EnvVarInfo[]
  envConfigs: Record<string, EnvVarConfig>
  onEnvConfigChange: (envVarName: string, updates: Partial<EnvVarConfig>) => void
  onCancel: () => void
  onSave: (providerId: string) => void
  isLoading: boolean
  isSaving: boolean
}

export default function ProvidersTab({
  providers,
  expandedProviderId,
  onToggleExpand,
  envVars,
  envConfigs,
  onEnvConfigChange,
  onCancel,
  onSave,
  isLoading,
  isSaving,
}: ProvidersTabProps) {
  // Group providers by capability type
  const groupedProviders = useMemo(() => {
    const configuredProviders = providers.filter((p) => p.configured)
    const grouped = configuredProviders.reduce(
      (acc, provider) => {
        const capability = provider.provides || 'other'
        if (!acc[capability]) acc[capability] = []
        acc[capability].push(provider)
        return acc
      },
      {} as Record<string, typeof configuredProviders>
    )

    const capabilityOrder = ['llm', 'transcription', 'memory', 'embedding', 'tts', 'other']
    const sortedCapabilities = Object.keys(grouped).sort((a, b) => {
      const aIndex = capabilityOrder.indexOf(a)
      const bIndex = capabilityOrder.indexOf(b)
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })

    return { grouped, sortedCapabilities }
  }, [providers])

  if (groupedProviders.sortedCapabilities.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No providers configured yet."
        subtitle="Configure a provider from a service's dropdown to see it here."
      />
    )
  }

  return (
    <div className="space-y-6">
      {groupedProviders.sortedCapabilities.map((capability) => (
        <div key={capability} data-testid={`provider-group-${capability}`}>
          <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
            {capability}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {groupedProviders.grouped[capability].map((provider) => {
              const isExpanded = expandedProviderId === provider.id
              return (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  isExpanded={isExpanded}
                  onToggleExpand={() => onToggleExpand(provider.id)}
                  envVars={isExpanded ? envVars : []}
                  envConfigs={envConfigs}
                  onEnvConfigChange={onEnvConfigChange}
                  onCancel={onCancel}
                  onSave={() => onSave(provider.id)}
                  isLoading={isLoading}
                  isSaving={isSaving}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
