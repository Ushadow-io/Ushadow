/**
 * useProviderConfigs - Fetch and manage provider configurations for a capability
 *
 * This hook handles:
 * - Fetching provider templates for a specific capability
 * - Fetching existing ServiceConfigs
 * - Grouping configs into "defaults" (templates) and "saved" (user configs)
 * - CRUD operations for configs
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  svcConfigsApi,
  Template,
  ServiceConfigSummary,
  ServiceConfig,
  ServiceConfigCreateRequest,
} from '../services/api'

// ============================================================================
// Types
// ============================================================================

export interface ProviderOption {
  id: string
  name: string
  description?: string
  isDefault: boolean // true for templates shown as defaults
  templateId: string
  mode?: 'cloud' | 'local'
  configured: boolean
  configSummary?: string // e.g., "gpt-4o" for model selection
}

export interface GroupedProviders {
  defaults: ProviderOption[]
  saved: ProviderOption[]
}

export interface CreateConfigData {
  templateId: string
  name?: string
  config?: Record<string, any>
  saveAsReusable?: boolean
}

export interface UseProviderConfigsResult {
  // Data
  templates: Template[]
  configs: ServiceConfigSummary[]
  grouped: GroupedProviders
  loading: boolean
  error: string | null

  // Actions
  selectConfig: (configId: string, targetId: string, capability: string) => Promise<void>
  createConfig: (data: CreateConfigData) => Promise<ServiceConfig>
  refresh: () => Promise<void>
}

/**
 * Options for useProviderConfigs hook
 */
