import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle,
  ArrowRight,
  Loader2,
  Shield,
  Server,
  Lock,
  Smartphone,
  RefreshCw,
  Monitor,
  ExternalLink,
  AlertTriangle,
  Trash2,
} from 'lucide-react'
import { tailscaleApi, TailscaleConfig, ContainerStatus, AuthUrlResponse, TailnetSettings } from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { useWizard } from '../contexts/WizardContext'
import { useFeatureFlags } from '../contexts/FeatureFlagsContext'
import { WizardShell, WizardMessage, WhatsNext } from '../components/wizard'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'

// Step definitions using the shared wizard framework types
const STEPS: WizardStep[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'start_container', label: 'Start' },
  { id: 'install_app', label: 'Install' },
  { id: 'authenticate', label: 'Auth' },
  { id: 'provision', label: 'Setup' },
  { id: 'complete', label: 'Done' },
]

// Detect host operating system
const getHostOS = (): 'macos' | 'windows' | 'linux' => {
  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()

  if (platform.includes('mac') || userAgent.includes('mac')) return 'macos'
  if (platform.includes('win') || userAgent.includes('win')) return 'windows'
  return 'linux'
}

const OS_INSTALL_INFO = {
  macos: { label: 'macOS', emoji: '🍎', url: 'https://tailscale.com/download/mac' },
  windows: { label: 'Windows', emoji: '🪟', url: 'https://tailscale.com/download/windows' },
  linux: { label: 'Linux', emoji: '🐧', url: 'https://tailscale.com/download/linux' },
}

