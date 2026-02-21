/**
 * ProvidersTab - Providers tab content with grouped provider cards
 */

import { AlertCircle, Database } from 'lucide-react'
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
  const { grouped, sortedCapabilities, needsSetupCount } = useMemo(() => {
    // Show configured providers and installed-but-unconfigured ones (not unrelated providers)
    const relevant = providers.filter((p) => p.configured || p.installed)

    const capabilityOrder = ['llm', 'transcription', 'memory', 'embedding', 'tts', 'other']

    const grp = relevant.reduce(
      (acc, provider) => {
        const capability = provider.provides || 'other'
        if (!acc[capability]) acc[capability] = []
        acc[capability].push(provider)
        return acc
      },
      {} as Record<string, Template[]>
    )

    const sorted = Object.keys(grp).sort((a, b) => {
      const aIndex = capabilityOrder.indexOf(a)
      const bIndex = capabilityOrder.indexOf(b)
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })

    return {
      grouped: grp,
      sortedCapabilities: sorted,
      needsSetupCount: relevant.filter((p) => !p.configured).length,
    }
  }, [providers])

  if (sortedCapabilities.length === 0) {
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
      {needsSetupCount > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300"
          data-testid="providers-needs-setup-banner"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {needsSetupCount === 1
            ? '1 provider needs configuration.'
            : `${needsSetupCount} providers need configuration.`}
        </div>
      )}
      {sortedCapabilities.map((capability) => (
        <div key={capability} data-testid={`provider-group-${capability}`}>
          <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
            {capability}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {grouped[capability].map((provider) => {
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
