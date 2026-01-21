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
      if (config[key]) {
        return String(config[key])
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

export function useProviderConfigs(capability: string | null): UseProviderConfigsResult {
  const [templates, setTemplates] = useState<Template[]>([])
  const [configs, setConfigs] = useState<ServiceConfigSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch templates and configs for the capability
  const refresh = useCallback(async () => {
    if (!capability) {
      setTemplates([])
      setConfigs([])
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
  }, [capability])

  // Load data on mount and when capability changes
  useEffect(() => {
    refresh()
  }, [refresh])

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
        configSummary: undefined, // TODO: Load from config details if needed
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
