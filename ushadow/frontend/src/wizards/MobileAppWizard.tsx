/**
 * Mobile App Wizard
 *
 * Guides users through connecting the Ushadow mobile app via QR code.
 * This wizard should be run after Tailscale is configured.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle,
  Smartphone,
  QrCode,
  Loader2,
  ExternalLink,
  RefreshCw,
  Apple,
  Download,
} from 'lucide-react'
import { tailscaleApi } from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { useWizard } from '../contexts/WizardContext'
import { useMobileQrCode } from '../hooks/useQrCode'
import { WizardShell, WizardMessage, WhatsNext } from '../components/wizard'
import type { WizardStep } from '../types/wizard'
import { getErrorMessage } from './wizard-utils'
import { StatusBadge } from '../components/StatusBadge'

// Step definitions
const STEPS: WizardStep[] = [
  { id: 'download', label: 'Download' },
  { id: 'connect', label: 'Connect' },
  { id: 'complete', label: 'Done' },
]

interface MobileConnectionQR {
  qr_code_data: string
  connection_data: {
    type: string
    v: number
    hostname: string
    ip: string
    port: number
  }
  hostname: string
  tailscale_ip: string
  api_port: number
}

// Note: Full leader details are fetched by the mobile app from /api/unodes/leader/info

export default function MobileAppWizard() {
  const navigate = useNavigate()
  const wizard = useWizardSteps(STEPS)
  const { markPhaseComplete } = useWizard()

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<WizardMessage | null>(null)

  // QR code state
  const [qrData, setQrData] = useState<MobileConnectionQR | null>(null)
  const [tailscaleReady, setTailscaleReady] = useState(false)

  // Check if Tailscale is configured on mount
  useEffect(() => {
    checkTailscaleStatus()
  }, [])

  const checkTailscaleStatus = async () => {
    try {
      const response = await tailscaleApi.getContainerStatus()
      const status = response.data
      const ready = status.running && status.authenticated
      setTailscaleReady(ready)

      if (!ready) {
        if (!status.exists) {
          setMessage({
            type: 'error',
            text: 'Tailscale container not found. Please complete the Tailscale setup wizard first.',
          })
        } else if (!status.running) {
          setMessage({
            type: 'error',
            text: 'Tailscale is not running. Please start it in the Tailscale wizard.',
          })
        } else if (!status.authenticated) {
          setMessage({
            type: 'error',
            text: 'Tailscale is not authenticated. Please complete authentication in the Tailscale wizard.',
          })
        }
      } else {
        setMessage(null)
      }
    } catch (error) {
      setTailscaleReady(false)
      setMessage({
        type: 'error',
        text: 'Could not check Tailscale status. Please ensure Tailscale is configured.',
      })
    }
  }

  // Fetch QR code when on connect step
  useEffect(() => {
    if (wizard.currentStep.id === 'connect' && tailscaleReady) {
      fetchConnectionQR()
    }
  }, [wizard.currentStep.id, tailscaleReady])

  const fetchConnectionQR = async () => {
    setLoading(true)
    setMessage(null)

    try {
      const response = await tailscaleApi.getMobileConnectionQR()
      setQrData(response.data)
    } catch (error) {
      setMessage({
        type: 'error',
        text: getErrorMessage(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleNext = async () => {
    if (wizard.currentStep.id === 'download') {
      if (!tailscaleReady) {
        setMessage({
          type: 'error',
          text: 'Please configure Tailscale before continuing.',
        })
        return
      }
      wizard.next()
    } else if (wizard.currentStep.id === 'connect') {
      wizard.next()
    } else if (wizard.currentStep.id === 'complete') {
      markPhaseComplete('mobile')
      navigate('/')
    }
  }

  const handleBack = () => {
    if (wizard.isFirst) {
      navigate('/wizard')
    } else {
      wizard.back()
    }
  }

  const handleStepClick = (stepId: string) => {
    const stepIndex = STEPS.findIndex((s) => s.id === stepId)
    if (stepIndex <= wizard.currentIndex) {
      wizard.goTo(stepId)
    }
  }

  const renderStep = () => {
    switch (wizard.currentStep.id) {
      case 'download':
        return (
          <div className="space-y-6" data-testid="mobile-step-download">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
                <Smartphone className="w-10 h-10 text-white" />
              </div>
              <div className="flex items-center justify-center gap-3">
                <h2 className="text-2xl font-semibold text-white">
                  Get the Ushadow Mobile App
                </h2>
                <StatusBadge variant="beta" testId="badge-mobile-app" />
              </div>
              <p className="text-gray-400 max-w-md mx-auto">
                Stream audio from your phone or OMI device to your Ushadow server.
                Choose the installation method that works best for you.
              </p>
            </div>

            {/* Tailscale Status */}
            <div className={`p-4 rounded-lg border ${
              tailscaleReady
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-yellow-500/10 border-yellow-500/30'
            }`}>
              <div className="flex items-center gap-3">
                {tailscaleReady ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                )}
                <span className={tailscaleReady ? 'text-green-300' : 'text-yellow-300'}>
                  {tailscaleReady
                    ? 'Tailscale is configured and ready'
                    : 'Tailscale setup required'}
                </span>
                {!tailscaleReady && (
                  <button
                    onClick={() => navigate('/wizard/tailscale')}
                    className="ml-auto text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    Configure <ExternalLink className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Installation Options */}
            <div className="space-y-4">
              {/* Option 1: Development Build (Recommended) */}
              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-300 text-xs font-medium rounded">
                    RECOMMENDED
                  </span>
                  <h3 className="text-lg font-medium text-white">
                    Development Build
                  </h3>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  Full features including Bluetooth OMI device support. The build scripts automatically check prerequisites and provide helpful error messages.
                </p>
                <div className="bg-black/30 rounded-lg p-3 font-mono text-sm">
                  <div className="text-gray-500"># Install dependencies</div>
                  <div className="text-indigo-300">cd ushadow/mobile && npm install</div>
                  <div className="text-gray-500 mt-2"># iOS (Mac only - auto-boots simulator)</div>
                  <div className="text-indigo-300">npm run ios</div>
                  <div className="text-gray-500 mt-2"># Android (any platform)</div>
                  <div className="text-indigo-300">npm run android</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Scripts auto-check for required tools and will guide you if anything is missing.
                </p>
              </div>

              {/* Option 2: Android APK */}
              <div className="p-4 bg-[#1e2a3a] rounded-lg border border-white/10">
                <h3 className="text-lg font-medium text-white mb-2 flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Android APK (Easiest)
                </h3>
                <p className="text-gray-400 text-sm mb-3">
                  Build an APK file and install directly on any Android device. No app store needed.
                </p>
                <div className="bg-black/30 rounded-lg p-3 font-mono text-sm mb-3">
                  <div className="text-gray-500"># Install EAS CLI and login</div>
                  <div className="text-indigo-300">npm install -g eas-cli && eas login</div>
                  <div className="text-gray-500 mt-2"># Build APK for internal distribution</div>
                  <div className="text-indigo-300">cd ushadow/mobile && eas build --profile preview --platform android</div>
                </div>
                <p className="text-xs text-gray-500">
                  Download the .apk from the build URL, transfer to your phone, and install (enable "Install from unknown sources" in Settings).
                </p>
              </div>

              {/* Option 3: iOS TestFlight */}
              <div className="p-4 bg-[#1e2a3a] rounded-lg border border-white/10">
                <h3 className="text-lg font-medium text-white mb-2 flex items-center gap-2">
                  <Apple className="w-5 h-5" />
                  iOS via TestFlight
                </h3>
                <p className="text-gray-400 text-sm mb-3">
                  Distribute to up to 10,000 testers via Apple's TestFlight. Requires Apple Developer account ($99/year).
                </p>
                <div className="bg-black/30 rounded-lg p-3 font-mono text-sm mb-3">
                  <div className="text-gray-500"># Build for iOS</div>
                  <div className="text-indigo-300">eas build --profile preview --platform ios</div>
                  <div className="text-gray-500 mt-2"># Submit to TestFlight</div>
                  <div className="text-indigo-300">eas submit --platform ios</div>
                </div>
                <p className="text-xs text-gray-500">
                  After submission, add testers by email in App Store Connect. They'll receive TestFlight invites.
                </p>
              </div>

              {/* Option 4: Expo Go (Limited) */}
              <div className="p-4 bg-[#1e2a3a] rounded-lg border border-white/10 opacity-75">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs font-medium rounded">
                    LIMITED
                  </span>
                  <h3 className="text-lg font-medium text-white">
                    Expo Go (Quick Testing)
                  </h3>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  Fastest setup but <strong className="text-yellow-300">no Bluetooth support</strong> (OMI device won't work).
                  Good for testing the UI only.
                </p>
                <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                  <li>Install "Expo Go" from App Store or Play Store</li>
                  <li>Run: <code className="text-indigo-300 bg-black/30 px-1.5 py-0.5 rounded text-xs">cd ushadow/mobile && npm start</code></li>
                  <li>Scan the QR code with Expo Go</li>
                </ol>
              </div>
            </div>

            {/* Prerequisites Note */}
            <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
              <h3 className="text-sm font-medium text-blue-300 mb-2">Prerequisites for Development Builds:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <div className="text-blue-200 font-medium">iOS (Mac only)</div>
                  <ul className="text-blue-300/80 space-y-0.5 list-disc list-inside">
                    <li>Xcode (from App Store)</li>
                    <li>iOS Simulator runtime</li>
                    <li>Xcode Command Line Tools</li>
                  </ul>
                </div>
                <div className="space-y-1">
                  <div className="text-blue-200 font-medium">Android (any platform)</div>
                  <ul className="text-blue-300/80 space-y-0.5 list-disc list-inside">
                    <li>Java JDK 17 (<code className="bg-black/30 px-1 rounded">brew install openjdk@17</code>)</li>
                    <li>Android Studio + SDK</li>
                    <li>Emulator or USB device</li>
                  </ul>
                </div>
              </div>
              <p className="text-xs text-blue-300/60 mt-2">
                Run <code className="bg-black/30 px-1 rounded">npm run ios</code> or <code className="bg-black/30 px-1 rounded">npm run android</code> to see exactly what's missing.
              </p>
            </div>
          </div>
        )

      case 'connect':
        return (
          <div className="space-y-6" data-testid="mobile-step-connect">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
                <QrCode className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-white">
                Scan to Connect
              </h2>
              <p className="text-gray-400 max-w-md mx-auto">
                Open the Ushadow mobile app and scan this QR code to connect to your leader node.
              </p>
            </div>

            {/* QR Code Display */}
            <div className="flex flex-col items-center space-y-4">
              {loading ? (
                <div className="w-64 h-64 bg-[#1e2a3a] rounded-2xl flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                </div>
              ) : qrData ? (
                <>
                  <div className="p-4 bg-white rounded-2xl shadow-lg">
                    <img
                      src={qrData.qr_code_data}
                      alt="Connection QR Code"
                      className="w-56 h-56"
                      data-testid="mobile-connect-qr"
                    />
                  </div>

                  {/* Connection Info */}
                  <div className="text-center space-y-1">
                    <p className="text-sm text-gray-400">Connecting to:</p>
                    <p className="text-lg font-mono text-white">
                      {qrData.hostname || qrData.tailscale_ip}
                    </p>
                    <p className="text-sm text-gray-500">
                      {qrData.tailscale_ip}:{qrData.api_port}
                    </p>
                  </div>

                  <button
                    onClick={fetchConnectionQR}
                    className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh QR Code
                  </button>
                </>
              ) : (
                <div className="w-64 h-64 bg-[#1e2a3a] rounded-2xl flex flex-col items-center justify-center gap-3">
                  <p className="text-gray-400 text-sm text-center px-4">
                    Could not generate QR code
                  </p>
                  <button
                    onClick={fetchConnectionQR}
                    className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="p-4 bg-[#1e2a3a] rounded-lg border border-white/10">
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                How to connect:
              </h3>
              <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
                <li>Make sure your phone is connected to Tailscale</li>
                <li>Open the Ushadow mobile app</li>
                <li>Tap "Scan QR Code" on the connection screen</li>
                <li>Point your camera at the QR code above</li>
              </ol>
            </div>
          </div>
        )

      case 'complete':
        return (
          <div className="space-y-6 text-center" data-testid="mobile-step-complete">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-semibold text-white">
              Level 3 Complete!
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">
              You can now control your Ushadow cluster from the mobile app.
              The app will remember your connection for quick access.
            </p>

            <div className="p-4 bg-[#1e2a3a] rounded-lg border border-white/10 text-left">
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                What you can do with the mobile app:
              </h3>
              <ul className="text-sm text-gray-400 space-y-2 list-disc list-inside">
                <li>View cluster status and connected nodes</li>
                <li>Start/stop audio streaming</li>
                <li>Monitor conversations in real-time</li>
                <li>Quick access to recent memories</li>
              </ul>
            </div>

            <WhatsNext currentLevel={3} onGoHome={() => navigate('/')} />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <WizardShell
      title="Mobile App"
      subtitle="Connect from anywhere"
      icon={Smartphone}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      onStepClick={handleStepClick}
      onBack={handleBack}
      onNext={handleNext}
      nextDisabled={wizard.currentStep.id === 'download' && !tailscaleReady}
      nextLoading={loading}
      message={message}
      exitPath="/wizard"
      data-testid="mobile-wizard"
    >
      {renderStep()}
    </WizardShell>
  )
}
