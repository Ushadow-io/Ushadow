import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, CheckCircle, Loader2, AlertCircle, Save } from 'lucide-react'

import { servicesApi, settingsApi } from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell, WizardMessage } from '../components/wizard'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'

// Steps
const STEPS: WizardStep[] = [
  { id: 'generate', label: 'Credentials' },
  { id: 'complete', label: 'Complete' },
] as const

export default function MyceliaWizard() {
  const navigate = useNavigate()
  const wizard = useWizardSteps(STEPS)
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [tokenGenerated, setTokenGenerated] = useState(false)
  const [tokenData, setTokenData] = useState<{ token: string; clientId: string } | null>(null)

  // Check if already configured
  useEffect(() => {
    checkExistingConfig()
  }, [])

  const checkExistingConfig = async () => {
    try {
      const response = await settingsApi.getAll()
      const hasToken = response.data.mycelia?.token
      const hasClientId = response.data.mycelia?.client_id

      if (hasToken && hasClientId) {
        setTokenGenerated(true)
        wizard.goTo('complete')
      }
    } catch (err) {
      console.error('Failed to check existing config:', err)
    }
  }

  const saveToken = async (token: string, clientId: string) => {
    setIsGenerating(true)
    setMessage(null)

    try {
      // Save to settings
      await settingsApi.update({
        'mycelia.token': token,
        'mycelia.client_id': clientId,
      })

      setTokenData({ token, clientId })
      setTokenGenerated(true)
      setMessage({ type: 'success', text: 'Token saved successfully!' })
    } catch (error) {
      console.error('Failed to save token:', error)
      setMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to save token.'),
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleNext = async () => {
    if (wizard.currentStep.id === 'generate') {
      if (tokenGenerated) {
        wizard.next()
      }
      // If not tokenGenerated, button should be disabled
    } else if (wizard.currentStep.id === 'complete') {
      // Try to start the service
      try {
        await servicesApi.startService('mycelia-backend')
        setMessage({ type: 'success', text: 'Mycelia is starting...' })
        setTimeout(() => navigate('/services'), 1500)
      } catch (error) {
        setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to start Mycelia') })
      }
    }
  }

  const handleBack = () => {
    if (!wizard.isFirst) {
      wizard.previous()
    }
  }

  return (
    <WizardShell
      wizardId="mycelia"
      title="Mycelia Setup"
      subtitle="AI Memory and Timeline"
      icon={Database}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      isFirstStep={wizard.isFirst}
      onBack={handleBack}
      onNext={handleNext}
      nextLoading={isGenerating}
      nextDisabled={wizard.currentStep.id === 'generate' && !tokenGenerated}
      nextLabel={wizard.currentStep.id === 'complete' ? 'Start Service' : 'Continue'}
      message={message}
    >
      {wizard.currentStep.id === 'generate' && (
        <GenerateStep
          isGenerating={isGenerating}
          tokenGenerated={tokenGenerated}
          onSave={saveToken}
        />
      )}
      {wizard.currentStep.id === 'complete' && (
        <CompleteStep tokenData={tokenData} />
      )}
    </WizardShell>
  )
}

// =============================================================================
// Step Components
// =============================================================================

interface GenerateStepProps {
  isGenerating: boolean
  tokenGenerated: boolean
  onSave: (token: string, clientId: string) => void
}

function GenerateStep({ isGenerating, tokenGenerated, onSave }: GenerateStepProps) {
  const [token, setToken] = useState('')
  const [clientId, setClientId] = useState('')

  const handleSave = () => {
    if (token.trim() && clientId.trim()) {
      onSave(token.trim(), clientId.trim())
    }
  }

  return (
    <div data-testid="mycelia-step-generate" className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <Database className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Generate Authentication Token
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Mycelia requires an authentication token and client ID. Run one of the following commands on your host machine:
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-1 font-medium">Option 1: Python Script (Recommended)</p>
                <div className="bg-neutral-900 dark:bg-neutral-950 rounded px-3 py-2 font-mono text-xs text-neutral-100 overflow-x-auto">
                  python3 compose/scripts/mycelia-generate-token.py
                </div>
              </div>
              <div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-1 font-medium">Option 2: Docker Compose</p>
                <div className="bg-neutral-900 dark:bg-neutral-950 rounded px-3 py-2 font-mono text-xs text-neutral-100 overflow-x-auto">
                  docker compose -f compose/mycelia-compose.yml run --rm mycelia-backend deno run -A server.ts token-create
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!tokenGenerated ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              MYCELIA_TOKEN
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="mycelia_..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
              data-testid="token-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              MYCELIA_CLIENT_ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
              data-testid="client-id-input"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={isGenerating || !token.trim() || !clientId.trim()}
            className="btn-primary w-full flex items-center justify-center gap-2"
            data-testid="save-token-button"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Credentials
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-success-900 dark:text-success-100 mb-1">
                Token Saved
              </h3>
              <p className="text-sm text-success-800 dark:text-success-200">
                Your Mycelia authentication credentials have been saved securely.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface CompleteStepProps {
  tokenData: { token: string; clientId: string } | null
}

function CompleteStep({ tokenData }: CompleteStepProps) {
  return (
    <div data-testid="mycelia-step-complete" className="space-y-6">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 dark:bg-success-900/30">
          <CheckCircle className="h-8 w-8 text-success-600 dark:text-success-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
            Mycelia is Ready!
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400">
            Your AI memory and timeline service is configured and ready to start.
          </p>
        </div>
      </div>

      <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 space-y-2">
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
          What's Next?
        </h3>
        <ul className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
          <li className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
            <span>Access the web UI at https://localhost:14433</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
            <span>Connect Apple Voice Memos, Google Drive, or local audio files</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-success-600 dark:text-success-400 flex-shrink-0 mt-0.5" />
            <span>Search your voice notes and conversations</span>
          </li>
        </ul>
      </div>

      {tokenData && (
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning-600 dark:text-warning-400 flex-shrink-0" />
            <div className="flex-1 text-sm text-warning-800 dark:text-warning-200">
              <p className="font-semibold mb-1">Credentials saved</p>
              <p>Your token and client ID have been saved to ushadow settings and will be automatically passed to Mycelia.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
