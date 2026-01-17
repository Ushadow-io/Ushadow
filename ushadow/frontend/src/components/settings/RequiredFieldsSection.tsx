/**
 * RequiredFieldsSection - Display and edit required API keys and settings
 *
 * Uses the shared RequiredFieldsForm component for consistency with the wizard.
 * Provides save/refresh actions specific to the settings page context.
 */

import { useState, useEffect } from 'react'
import { Save, RefreshCw } from 'lucide-react'

import { quickstartApi, type CapabilityRequirement } from '../../services/api'
import { RequiredFieldsForm } from '../forms'
import { useWizardForm } from '../../contexts/WizardFormContext'

interface RequiredFieldsSectionProps {
  onSave?: () => void
}

export function RequiredFieldsSection({ onSave }: RequiredFieldsSectionProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [capabilities, setCapabilities] = useState<CapabilityRequirement[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const { saveToApi } = useWizardForm()

  useEffect(() => {
    loadRequiredFields()
  }, [])

  const loadRequiredFields = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await quickstartApi.getConfig()
      // Store all capabilities - RequiredFieldsForm will filter to those needing setup
      setCapabilities(response.data.required_capabilities || [])
    } catch (error) {
      console.error('Failed to load required fields:', error)
      setMessage({ type: 'error', text: 'Failed to load required fields' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage({ type: 'info', text: 'Saving configuration...' })

    // Use the shared saveToApi helper which handles flattening
    const result = await saveToApi(quickstartApi.saveConfig)

    if (result.success) {
      setMessage({ type: 'success', text: 'Configuration saved successfully!' })

      // Reload to update status
      await loadRequiredFields()

      // Call parent callback if provided
      onSave?.()
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to save configuration' })
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="required-fields-loading">
        <RefreshCw className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="required-fields-section">
      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : message.type === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
          }`}
          data-testid="required-fields-message"
        >
          {message.text}
        </div>
      )}

      {/* Shared RequiredFieldsForm component */}
      <RequiredFieldsForm
        capabilities={capabilities}
        testIdPrefix="settings"
        emptyMessage={{
          title: 'All Required Fields Configured',
          description: 'All necessary API keys and settings are properly configured.'
        }}
        showHeader={true}
        headerTitle="Required Configuration"
        headerDescription="These fields are required for your installed services to function properly."
      />

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <button
          onClick={loadRequiredFields}
          disabled={loading}
          className="btn-secondary flex items-center space-x-2"
          data-testid="required-fields-refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center space-x-2"
          data-testid="required-fields-save"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  )
}

export default RequiredFieldsSection