export interface UseProviderConfigsOptions {
  /** Pre-fetched templates (avoids duplicate API call) */
  initialTemplates?: Template[]
  /** Pre-fetched configs (avoids duplicate API call) */
  initialConfigs?: ServiceConfigSummary[]
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a summary of the config (e.g., model name) for display
 */
function getConfigSummary(template: Template, config?: Record<string, any>): string | undefined {
  // Look for common summary fields
  const summaryKeys = ['model', 'llm_model', 'model_id', 'model_name']

  if (config) {
    for (const key of summaryKeys) {
      const val = config[key]
      if (typeof val === 'string' && val) {
        return val
      }
    }
  }

  // Fall back to template default
  if (template.config_schema) {
    for (const field of template.config_schema) {
      if (summaryKeys.includes(field.key) && field.default) {
        return field.default
      }
    }
  }

  return undefined
}

/**
 * Generate a unique config ID
 */
function generateConfigId(templateId: string, existingIds: string[]): string {
  const baseName = templateId.includes(':')
    ? templateId.split(':').pop()!
    : templateId

  const numbers = existingIds
    .filter(id => id.startsWith(`${baseName}-`))
    .map(id => {
      const match = id.match(new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`))
      return match ? parseInt(match[1], 10) : 0
    })
    .filter(n => n > 0)

  const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
  return `${baseName}-${nextNum}`
}

// ============================================================================
// Hook
// ============================================================================

export function useProviderConfigs(
  capability: string | null,
  options?: UseProviderConfigsOptions
): UseProviderConfigsResult {
  const { initialTemplates, initialConfigs } = options || {}

  // Check if we have pre-fetched data
  const hasInitialData = Boolean(initialTemplates && initialConfigs)

  // Memoize filtered data to avoid recalculating on every render
  const filteredInitial = useMemo(() => {
    if (!capability || !hasInitialData) return null

    // Filter templates that provide this capability
    const capabilityTemplates = initialTemplates!.filter(
      t => t.provides === capability && t.source === 'provider'
    )
    // Filter configs that are based on capability templates
    const templateIds = new Set(capabilityTemplates.map(t => t.id))
    const capabilityConfigs = initialConfigs!.filter(
      c => templateIds.has(c.template_id)
    )
    return { templates: capabilityTemplates, configs: capabilityConfigs }
  }, [capability, hasInitialData, initialTemplates, initialConfigs])

  const [templates, setTemplates] = useState<Template[]>(filteredInitial?.templates || [])
  const [configs, setConfigs] = useState<ServiceConfigSummary[]>(filteredInitial?.configs || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Update state when initial data changes (prop updates)
  useEffect(() => {
    if (filteredInitial) {
      setTemplates(filteredInitial.templates)
      setConfigs(filteredInitial.configs)
    }
  }, [filteredInitial])

  // Fetch templates and configs for the capability (only if no initial data)
  const refresh = useCallback(async () => {
    if (!capability) {
      setTemplates([])
      setConfigs([])
      return
    }

    // Skip fetch if we have initial data from parent - just re-filter
    if (hasInitialData && filteredInitial) {
      setTemplates(filteredInitial.templates)
      setConfigs(filteredInitial.configs)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch all templates and filter by capability
      const [templatesRes, configsRes] = await Promise.all([
        svcConfigsApi.getTemplates('provider'),
        svcConfigsApi.getServiceConfigs(),
      ])

      // Filter templates that provide this capability
      const capabilityTemplates = templatesRes.data.filter(
        t => t.provides === capability
      )

      // Filter configs that are based on capability templates
      const templateIds = new Set(capabilityTemplates.map(t => t.id))
      const capabilityConfigs = configsRes.data.filter(
        c => templateIds.has(c.template_id)
      )

      setTemplates(capabilityTemplates)
      setConfigs(capabilityConfigs)
    } catch (err: any) {
      console.error('Failed to fetch provider configs:', err)
      setError(err.response?.data?.detail || 'Failed to load provider configurations')
    } finally {
      setLoading(false)
    }
  }, [capability, hasInitialData, filteredInitial])

  // Load data on mount and when capability changes (only if no initial data)
  useEffect(() => {
    if (!hasInitialData) {
      refresh()
    }
  }, [hasInitialData, refresh])

  // Group templates and configs into dropdown options
  const grouped = useMemo((): GroupedProviders => {
    // Templates as "defaults"
    const defaults: ProviderOption[] = templates.map(t => ({
      id: `template:${t.id}`,
      name: t.name,
      description: t.description,
      isDefault: true,
      templateId: t.id,
      mode: t.mode,
      configured: t.configured,
      configSummary: getConfigSummary(t),
    }))

    // Configs as "saved"
    const saved: ProviderOption[] = configs.map(c => {
      const template = templates.find(t => t.id === c.template_id)
      return {
        id: c.id,
        name: c.name,
        description: template?.description,
        isDefault: false,
        templateId: c.template_id,
        mode: template?.mode,
        configured: true, // If it exists as a config, it's been configured
        configSummary: template ? getConfigSummary(template, c.config) : undefined,
      }
    })

    return { defaults, saved }
  }, [templates, configs])

  // Select a config (create wiring)
  const selectConfig = useCallback(async (
    configId: string,
    targetId: string,
    targetCapability: string
  ) => {
    // If selecting a template (default), we need to create a ServiceConfig first
    let actualConfigId = configId

    if (configId.startsWith('template:')) {
      const templateId = configId.replace('template:', '')
      const template = templates.find(t => t.id === templateId)
      if (!template) {
        throw new Error('Template not found')
      }

      // Create a config from the template
      const newConfigId = generateConfigId(templateId, configs.map(c => c.id))
      const createData: ServiceConfigCreateRequest = {
        id: newConfigId,
        template_id: templateId,
        name: newConfigId,
        deployment_target: template.mode === 'cloud' ? 'cloud' : 'local',
        config: {},
      }

      const result = await svcConfigsApi.createServiceConfig(createData)
      actualConfigId = result.data.id
    }

    // Create wiring connection
    await svcConfigsApi.createWiring({
      source_config_id: actualConfigId,
      source_capability: capability!,
      target_config_id: targetId,
      target_capability: targetCapability,
    })

    // Refresh to get updated configs
    await refresh()
  }, [capability, templates, configs, refresh])

  // Create a new config
  const createConfig = useCallback(async (data: CreateConfigData): Promise<ServiceConfig> => {
    const template = templates.find(t => t.id === data.templateId)
    if (!template) {
      throw new Error('Template not found')
    }

    const newConfigId = data.name || generateConfigId(data.templateId, configs.map(c => c.id))
    const createData: ServiceConfigCreateRequest = {
      id: newConfigId,
      template_id: data.templateId,
      name: newConfigId,
      deployment_target: template.mode === 'cloud' ? 'cloud' : 'local',
      config: data.config || {},
    }

    const result = await svcConfigsApi.createServiceConfig(createData)

    // Refresh to get updated configs
    await refresh()

    return result.data
  }, [templates, configs, refresh])

  return {
    templates,
    configs,
    grouped,
    loading,
    error,
    selectConfig,
    createConfig,
    refresh,
  }
}