export default function TailscaleWizard() {
  const navigate = useNavigate()
  const { updateServiceStatus, markPhaseComplete } = useWizard()
  const { isEnabled } = useFeatureFlags()

  // Check if Caddy routing is enabled via feature flag
  const caddyEnabled = isEnabled('caddy_routing')

  // Use the shared wizard steps hook for navigation
  const wizard = useWizardSteps(STEPS)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<WizardMessage | null>(null)

  // Container state
  const [containerStatus, setContainerStatus] = useState<ContainerStatus | null>(null)
  const [caddyRunning, setCaddyRunning] = useState(false)
  const [authData, setAuthData] = useState<AuthUrlResponse | null>(null)
  const [pollingAuth, setPollingAuth] = useState(false)

  // Store interval refs for cleanup
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Configuration
  const [config, setConfig] = useState<TailscaleConfig>({
    hostname: '',
    deployment_mode: {
      mode: 'single',
      environment: 'dev',
    },
    https_enabled: true,
    use_caddy_proxy: false,
    backend_port: 8000,
    frontend_port: 3000,
    environments: ['dev', 'test', 'prod'],
  })

  // Certificate status
  const [certificateProvisioned, setCertificateProvisioned] = useState(false)

  // CORS update status
  const [corsStatus, setCorsStatus] = useState<{
    updated: boolean
    origin?: string
    error?: string
    loading: boolean
  }>({ updated: false, loading: false })

  // Configured routes (returned from configure-serve)
  const [configuredRoutes, setConfiguredRoutes] = useState<string>('')

  // Tailnet settings (MagicDNS, HTTPS)
  const [tailnetSettings, setTailnetSettings] = useState<TailnetSettings | null>(null)

  // ============================================================================
  // Initial check on welcome step
  // ============================================================================

  useEffect(() => {
    if (wizard.currentStep.id === 'welcome') {
      checkContainerStatus()
    }
  }, [])

  // ============================================================================
  // Step 2: Start Container
  // ============================================================================

  useEffect(() => {
    if (wizard.currentStep.id === 'start_container') {
      checkContainerStatus()
    }
  }, [wizard.currentStep.id])

  // ============================================================================
  // Provision Step: Check Tailnet Settings
  // ============================================================================

  useEffect(() => {
    if (wizard.currentStep.id === 'provision' && containerStatus?.authenticated) {
      checkTailnetSettings()
    }
  }, [wizard.currentStep.id, containerStatus?.authenticated])

  const checkTailnetSettings = async () => {
    try {
      const response = await tailscaleApi.getTailnetSettings()
      setTailnetSettings(response.data)
      console.log('Tailnet settings:', response.data)
    } catch (err) {
      console.error('Failed to check tailnet settings:', err)
    }
  }

  // ============================================================================
  // Complete Step: Update CORS origins
  // ============================================================================

  useEffect(() => {
    if (wizard.currentStep.id === 'complete' && config.hostname && !corsStatus.updated && !corsStatus.loading) {
      updateCorsOrigins()
    }
  }, [wizard.currentStep.id, config.hostname])

  const updateCorsOrigins = async () => {
    if (!config.hostname) return

    setCorsStatus({ updated: false, loading: true })
    try {
      // Call dedicated CORS update endpoint (doesn't touch Caddy routes)
      const response = await tailscaleApi.updateCorsOrigins(config.hostname)
      setCorsStatus({
        updated: true,
        origin: response.data.origin,
        loading: false
      })
    } catch (err) {
      console.error('Failed to update CORS:', err)
      setCorsStatus({
        updated: false,
        error: 'Failed to update CORS origins',
        loading: false
      })
    }
  }

  const checkContainerStatus = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await tailscaleApi.getContainerStatus()
      setContainerStatus(response.data)

      // Only check Caddy status if caddy_routing feature flag is enabled
      if (caddyEnabled) {
        try {
          const caddyResponse = await tailscaleApi.getCaddyStatus()
          setCaddyRunning(caddyResponse.data.running)
          if (caddyResponse.data.running) {
            setConfig(prev => ({ ...prev, use_caddy_proxy: true }))
          }
        } catch {
          setCaddyRunning(false)
        }
      } else {
        setCaddyRunning(false)
      }

      if (response.data.running) {
        setMessage({ type: 'success', text: 'Tailscale container is running!' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err, 'Failed to check container status') })
    } finally {
      setLoading(false)
    }
  }

  const startContainer = async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (caddyEnabled) {
        // Start both Tailscale and Caddy for full reverse proxy support
        const response = await tailscaleApi.startContainerWithCaddy()
        await checkContainerStatus()

        // Check if Caddy started successfully
        if (response.data.details?.caddy?.status === 'running' ||
            response.data.details?.caddy?.status === 'started' ||
            response.data.details?.caddy?.status === 'created') {
          setCaddyRunning(true)
          setConfig(prev => ({ ...prev, use_caddy_proxy: true }))
          setMessage({ type: 'success', text: 'Tailscale and Caddy started successfully!' })
        } else {
          setMessage({ type: 'success', text: 'Tailscale started (Caddy status: ' + response.data.details?.caddy?.status + ')' })
        }
      } else {
        // Only start Tailscale (Caddy disabled via feature flag)
        await tailscaleApi.startContainer()
        await checkContainerStatus()
        setMessage({ type: 'success', text: 'Tailscale container started!' })
      }
    } catch (err) {
      // Fallback to just Tailscale if Caddy fails
      try {
        await tailscaleApi.startContainer()
        await checkContainerStatus()
        setCaddyRunning(false)
        setMessage({ type: 'success', text: 'Tailscale container started' })
      } catch (fallbackErr) {
        setMessage({ type: 'error', text: getErrorMessage(fallbackErr, 'Failed to start container') })
      }
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // Step 4: Authentication with QR Code
  // ============================================================================

  useEffect(() => {
    if (wizard.currentStep.id === 'authenticate') {
      checkAuthStatus()
    }
  }, [wizard.currentStep.id])

  const checkAuthStatus = async () => {
    try {
      const response = await tailscaleApi.getContainerStatus()

      // Check if container exists and is running before trying to get auth URL
      if (!response.data.exists || !response.data.running) {
        setMessage({
          type: 'error',
          text: 'Tailscale container is not running. Please go back and start the container first.'
        })
        return
      }

      if (response.data.authenticated) {
        setContainerStatus(response.data)
        setConfig(prev => ({ ...prev, hostname: response.data.hostname || '' }))
        setMessage({ type: 'success', text: 'Already authenticated!' })
      } else {
        loadAuthUrl()
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Failed to check container status. Please ensure Tailscale container is running.'
      })
    }
  }

  const loadAuthUrl = async (regenerate: boolean = false) => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await tailscaleApi.getAuthUrl(regenerate)
      setAuthData(response.data)
      startPollingAuth()
    } catch (err) {
      // Parse error to provide helpful troubleshooting tips
      const errorMsg = getErrorMessage(err, 'Failed to generate authentication URL')
      let userFriendlyMessage = 'Unable to generate the QR code for device authorization.'
      let tips: string[] = []

      if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
        tips.push('The Tailscale container may be starting up - please wait a moment and try again')
        tips.push('Check that Docker is running and the container has network access')
      } else if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        tips.push('The Tailscale container may not be running')
        tips.push('Try clicking "Start Container" in the previous step')
      } else if (errorMsg.includes('connection refused') || errorMsg.includes('network')) {
        tips.push('Network connectivity issue detected')
        tips.push('Verify that the Tailscale container is running and accessible')
      } else {
        tips.push('The Tailscale service may need a moment to initialize')
        tips.push('Ensure Docker is running and has sufficient resources')
      }

      const fullMessage = tips.length > 0
        ? `${userFriendlyMessage}\n\n💡 Troubleshooting tips:\n${tips.map((tip, i) => `${i + 1}. ${tip}`).join('\n')}`
        : `${userFriendlyMessage}\n\nError: ${errorMsg}`

      setMessage({ type: 'error', text: fullMessage })
    } finally {
      setLoading(false)
    }
  }

  const generateAppQRCode = (url: string): string => {
    try {
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
    } catch {
      return ''
    }
  }

  const startPollingAuth = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
    }

    setPollingAuth(true)
    console.log('🔄 Starting auth polling...')

    pollIntervalRef.current = setInterval(async () => {
      try {
        console.log('🔍 Checking auth status...')
        const response = await tailscaleApi.getContainerStatus()
        console.log('Auth response:', response.data)

        if (response.data.authenticated) {
          console.log('✅ Authenticated!')
          setPollingAuth(false)
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
          setContainerStatus(response.data)
          setConfig(prev => ({ ...prev, hostname: response.data.hostname || '' }))
          setMessage({ type: 'success', text: 'Successfully authenticated!' })
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 3000)

    pollTimeoutRef.current = setTimeout(() => {
      console.log('⏱️ Polling timeout reached')
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      setPollingAuth(false)
    }, 600000)
  }

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    }
  }, [])

  // ============================================================================
  // Step 7: Provision - Check for existing certificates
  // ============================================================================

  useEffect(() => {
    if (wizard.currentStep.id === 'provision') {
      checkExistingCertificates()
    }
  }, [wizard.currentStep.id])

  const checkExistingCertificates = async () => {
    if (!config.hostname) return

    try {
      const response = await tailscaleApi.provisionCertInContainer(config.hostname)
      if (response.data.provisioned) {
        setCertificateProvisioned(true)
        setMessage({ type: 'success', text: 'Certificates already provisioned!' })
      }
    } catch (err) {
      console.log('Certificate check failed, user can provision manually')
    }
  }

  // ============================================================================
  // Reset Tailscale Component
  // ============================================================================

  const ResetTailscaleButton = ({
    variant = 'link',
    testId = 'reset-tailscale',
    className = ''
  }: {
    variant?: 'link' | 'button'
    testId?: string
    className?: string
  }) => {
    // Only show if debug feature flag is enabled
    if (!isEnabled('debug')) {
      return null
    }

    if (variant === 'link') {
      return (
        <div className="space-y-2">
          <button
            onClick={resetTailscale}
            disabled={loading}
            className={`text-sm text-red-600 dark:text-red-400 hover:underline flex items-center gap-2 ${className}`}
            data-testid={testId}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reset Tailscale</span>
          </button>
          <button
            onClick={() => window.open('https://login.tailscale.com/admin/machines', '_blank', 'noopener,noreferrer')}
            className="text-xs text-gray-500 dark:text-gray-400 hover:underline flex items-center gap-2"
            data-testid={`${testId}-admin-console`}
          >
            <ExternalLink className="w-3 h-3" />
            <span>Remove machine from admin console</span>
          </button>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <button
          onClick={resetTailscale}
          disabled={loading}
          className={`btn-danger text-sm flex items-center gap-2 ${className}`}
          data-testid={testId}
          title="Complete Tailscale reset: removes routes, certificates, auth, and all configuration"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          <span>Reset Tailscale</span>
        </button>
        <button
          onClick={() => window.open('https://login.tailscale.com/admin/machines', '_blank', 'noopener,noreferrer')}
          className="btn-secondary text-xs flex items-center gap-2"
          data-testid={`${testId}-admin-console`}
        >
          <ExternalLink className="w-3 h-3" />
          <span>Remove machine from admin console</span>
        </button>
      </div>
    )
  }

  // ============================================================================
  // Reset Tailscale
  // ============================================================================

  const resetTailscale = async () => {
    const confirmed = window.confirm(
      'This will completely reset Tailscale to defaults:\n\n' +
      '• Clear all routes\n' +
      '• Remove certificates\n' +
      '• Clear authentication\n' +
      '• Remove container and volume\n' +
      '• Delete all configuration\n\n' +
      'Note: You will need to manually delete this machine from your Tailscale admin panel at https://login.tailscale.com/admin/machines\n\n' +
      'Continue?'
    )
    if (!confirmed) return

    setLoading(true)
    setMessage(null)

    // Stop any ongoing polling immediately
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
    setPollingAuth(false)

    try {
      const response = await tailscaleApi.reset()

      // Reset all state to fresh/unauthenticated
      setContainerStatus({
        exists: false,
        running: false,
        authenticated: false,
        hostname: null,
        ip_address: null
      })
      setAuthData(null)
      setCertificateProvisioned(false)
      setConfig(prev => ({ ...prev, hostname: '' }))
      setCorsStatus({ updated: false, loading: false })

      // Force a status check to ensure UI updates
      setTimeout(async () => {
        await checkContainerStatus()
      }, 100)

      const details = response.data.details
      const successSteps = Object.values(details).filter(Boolean).length
      const totalSteps = Object.keys(details).length

      setMessage({
        type: response.data.status === 'success' ? 'success' : 'warning',
        text: `${response.data.message} (${successSteps}/${totalSteps} steps completed)`
      })

      // Go back to start_container step
      wizard.goTo('start_container')
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err, 'Failed to reset Tailscale') })
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // Certificate & Routing Setup
  // ============================================================================

  const provisionCertificate = async () => {
    setLoading(true)
    setMessage(null)
    try {
      let hostname = config.hostname
      if (!hostname) {
        const statusResponse = await tailscaleApi.getContainerStatus()
        if (statusResponse.data.hostname) {
          hostname = statusResponse.data.hostname
          setConfig(prev => ({ ...prev, hostname }))
        } else {
          setMessage({ type: 'error', text: 'No hostname available. Please ensure Tailscale is authenticated.' })
          return false
        }
      }

      // IMPORTANT: Enable HTTPS FIRST, then provision certs
      // Step 1: Enable HTTPS (required for cert provisioning)
      setMessage({ type: 'info', text: 'Enabling HTTPS on Tailscale...' })
      const finalConfig = { ...config, hostname }
      const serveResponse = await tailscaleApi.configureServe(finalConfig)

      // Check if routing configuration succeeded
      if (serveResponse.data.status !== 'configured' && serveResponse.data.status !== 'skipped') {
        setMessage({ type: 'error', text: 'Failed to configure routing' })
        return false
      }

      // Store the configured routes for display
      if (serveResponse.data.routes) {
        setConfiguredRoutes(serveResponse.data.routes)
      }

      // Step 2: Provision the certificate (HTTPS is now enabled)
      setMessage({
        type: 'info',
        text: 'Provisioning SSL certificate from Let\'s Encrypt...\n\nThis may take 60-90 seconds. Please wait while we:\n1. Register with Let\'s Encrypt\n2. Complete DNS validation\n3. Issue your certificate'
      })
      const certResponse = await tailscaleApi.provisionCertInContainer(hostname)
      if (!certResponse.data.provisioned) {
        const error = certResponse.data.error || ''
        if (error.includes('does not support getting TLS certs')) {
          setMessage({
            type: 'warning',
            text: 'Your Tailscale plan does not support HTTPS certificates. Upgrade your plan or enable in admin console.'
          })
        } else {
          setMessage({ type: 'warning', text: error || 'Certificate provisioning failed' })
        }
        // Don't fail completely - HTTPS is enabled
      }

      // Step 3: Recheck tailnet settings to update UI
      await checkTailnetSettings()

      // Step 4: Success!
      const successMsg = certResponse.data.provisioned
        ? 'HTTPS enabled and SSL certificates provisioned successfully!'
        : 'HTTPS routing enabled! (SSL certificate provisioning may require Tailscale plan upgrade)'
      setMessage({ type: 'success', text: successMsg })
      setCertificateProvisioned(certResponse.data.provisioned || false)
      updateServiceStatus('tailscale', { configured: true, running: true })
      markPhaseComplete('tailscale')
      return true
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err, 'Failed to configure HTTPS') })
      return false
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  const canProceed = (): boolean => {
    switch (wizard.currentStep.id) {
      case 'welcome':
        return true
      case 'start_container':
        return containerStatus?.running ?? false
      case 'install_app':
        return true
      case 'authenticate':
        return containerStatus?.authenticated ?? false
      case 'provision':
        return certificateProvisioned
      case 'complete':
        return true
      default:
        return false
    }
  }

  const handleNext = async () => {
    setMessage(null)

    if (wizard.currentStep.id === 'provision') {
      // Always configure routes when leaving provision step
      // (even if certs were already provisioned)
      const provisioned = await provisionCertificate()
      if (!provisioned) return
    }

    if (wizard.currentStep.id === 'complete') {
      // Handled by CompleteStep buttons
      return
    }

    wizard.next()
  }

  const handleBack = () => {
    setMessage(null)
    wizard.back()
  }

  const handleSkip = () => {
    navigate('/dashboard')
  }

  const handleStepClick = (stepId: string) => {
    const targetIndex = STEPS.findIndex(s => s.id === stepId)
    if (targetIndex <= wizard.currentIndex) {
      setMessage(null)
      wizard.goTo(stepId)
    }
  }

  return (
    <WizardShell
      wizardId="tailscale"
      title="Tailscale Setup"
      subtitle="Seamless HTTPS access - no installation or configuration required"
      icon={Shield}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      onStepClick={handleStepClick}
      isFirstStep={wizard.isFirst}
      onBack={handleBack}
      onNext={wizard.currentStep.id === 'complete' ? undefined : handleNext}
      nextDisabled={!canProceed()}
      nextLoading={loading}
      message={message}
      headerActions={
        <button
          id="tailscale-skip-button"
          onClick={handleSkip}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Skip
        </button>
      }
    >
      {/* Welcome Step */}
      {wizard.currentStep.id === 'welcome' && (
        <div id="tailscale-step-welcome" className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
              Secure Access with Tailscale
            </h2>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700 dark:text-gray-300">Secure communication between your devices</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700 dark:text-gray-300">Your data is only accessible to you</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700 dark:text-gray-300">Never exposed to the internet</span>
            </div>
          </div>

          <div className="p-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-6 text-center">
              Setup Process
            </h3>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                  <span className="text-primary-600 dark:text-primary-400 font-semibold">1</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">Start Tailscale in Docker</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1 text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                  <span className="text-primary-600 dark:text-primary-400 font-semibold">2</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">Install Tailscale on phone</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1 text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                  <span className="text-primary-600 dark:text-primary-400 font-semibold">3</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">Scan QR code</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1 text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                  <span className="text-primary-600 dark:text-primary-400 font-semibold">4</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">Get secure URL</p>
              </div>
            </div>
          </div>

          {/* Reset Tailscale button - only show if container exists */}
          {containerStatus?.exists && <ResetTailscaleButton variant="button" testId="reset-tailscale-welcome" />}
        </div>
      )}

      {/* Start Container Step */}
      {wizard.currentStep.id === 'start_container' && (
        <div id="tailscale-step-start" className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
              Start Tailscale Container
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Starting Tailscale service in Docker
            </p>
          </div>

          {containerStatus && (
            <div className="space-y-2">
              <StatusItem label="Tailscale Container" status={containerStatus.running} />
              {caddyEnabled && (
                <StatusItem label="Caddy Reverse Proxy" status={caddyRunning} />
              )}
            </div>
          )}

          {!containerStatus?.running && (
            <button
              id="start-tailscale-container"
              data-testid="start-tailscale-container"
              onClick={startContainer}
              disabled={loading}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
              {caddyEnabled ? 'Start Tailscale & Caddy' : 'Start Tailscale'}
            </button>
          )}

          {containerStatus?.running && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg space-y-2">
                <p className="text-sm text-green-800 dark:text-green-200">
                  Tailscale container is running and ready for authentication
                </p>
                {caddyEnabled && caddyRunning && (
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Caddy reverse proxy is active for multi-service routing
                  </p>
                )}
                {caddyEnabled && !caddyRunning && (
                  <button
                    data-testid="start-caddy-only"
                    onClick={async () => {
                      setLoading(true)
                      try {
                        await tailscaleApi.startCaddy()
                        await checkContainerStatus()
                        setMessage({ type: 'success', text: 'Caddy started!' })
                      } catch (err) {
                        setMessage({ type: 'error', text: getErrorMessage(err, 'Failed to start Caddy') })
                      } finally {
                        setLoading(false)
                      }
                    }}
                    disabled={loading}
                    className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {loading ? 'Starting...' : 'Start Caddy reverse proxy'}
                  </button>
                )}
              </div>

              {/* Reset Tailscale button */}
              <ResetTailscaleButton variant="button" testId="reset-tailscale-start" />
            </div>
          )}
        </div>
      )}

      {/* Install App Step */}
      {wizard.currentStep.id === 'install_app' && (
        <div id="tailscale-step-install" className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
              Install Tailscale
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Install Tailscale on your devices to access ushadow securely
            </p>
          </div>

          {/* Host Machine Install */}
          {(() => {
            const hostOS = getHostOS()
            const osInfo = OS_INSTALL_INFO[hostOS]
            return (
              <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-lg space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <Monitor className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Install on This Computer
                  </h4>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Install Tailscale on your {osInfo.label} machine to access ushadow from this device:
                </p>
                <a
                  href={osInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="install-tailscale-host"
                  className="flex items-center justify-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg border-2 border-green-300 dark:border-green-700 hover:border-green-500 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                >
                  <span className="text-2xl">{osInfo.emoji}</span>
                  <span className="text-base font-medium text-gray-900 dark:text-white">
                    Download Tailscale for {osInfo.label}
                  </span>
                  <ExternalLink className="w-4 h-4 text-green-600 dark:text-green-400" />
                </a>
              </div>
            )
          })()}

          {/* Mobile Install */}
          <div className="p-6 bg-primary-50 dark:bg-primary-900/20 rounded-lg space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Smartphone className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h4 className="font-medium text-gray-900 dark:text-white">
                Install on Your Phone
              </h4>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Scan a QR code with your phone camera to download:
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="text-center space-y-3">
                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg inline-block">
                  <img
                    src={generateAppQRCode('https://apps.apple.com/app/tailscale/id1470499037')}
                    alt="iOS App Store QR Code"
                    className="w-40 h-40"
                  />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">iOS (App Store)</p>
              </div>

              <div className="text-center space-y-3">
                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg inline-block">
                  <img
                    src={generateAppQRCode('https://play.google.com/store/apps/details?id=com.tailscale.ipn')}
                    alt="Android Play Store QR Code"
                    className="w-40 h-40"
                  />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Android (Play Store)</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              After installing the app, click <strong>Next</strong> to continue with authentication
            </p>
          </div>
        </div>
      )}

      {/* Authenticate Step with Auth QR Code */}
      {wizard.currentStep.id === 'authenticate' && (
        <div id="tailscale-step-auth" className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
              Authorize Device
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Scan the QR code to approve ushadow to join your Tailscale network
            </p>
          </div>

          {containerStatus?.authenticated ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-green-800 dark:text-green-200 font-semibold">
                    Successfully Authenticated!
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Your Tailscale hostname: <code className="font-mono">{containerStatus.hostname}</code>
                  </p>
                </div>
              </div>
              <div className="flex justify-center">
                <ResetTailscaleButton variant="button" testId="reset-tailscale-button-authenticated" />
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-3 p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              <span className="text-gray-700 dark:text-gray-300">Generating authentication QR code...</span>
            </div>
          ) : !authData && message?.type === 'error' ? (
            // Error state with retry button
            <div className="space-y-4">
              <div className="p-6 bg-white dark:bg-gray-800 border-2 border-red-200 dark:border-red-800 rounded-lg space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                      QR Code Generation Failed
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
                      {message.text}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 pt-2">
                  <button
                    data-testid="retry-auth-url"
                    onClick={() => loadAuthUrl(false)}
                    disabled={loading}
                    className="btn-primary flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                  </button>
                  <button
                    data-testid="regenerate-after-error"
                    onClick={() => loadAuthUrl(true)}
                    disabled={loading}
                    className="btn-secondary text-sm flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Generate New QR Code
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-md">
                    "Try Again" reuses existing session. "Generate New" creates a fresh authentication URL.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {authData?.qr_code_data && (
                <div className="p-6 bg-white dark:bg-gray-800 border-2 border-primary-200 dark:border-primary-800 rounded-lg space-y-4">
                  <h4 className="font-medium text-gray-900 dark:text-white text-center">
                    Scan this QR code with your phone
                  </h4>
                  <div className="flex justify-center">
                    <img
                      key={authData.auth_url}
                      src={authData.qr_code_data}
                      alt="Tailscale Device Authorization QR Code"
                      className="w-64 h-64"
                    />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    This will open the Tailscale login page where you can approve the device
                  </p>
                  <div className="text-center pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      No phone nearby? Open the link directly:
                    </p>
                    <a
                      href={authData.auth_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="auth-url-link"
                      className="text-sm text-primary-600 dark:text-primary-400 hover:underline break-all"
                    >
                      {authData.auth_url}
                    </a>
                  </div>
                  {pollingAuth && (
                    <div className="flex items-center justify-center gap-2 text-primary-600 dark:text-primary-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Waiting for authorization...</span>
                    </div>
                  )}
                  <div className="flex justify-center gap-3">
                    <button
                      id="check-auth-status"
                      data-testid="check-auth-status"
                      onClick={async () => {
                        try {
                          const response = await tailscaleApi.getContainerStatus()
                          if (response.data.authenticated) {
                            setContainerStatus(response.data)
                            setConfig(prev => ({ ...prev, hostname: response.data.hostname || '' }))
                            setMessage({ type: 'success', text: 'Device authorized!' })
                          } else {
                            setMessage({ type: 'info', text: 'Not authorized yet - please complete authorization on your phone' })
                          }
                        } catch (err) {
                          setMessage({ type: 'error', text: getErrorMessage(err, 'Failed to check status') })
                        }
                      }}
                      className="btn-secondary text-sm"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Check Status
                    </button>
                    <button
                      id="regenerate-auth-code"
                      data-testid="regenerate-auth-code"
                      onClick={() => {
                        setAuthData(null)
                        loadAuthUrl(true)  // regenerate=true to force new URL
                      }}
                      disabled={loading}
                      className="btn-secondary text-sm"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      New QR Code
                    </button>
                    <ResetTailscaleButton variant="button" testId="reset-tailscale-button" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Provision Step */}
      {wizard.currentStep.id === 'provision' && (
        <div id="tailscale-step-provision" className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
              Provision HTTPS Access
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Setting up certificates and routing automatically
            </p>
          </div>

          {/* Tailnet Settings Warnings */}
          {tailnetSettings && (
            <>
              {!tailnetSettings.magic_dns.enabled && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                        MagicDNS Not Enabled
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                        MagicDNS must be enabled on your tailnet for HTTPS to work. Enable it in your Tailscale admin console.
                      </p>
                      <a
                        href={tailnetSettings.magic_dns.admin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-yellow-800 dark:text-yellow-200 hover:underline"
                      >
                        Enable MagicDNS
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {tailnetSettings.https_serve.enabled === false && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                        HTTPS Certificates Not Enabled
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                        To enable HTTPS certificates for your tailnet:
                      </p>
                      <div className="space-y-3">
                        <div>
                          <a
                            href={tailnetSettings.https_serve.admin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-primary text-sm inline-flex items-center gap-2"
                          >
                            Open DNS Settings
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                        <ul className="text-sm text-yellow-700 dark:text-yellow-300 ml-4 space-y-2 list-disc">
                          <li className="pl-2">Scroll down to the bottom of the page</li>
                          <li className="pl-2">Click the "Enable HTTPS" button</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Recheck button - show if there are warnings */}
          {tailnetSettings && (!tailnetSettings.magic_dns.enabled || tailnetSettings.https_serve.enabled === false) && (
            <div className="flex justify-start">
              <button
                onClick={async () => {
                  setLoading(true)
                  await checkTailnetSettings()
                  setLoading(false)
                }}
                disabled={loading}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Recheck Settings
              </button>
            </div>
          )}

          {certificateProvisioned ? (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-green-800 dark:text-green-200 font-semibold">
                  HTTPS Access Configured!
                </p>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  Certificates provisioned and routing configured for {config.hostname}
                </p>
              </div>
            </div>
          ) : (
            <button
              id="provision-https-button"
              onClick={provisionCertificate}
              disabled={loading}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Provision HTTPS Access
            </button>
          )}

          <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
            <p className="text-sm text-primary-800 dark:text-primary-200">
              This will automatically provision SSL certificates and configure routing via Tailscale Serve.
            </p>
          </div>
        </div>
      )}

      {/* Complete Step */}
      {wizard.currentStep.id === 'complete' && (
        <div id="tailscale-step-complete" className="space-y-6 text-center">
          <CheckCircle className="w-16 h-16 text-green-600 dark:text-green-400 mx-auto" />
          <div>
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-2">
              Level 2 Complete!
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Your ushadow instance is now accessible securely from anywhere
            </p>
          </div>

          <div className="p-6 bg-gradient-to-r from-primary-50 to-fuchsia-50 dark:from-primary-900/30 dark:to-fuchsia-900/30 rounded-xl border-2 border-primary-200 dark:border-primary-800">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Your secure access URL:</p>
            <a
              href={`https://${config.hostname}`}
              target="_blank"
              rel="noopener noreferrer"
              id="complete-access-url"
              className="inline-flex items-center gap-2 text-xl font-mono font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline"
            >
              https://{config.hostname}
              <ExternalLink className="w-5 h-5" />
            </a>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              Accessible from any device on your Tailscale network
            </p>
          </div>

          <div className="p-5 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-left">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">
              What's been configured:
            </h3>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                Tailscale container running in Docker
              </li>
              {caddyEnabled && (
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  Caddy reverse proxy for multi-service routing
                </li>
              )}
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                HTTPS certificate provisioned
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                {caddyEnabled ? 'Caddy reverse proxy routes configured' : 'Tailscale Serve routes configured'}
              </li>
              <li className="flex items-center gap-2" data-testid="cors-status">
                {corsStatus.loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    <span>Updating CORS origins...</span>
                  </>
                ) : corsStatus.updated ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span>CORS origin added: <code className="text-xs bg-gray-200 dark:bg-gray-600 px-1 rounded">{corsStatus.origin}</code></span>
                  </>
                ) : corsStatus.error ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-amber-600 dark:text-amber-400">{corsStatus.error}</span>
                  </>
                ) : (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />
                    <span className="text-gray-400">CORS origins pending...</span>
                  </>
                )}
              </li>
            </ul>
          </div>

          {/* Configured Routes Display */}
          {configuredRoutes && (
            <div className="p-5 bg-primary-50 dark:bg-primary-900/20 rounded-lg text-left border-2 border-primary-200 dark:border-primary-800">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                Configured Routes
              </h3>
              <pre
                data-testid="configured-routes"
                className="p-3 bg-white dark:bg-gray-800 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-64 border border-primary-200 dark:border-primary-700"
              >
                {configuredRoutes}
              </pre>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                These routes direct traffic from your Tailscale URL to the appropriate services
              </p>
            </div>
          )}

          <WhatsNext
            currentLevel={2}
            onGoHome={() => {
              markPhaseComplete('tailscale')
              // Redirect to Tailscale URL to force authentication via Tailscale
              const tailscaleUrl = `https://${config.hostname}/`
              window.location.href = tailscaleUrl
            }}
            onContinue={() => {
              markPhaseComplete('tailscale')
              // Redirect through Tailscale URL to Level 3 (may require re-login)
              const tailscaleUrl = `https://${config.hostname}/wizard/mobile-app`
              window.location.href = tailscaleUrl
            }}
          />
        </div>
      )}
    </WizardShell>
  )
}

// Helper Components
interface StatusItemProps {
  label: string
  status: boolean
}

const StatusItem: React.FC<StatusItemProps> = ({ label, status }) => (
  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
    {status ? (
      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
    ) : (
      <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
    )}
    <span className="text-sm text-gray-900 dark:text-white">{label}</span>
  </div>
)

