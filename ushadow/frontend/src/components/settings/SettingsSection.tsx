/**
 * SettingsSection - Container for grouping related settings.
 *
 * Provides consistent styling and test IDs for settings groups
 * used in wizard steps, settings page, and service panels.
 */

import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'

export interface SettingsSectionProps {
  /** Unique identifier (used in test IDs) */
  id: string
  /** Section title */
  title: string
  /** Optional description */
  description?: string
  /** Optional icon */
  icon?: LucideIcon
  /** Child content (settings fields) */
  children: ReactNode
  /** Whether to show a card wrapper */
  card?: boolean
  /** Whether the section is collapsible */
  collapsible?: boolean
  /** Initial collapsed state */
  defaultCollapsed?: boolean
  /** Action buttons to render in header */
  actions?: ReactNode
}

export function SettingsSection({
  id,
  title,
  description,
  icon: Icon,
  children,
  card = true,
  collapsible: _collapsible = false, // Reserved for future implementation
  defaultCollapsed: _defaultCollapsed = false, // Reserved for future implementation
  actions,
}: SettingsSectionProps) {
  // Note: collapsible/defaultCollapsed props reserved for future accordion behavior
  void _collapsible
  void _defaultCollapsed
  const testId = `settings-section-${id}`

  const content = (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <Icon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
          )}
          <div>
            <h3
              className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
              data-testid={`${testId}-title`}
            >
              {title}
            </h3>
            {description && (
              <p
                className="text-sm text-neutral-500 dark:text-neutral-400"
                data-testid={`${testId}-description`}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="space-y-4" data-testid={`${testId}-content`}>
        {children}
      </div>
    </>
  )

  if (!card) {
    return (
      <section data-testid={testId} className="space-y-4">
        {content}
      </section>
    )
  }

  return (
    <section
      data-testid={testId}
      className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6"
    >
      {content}
    </section>
  )
}

export default SettingsSection
