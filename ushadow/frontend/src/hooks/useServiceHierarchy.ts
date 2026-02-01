/**
 * useServiceHierarchy - Compute single vs multi-config groupings
 *
 * This hook determines how to display services:
 * - Single config services get a flat, simplified view
 * - Multi-config services get the hierarchical nested view
 */

import { useMemo } from 'react'
import type { Template, ServiceConfigSummary } from '../services/api'

// ============================================================================
// Types
// ============================================================================

export interface ServiceGroup {
  /** The template (service definition) */
  template: Template
  /** All configs (instances) for this template */
  configs: ServiceConfigSummary[]
  /** True if this service has only 0-1 configs (show flat view) */
  isSingleConfig: boolean
  /** The single config if isSingleConfig is true */
  singleConfig: ServiceConfigSummary | null
}

export interface ServiceHierarchyResult {
  /** Services grouped by template */
  groups: ServiceGroup[]
  /** Quick lookup: template ID -> configs */
  configsByTemplate: Map<string, ServiceConfigSummary[]>
  /** Services that consume capabilities (have requires) */
  consumers: ServiceGroup[]
  /** Services that provide capabilities (have provides) */
  providers: ServiceGroup[]
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Compute service hierarchy from templates and configs.
 *
 * This pure computation hook takes raw data and returns structured groupings
 * for display. It's designed to be called with data from the parent component,
 * not to fetch data itself.
 */
export function useServiceHierarchy(
  templates: Template[],
  configs: ServiceConfigSummary[]
): ServiceHierarchyResult {
  return useMemo(() => {
    // Build lookup map of configs by template ID
    const configsByTemplate = new Map<string, ServiceConfigSummary[]>()

    for (const config of configs) {
      const existing = configsByTemplate.get(config.template_id) || []
      existing.push(config)
      configsByTemplate.set(config.template_id, existing)
    }

    // Build service groups
    const groups: ServiceGroup[] = templates.map(template => {
      const templateConfigs = configsByTemplate.get(template.id) || []
      const isSingleConfig = templateConfigs.length <= 1

      return {
        template,
        configs: templateConfigs,
        isSingleConfig,
        singleConfig: isSingleConfig ? (templateConfigs[0] || null) : null,
      }
    })

    // Separate consumers (services with requires) from providers
    const consumers = groups.filter(g =>
      g.template.requires && g.template.requires.length > 0
    )

    const providers = groups.filter(g =>
      g.template.provides !== undefined && g.template.provides !== null
    )

    return {
      groups,
      configsByTemplate,
      consumers,
      providers,
    }
  }, [templates, configs])
}

/**
 * Filter service groups to only installed/enabled services.
 * Useful for showing only actionable services in the UI.
 */
export function useInstalledServices(
  templates: Template[],
  configs: ServiceConfigSummary[]
): ServiceHierarchyResult {
  // Filter to only installed templates
  const installedTemplates = useMemo(
    () => templates.filter(t => t.installed),
    [templates]
  )

  return useServiceHierarchy(installedTemplates, configs)
}

/**
 * Get a flat list of service cards to render.
 * Determines whether to show flat (single-config) or nested (multi-config) view.
 */
export interface ServiceCardInfo {
  type: 'flat' | 'nested'
  template: Template
  configs: ServiceConfigSummary[]
  singleConfig: ServiceConfigSummary | null
}

export function useServiceCards(
  templates: Template[],
  configs: ServiceConfigSummary[]
): ServiceCardInfo[] {
  const { groups } = useServiceHierarchy(templates, configs)

  return useMemo(() => {
    return groups.map(group => ({
      type: group.isSingleConfig ? 'flat' : 'nested',
      template: group.template,
      configs: group.configs,
      singleConfig: group.singleConfig,
    }))
  }, [groups])
}
