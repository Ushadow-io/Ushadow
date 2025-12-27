import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Shield,
  Server,
  Globe,
  Lock,
  Smartphone,
  RefreshCw,
  Monitor,
  ExternalLink,
} from 'lucide-react'
import { tailscaleApi, TailscaleConfig, ContainerStatus, AuthUrlResponse } from '../services/api'

type WizardStep = 'welcome' | 'start_container' | 'install_app' | 'authenticate' | 'deployment_mode' | 'configure' | 'provision' | 'complete'

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

const STEP_LABELS: Record<WizardStep, string> = {
  welcome: 'Welcome',
  start_container: 'Start',
  install_app: 'Install',
  authenticate: 'Auth',
  deployment_mode: 'Mode',
  configure: 'Config',
  provision: 'Provision',
  complete: 'Done',
}

interface Message {
  type: 'success' | 'error' | 'info'
  text: string
}

export default function TailscaleWizard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  // Container state
  const [containerStatus, setContainerStatus] = useState<ContainerStatus | null>(null)
  const [authData, setAuthData] = useState<AuthUrlResponse | null>(null)
  const [pollingAuth, setPollingAuth] = useState(false)

  // Store interval refs for cleanup
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

  const steps: WizardStep[] = ['welcome', 'start_container', 'install_app', 'authenticate', 'deployment_mode', 'configure', 'provision', 'complete']
  const currentStepIndex = steps.indexOf(currentStep)
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  // ============================================================================
  // Initial check on welcome step
  // ============================================================================

  useEffect(() => {
    if (currentStep === 'welcome') {
      // Check if container already exists and is running
      checkContainerStatus()
    }
  }, [])

  // ============================================================================
  // Step 2: Start Container
  // ============================================================================

  useEffect(() => {
    if (currentStep === 'start_container') {
      checkContainerStatus()
    }
  }, [currentStep])

  const checkContainerStatus = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await tailscaleApi.getContainerStatus()
      setContainerStatus(response.data)

      if (response.data.running) {
        setMessage({ type: 'success', text: 'Tailscale container is running!' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to check container status' })
    } finally {
      setLoading(false)
    }
  }

  const startContainer = async () => {
    setLoading(true)
    setMessage(null)
    try {
      await tailscaleApi.startContainer()
      // Re-check status
      await checkContainerStatus()
      setMessage({ type: 'success', text: 'Tailscale container started successfully!' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to start container' })
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // Step 3: Install App
  // ============================================================================

  // Just shows app download QR codes, user clicks Next to proceed

  // ============================================================================
  // Step 4: Authentication with QR Code
  // ============================================================================

  useEffect(() => {
    if (currentStep === 'authenticate') {
      // Check if already authenticated first
      checkAuthStatus()
    }
  }, [currentStep])

  const checkAuthStatus = async () => {
    try {
      const response = await tailscaleApi.getContainerStatus()
      if (response.data.authenticated) {
        // Already authenticated, populate hostname and show success
        setContainerStatus(response.data)
        setConfig(prev => ({ ...prev, hostname: response.data.hostname || '' }))
        setMessage({ type: 'success', text: 'Already authenticated!' })
      } else {
        // Not authenticated, load auth URL
        loadAuthUrl()
      }
    } catch (err) {
      // If check fails, try loading auth URL anyway
      loadAuthUrl()
    }
  }

  const loadAuthUrl = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await tailscaleApi.getAuthUrl()
      setAuthData(response.data)
      // Start polling for authentication
      startPollingAuth()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to get authentication URL' })
    } finally {
      setLoading(false)
    }
  }

  // Generate QR code data URL for app download links
  const generateAppQRCode = (url: string): string => {
    try {
      // Simple QR code using Google Charts API (no dependencies)
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
    } catch {
      return ''
    }
  }

  const startPollingAuth = () => {
    // Clear any existing polling
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
    }, 3000) // Poll every 3 seconds

    // Stop polling after 10 minutes
    pollTimeoutRef.current = setTimeout(() => {
      console.log('⏱️ Polling timeout reached')
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      setPollingAuth(false)
    }, 600000)
  }

  // Cleanup on unmount
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
    if (currentStep === 'provision') {
      checkExistingCertificates()
    }
  }, [currentStep])

  const checkExistingCertificates = async () => {
    if (!config.hostname) return

    try {
      // This endpoint returns provisioned: true if certs already exist
      const response = await tailscaleApi.provisionCertInContainer(config.hostname)
      if (response.data.provisioned) {
        setCertificateProvisioned(true)
        setMessage({ type: 'success', text: 'Certificates already provisioned!' })
      }
    } catch (err) {
      // Silently fail - user can still click provision button
      console.log('Certificate check failed, user can provision manually')
    }
  }

  // ============================================================================
  // Configuration & Certificate
  // ============================================================================

  const saveConfiguration = async () => {
    setLoading(true)
    setMessage(null)
    try {
      await tailscaleApi.saveConfig(config)
      setMessage({ type: 'success', text: 'Configuration saved!' })
      return true
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to save configuration' })
      return false
    } finally {
      setLoading(false)
    }
  }

  const provisionCertificate = async () => {
    setLoading(true)
    setMessage(null)
    try {
      // Ensure we have the hostname - fetch from container if missing
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

      // Step 1: Provision certificate
      const response = await tailscaleApi.provisionCertInContainer(hostname)
      if (!response.data.provisioned) {
        setMessage({ type: 'error', text: response.data.error || 'Failed to provision certificate' })
        return false
      }

      // Step 2: Configure routing (tailscale serve or caddy)
      setMessage({ type: 'info', text: 'Configuring routing...' })

      // Make sure config has hostname before configuring
      const finalConfig = { ...config, hostname }
      const serveResponse = await tailscaleApi.configureServe(finalConfig)

      if (serveResponse.data.status === 'configured' || serveResponse.data.status === 'skipped') {
        setCertificateProvisioned(true)
        setMessage({ type: 'success', text: 'HTTPS access configured and ready!' })
        return true
      } else {
        setMessage({ type: 'error', text: 'Failed to configure routing' })
        return false
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to provision certificate' })
      return false
    } finally {
      setLoading(false)
    }
  }

  const completeSetup = async () => {
    setLoading(true)
    setMessage(null)
    try {
      await tailscaleApi.complete()
      setMessage({ type: 'success', text: 'Setup complete!' })
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to complete setup' })
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'welcome':
        return true
      case 'start_container':
        return containerStatus?.running ?? false
      case 'install_app':
        return true  // Always allow proceeding to auth step
      case 'authenticate':
        return containerStatus?.authenticated ?? false
      case 'deployment_mode':
        return true
      case 'configure':
        return true
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

    if (currentStep === 'configure') {
      const saved = await saveConfiguration()
      if (!saved) return
    }

    if (currentStep === 'provision' && !certificateProvisioned) {
      const provisioned = await provisionCertificate()
      if (!provisioned) return
    }

    if (currentStep === 'complete') {
      await completeSetup()
      return
    }

    // Move to next step
    const nextIndex = Math.min(currentStepIndex + 1, steps.length - 1)
    setCurrentStep(steps[nextIndex])
  }

  const handleBack = () => {
    setMessage(null)
    const prevIndex = Math.max(currentStepIndex - 1, 0)
    setCurrentStep(steps[prevIndex])
  }

  const handleSkip = () => {
    navigate('/dashboard')
  }

  // Navigate to a specific step (only if it's been visited)
  const handleStepClick = (step: WizardStep) => {
    const targetIndex = steps.indexOf(step)
    // Allow clicking on any step up to and including current step
    if (targetIndex <= currentStepIndex) {
      setMessage(null)
      setCurrentStep(step)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="relative">
        {/* Back Arrow - Left Side */}
        {currentStepIndex > 0 && (
          <button
            onClick={handleBack}
            disabled={loading}
            className="absolute left-0 top-32 -translate-x-16 w-12 h-12 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center shadow-lg z-10"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          </button>
        )}

        {/* Next Arrow - Right Side */}
        <button
          id="wizard-next-button"
          onClick={handleNext}
          disabled={!canProceed() || loading}
          className="absolute right-0 top-32 translate-x-16 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg z-10"
          aria-label="Next"
        >
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          ) : (
            <ArrowRight className="w-6 h-6 text-white" />
          )}
        </button>

        <div className="card">
        {/* Header */}
        <div className="p-8 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Tailscale Setup
              </h1>
            </div>
            <button
              onClick={handleSkip}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Skip
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Seamless HTTPS access - no installation or configuration required
          </p>

          {/* Progress bar */}
          <div className="mt-6 space-y-2">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Step labels - clickable for navigation */}
            <div className="flex items-center justify-between text-xs">
              {steps.map((step, index) => {
                const isClickable = index <= currentStepIndex
                const isCurrent = step === currentStep
                const isCompleted = index < currentStepIndex

                return (
                  <button
                    key={step}
                    id={`wizard-step-${step}`}
                    onClick={() => handleStepClick(step)}
                    disabled={!isClickable}
                    className={`
                      px-2 py-1 rounded transition-all
                      ${isCurrent
                        ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/30'
                        : isCompleted
                        ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer'
                        : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                      }
                    `}
                  >
                    {isCompleted && <span className="mr-1">✓</span>}
                    {STEP_LABELS[step]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`p-4 mx-8 mt-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400'
              : message.type === 'error'
              ? 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400'
              : 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400'
          }`}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{message.text}</span>
          </div>
        )}

        {/* Step Content */}
        <div className="p-8">
          {/* Welcome Step */}
          {currentStep === 'welcome' && (
            <div className="space-y-6">
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
                {/* Horizontal timeline */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 text-center">
                    <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">1</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Start Tailscale in Docker</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 text-center">
                    <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">2</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Install Tailscale on phone</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 text-center">
                    <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">3</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Scan QR code</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 text-center">
                    <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">4</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Get secure URL</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Start Container Step */}
          {currentStep === 'start_container' && (
            <div className="space-y-6">
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
                  <StatusItem label="Container Exists" status={containerStatus.exists} />
                  <StatusItem label="Container Running" status={containerStatus.running} />
                </div>
              )}

              {!containerStatus?.running && (
                <button
                  id="start-tailscale-container"
                  onClick={startContainer}
                  disabled={loading}
                  className="btn-primary flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                  Start Tailscale Container
                </button>
              )}

              {containerStatus?.running && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Tailscale container is running and ready for authentication
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Install App Step */}
          {currentStep === 'install_app' && (
            <div className="space-y-6">
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
              <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Install on Your Phone
                  </h4>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Scan a QR code with your phone camera to download:
                </p>
                <div className="grid md:grid-cols-2 gap-6">
                  {/* iOS QR Code */}
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

                  {/* Android QR Code */}
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
          {currentStep === 'authenticate' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Authorize Device
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Scan the QR code to approve ushadow to join your Tailscale network
                </p>
              </div>

              {containerStatus?.authenticated ? (
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
              ) : loading ? (
                <div className="flex items-center justify-center gap-3 p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="text-gray-700 dark:text-gray-300">Generating authentication QR code...</span>
                </div>
              ) : (
                <>
                  {authData?.qr_code_data && (
                    <div className="p-6 bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-800 rounded-lg space-y-4">
                      <h4 className="font-medium text-gray-900 dark:text-white text-center">
                        Scan this QR code with your phone
                      </h4>
                      <div className="flex justify-center">
                        <img
                          src={authData.qr_code_data}
                          alt="Tailscale Device Authorization QR Code"
                          className="w-64 h-64"
                        />
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                        This will open the Tailscale login page where you can approve the device
                      </p>
                      {pollingAuth && (
                        <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Waiting for authorization...</span>
                        </div>
                      )}
                      <div className="flex justify-center">
                        <button
                          onClick={async () => {
                            const response = await tailscaleApi.getContainerStatus()
                            if (response.data.authenticated) {
                              setContainerStatus(response.data)
                              setConfig(prev => ({ ...prev, hostname: response.data.hostname || '' }))
                              setMessage({ type: 'success', text: 'Device authorized!' })
                            } else {
                              setMessage({ type: 'info', text: 'Not authorized yet - please complete authorization on your phone' })
                            }
                          }}
                          className="btn-secondary text-sm"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Check Status
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Deployment Mode Step */}
          {currentStep === 'deployment_mode' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Deployment Mode
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Choose your access configuration
                </p>
              </div>

              {config.hostname && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    <strong>Your URL:</strong> <code className="font-mono">https://{config.hostname}</code>
                  </p>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                {/* Single Environment */}
                <button
                  id="deployment-mode-single"
                  onClick={() => setConfig(prev => ({
                    ...prev,
                    deployment_mode: { mode: 'single', environment: 'dev' },
                    use_caddy_proxy: false,
                  }))}
                  className={`p-6 rounded-lg border-2 transition-all text-left ${
                    config.deployment_mode.mode === 'single'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Server className={`w-6 h-6 ${config.deployment_mode.mode === 'single' ? 'text-blue-600' : 'text-gray-500'}`} />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Single Environment
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Simple - one environment at a time
                  </p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <li>• Direct routing</li>
                    <li>• Faster setup</li>
                    <li>• Perfect for individual use</li>
                  </ul>
                </button>

                {/* Multi Environment */}
                <button
                  id="deployment-mode-multi"
                  onClick={() => setConfig(prev => ({
                    ...prev,
                    deployment_mode: { mode: 'multi', environment: undefined },
                    use_caddy_proxy: true,
                  }))}
                  className={`p-6 rounded-lg border-2 transition-all text-left ${
                    config.deployment_mode.mode === 'multi'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Globe className={`w-6 h-6 ${config.deployment_mode.mode === 'multi' ? 'text-blue-600' : 'text-gray-500'}`} />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Multiple Environments
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Advanced - dev/test/prod simultaneously
                  </p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <li>• Caddy reverse proxy</li>
                    <li>• Path-based routing</li>
                    <li>• Best for teams</li>
                  </ul>
                </button>
              </div>

              {config.deployment_mode.mode === 'single' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Environment
                  </label>
                  <select
                    id="single-environment-select"
                    value={config.deployment_mode.environment || 'dev'}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      deployment_mode: { ...prev.deployment_mode, environment: e.target.value }
                    }))}
                    className="input w-full"
                  >
                    <option value="dev">Development</option>
                    <option value="test">Testing</option>
                    <option value="prod">Production</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Configure Step */}
          {currentStep === 'configure' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Review Configuration
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Confirm your settings
                </p>
              </div>

              <div className="space-y-3">
                <ConfigItem label="Hostname" value={config.hostname} />
                <ConfigItem
                  label="Deployment Mode"
                  value={config.deployment_mode.mode === 'single' ? 'Single Environment' : 'Multiple Environments'}
                />
                {config.deployment_mode.mode === 'single' && (
                  <ConfigItem label="Environment" value={config.deployment_mode.environment || 'dev'} />
                )}
                <ConfigItem label="HTTPS" value="Enabled (automatic)" />
                <ConfigItem label="Method" value={config.use_caddy_proxy ? 'Caddy Proxy' : 'Tailscale Serve'} />
              </div>
            </div>
          )}

          {/* Provision Step (Certificate + Routing) */}
          {currentStep === 'provision' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  Provision HTTPS Access
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Setting up certificates and routing automatically
                </p>
              </div>

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

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  This will automatically provision SSL certificates and configure routing via {config.use_caddy_proxy ? 'Caddy' : 'Tailscale Serve'}.
                </p>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && (
            <div className="space-y-6 text-center">
              <CheckCircle className="w-16 h-16 text-green-600 dark:text-green-400 mx-auto" />
              <div>
                <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-2">
                  Setup Complete!
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Your ushadow instance is now accessible securely from anywhere
                </p>
              </div>

              {/* Prominent Access URL */}
              <div className="p-6 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/30 dark:to-blue-900/30 rounded-xl border-2 border-green-200 dark:border-green-800">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Your secure access URL:</p>
                <a
                  href={`https://${config.hostname}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  id="complete-access-url"
                  className="inline-flex items-center gap-2 text-xl font-mono font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
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
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    HTTPS certificate provisioned
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    {config.deployment_mode.mode === 'single' ? 'Direct routing' : 'Caddy reverse proxy'} configured
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    Secure access enabled
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
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

interface ConfigItemProps {
  label: string
  value: string
}

const ConfigItem: React.FC<ConfigItemProps> = ({ label, value }) => (
  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}:</span>
    <span className="text-sm text-gray-900 dark:text-white font-mono">{value}</span>
  </div>
)
