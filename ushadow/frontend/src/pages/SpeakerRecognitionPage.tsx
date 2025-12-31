import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  Mic,
  UserPlus,
  Activity,
  Radio,
  Settings,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Play,
  Square,
} from 'lucide-react'
import { getStorageKey } from '../utils/storage'

type TabType = 'status' | 'enrollment' | 'inference' | 'speakers'

interface ServiceStatus {
  status: 'ok' | 'error' | 'loading'
  device: string
  speakers: number
}

interface Speaker {
  id: string
  name: string
  user_id: number
  audio_sample_count: number
  total_audio_duration: number
  created_at: string
}

export default function SpeakerRecognitionPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('status')
  const [serviceUrl, setServiceUrl] = useState('')
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [error, setError] = useState<string | null>(null)

  // Load settings and check service status
  useEffect(() => {
    const savedUrl = localStorage.getItem(getStorageKey('speaker_service_url')) || 'http://localhost:8085'
    setServiceUrl(savedUrl)
    checkServiceStatus(savedUrl)
  }, [])

  const checkServiceStatus = async (url: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${url}/health`)
      if (!response.ok) throw new Error('Service unavailable')
      const data = await response.json()
      setServiceStatus(data)
      // Also fetch speakers if healthy
      if (data.status === 'ok') {
        await fetchSpeakers(url)
      }
    } catch (err) {
      setServiceStatus({ status: 'error', device: 'unknown', speakers: 0 })
      setError('Cannot connect to Speaker Recognition service. Ensure the service is running.')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchSpeakers = async (url: string) => {
    try {
      const response = await fetch(`${url}/speakers`)
      if (!response.ok) throw new Error('Failed to fetch speakers')
      const data = await response.json()
      setSpeakers(data.speakers || [])
    } catch (err) {
      console.error('Failed to fetch speakers:', err)
    }
  }

  const handleSaveUrl = () => {
    localStorage.setItem(getStorageKey('speaker_service_url'), serviceUrl)
    checkServiceStatus(serviceUrl)
    setShowSettings(false)
  }

  const handleRefresh = () => {
    checkServiceStatus(serviceUrl)
  }

  const handleSetupWizard = () => {
    navigate('/wizard/speaker-recognition')
  }

  const openWebUI = () => {
    const webuiUrl = serviceUrl.replace(':8085', ':5174')
    window.open(webuiUrl, '_blank')
  }

  // Loading state
  if (isLoading && !serviceStatus) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="speaker-rec-loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Not configured - show setup prompt
  if (serviceStatus?.status === 'error') {
    return (
      <div className="space-y-6" data-testid="speaker-rec-setup-prompt">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <Users className="h-8 w-8 text-primary-600 dark:text-primary-400" />
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                Speaker Recognition
              </h1>
            </div>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Real-time speaker diarization and identification
            </p>
          </div>
        </div>

        {/* Setup Card */}
        <div className="card p-6 max-w-lg mx-auto text-center" data-testid="speaker-rec-setup-card">
          <div className="w-16 h-16 mx-auto bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>

          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            Service Not Connected
          </h2>

          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            {error || 'Speaker Recognition service is not running or not configured.'}
          </p>

          <div className="space-y-3">
            <button
              onClick={handleSetupWizard}
              className="btn-primary w-full flex items-center justify-center space-x-2"
              data-testid="speaker-rec-setup-button"
            >
              <UserPlus className="h-4 w-4" />
              <span>Set Up Speaker Recognition</span>
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="btn-secondary w-full flex items-center justify-center space-x-2"
            >
              <Settings className="h-4 w-4" />
              <span>Configure Connection</span>
            </button>
          </div>

          {/* Connection Settings */}
          {showSettings && (
            <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700 text-left">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Service URL
              </label>
              <div className="flex space-x-2">
                <input
                  type="url"
                  value={serviceUrl}
                  onChange={(e) => setServiceUrl(e.target.value)}
                  placeholder="http://localhost:8085"
                  className="input flex-1"
                  data-testid="speaker-rec-url-input"
                />
                <button
                  onClick={handleSaveUrl}
                  className="btn-primary"
                >
                  Connect
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Main view - service is running
  return (
    <div className="space-y-6" data-testid="speaker-rec-main-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Users className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              Speaker Recognition
            </h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Real-time speaker diarization and identification
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            className="btn-secondary p-2"
            title="Refresh Status"
            data-testid="speaker-rec-refresh"
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn-secondary p-2"
            title="Settings"
            data-testid="speaker-rec-settings-button"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={openWebUI}
            className="btn-primary flex items-center space-x-2"
            data-testid="speaker-rec-open-webui"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Open Full UI</span>
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="card p-4" data-testid="speaker-rec-settings-panel">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3">Connection Settings</h3>
          <div className="flex items-center space-x-2">
            <input
              type="url"
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value)}
              placeholder="http://localhost:8085"
              className="input flex-1"
            />
            <button onClick={handleSaveUrl} className="btn-primary">
              Save
            </button>
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard
          label="Service Status"
          value={serviceStatus?.status === 'ok' ? 'Running' : 'Error'}
          icon={serviceStatus?.status === 'ok' ? CheckCircle : AlertCircle}
          status={serviceStatus?.status === 'ok' ? 'success' : 'error'}
        />
        <StatusCard
          label="Compute Device"
          value={serviceStatus?.device === 'cuda' ? 'GPU (CUDA)' : 'CPU'}
          icon={Activity}
          status={serviceStatus?.device === 'cuda' ? 'success' : 'neutral'}
        />
        <StatusCard
          label="Enrolled Speakers"
          value={String(serviceStatus?.speakers || 0)}
          icon={Users}
          status="neutral"
        />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-neutral-200 dark:border-neutral-700" data-testid="speaker-rec-tabs">
        <nav className="-mb-px flex space-x-8">
          <TabButton
            active={activeTab === 'status'}
            onClick={() => setActiveTab('status')}
            icon={Activity}
            label="Status"
            testId="tab-status"
          />
          <TabButton
            active={activeTab === 'speakers'}
            onClick={() => setActiveTab('speakers')}
            icon={Users}
            label="Speakers"
            testId="tab-speakers"
          />
          <TabButton
            active={activeTab === 'enrollment'}
            onClick={() => setActiveTab('enrollment')}
            icon={UserPlus}
            label="Enrollment"
            testId="tab-enrollment"
          />
          <TabButton
            active={activeTab === 'inference'}
            onClick={() => setActiveTab('inference')}
            icon={Radio}
            label="Live Inference"
            testId="tab-inference"
          />
        </nav>
      </div>

      {/* Tab Content */}
      <div data-testid="speaker-rec-tab-content">
        {activeTab === 'status' && (
          <StatusTab serviceUrl={serviceUrl} serviceStatus={serviceStatus} />
        )}
        {activeTab === 'speakers' && (
          <SpeakersTab speakers={speakers} onRefresh={() => fetchSpeakers(serviceUrl)} />
        )}
        {activeTab === 'enrollment' && (
          <EnrollmentTab serviceUrl={serviceUrl} onComplete={() => fetchSpeakers(serviceUrl)} />
        )}
        {activeTab === 'inference' && (
          <InferenceTab serviceUrl={serviceUrl} />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

interface StatusCardProps {
  label: string
  value: string
  icon: React.ElementType
  status: 'success' | 'error' | 'neutral'
}

function StatusCard({ label, value, icon: Icon, status }: StatusCardProps) {
  const statusColors = {
    success: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
    error: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
    neutral: 'text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800',
  }

  return (
    <div className="card p-4">
      <div className="flex items-center space-x-3">
        <div className={`p-2 rounded-lg ${statusColors[status]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{label}</p>
          <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
        </div>
      </div>
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  testId: string
}

function TabButton({ active, onClick, icon: Icon, label, testId }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
        active
          ? 'border-primary-500 text-primary-600 dark:text-primary-400'
          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-300'
      }`}
      data-testid={testId}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}

// Tab: Status
interface StatusTabProps {
  serviceUrl: string
  serviceStatus: ServiceStatus | null
}

function StatusTab({ serviceUrl, serviceStatus }: StatusTabProps) {
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Service Information
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-neutral-600 dark:text-neutral-400">API Endpoint:</span>
            <code className="ml-2 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-neutral-700 dark:text-neutral-300">
              {serviceUrl}
            </code>
          </div>
          <div>
            <span className="text-neutral-600 dark:text-neutral-400">Device:</span>
            <span className="ml-2 font-medium text-neutral-900 dark:text-neutral-100">
              {serviceStatus?.device || 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickActionCard
            icon={UserPlus}
            label="Enroll Speaker"
            description="Add a new speaker"
            onClick={() => window.open(`${serviceUrl.replace(':8085', ':5174')}/enrollment`, '_blank')}
          />
          <QuickActionCard
            icon={Radio}
            label="Live Inference"
            description="Identify speakers in real-time"
            onClick={() => window.open(`${serviceUrl.replace(':8085', ':5174')}/infer-live`, '_blank')}
          />
          <QuickActionCard
            icon={Mic}
            label="Audio Viewer"
            description="Visualize audio files"
            onClick={() => window.open(`${serviceUrl.replace(':8085', ':5174')}/audio`, '_blank')}
          />
          <QuickActionCard
            icon={Activity}
            label="API Docs"
            description="View API documentation"
            onClick={() => window.open(`${serviceUrl}/docs`, '_blank')}
          />
        </div>
      </div>
    </div>
  )
}

interface QuickActionCardProps {
  icon: React.ElementType
  label: string
  description: string
  onClick: () => void
}

function QuickActionCard({ icon: Icon, label, description, onClick }: QuickActionCardProps) {
  return (
    <button
      onClick={onClick}
      className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700 transition-colors text-left"
    >
      <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400 mb-2" />
      <h4 className="font-medium text-neutral-900 dark:text-neutral-100">{label}</h4>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">{description}</p>
    </button>
  )
}

// Tab: Speakers List
interface SpeakersTabProps {
  speakers: Speaker[]
  onRefresh: () => void
}

function SpeakersTab({ speakers, onRefresh }: SpeakersTabProps) {
  if (speakers.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Users className="h-12 w-12 mx-auto text-neutral-400 mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          No Speakers Enrolled
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          Enroll speakers to start identifying them in audio.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Enrolled Speakers ({speakers.length})
        </h3>
        <button onClick={onRefresh} className="btn-secondary text-sm">
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </button>
      </div>

      <div className="grid gap-4">
        {speakers.map((speaker) => (
          <div key={speaker.id} className="card p-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                <Users className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                  {speaker.name}
                </h4>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {speaker.audio_sample_count} samples · {speaker.total_audio_duration.toFixed(1)}s audio
                </p>
              </div>
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              ID: {speaker.id}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Tab: Enrollment (placeholder - links to full WebUI)
interface EnrollmentTabProps {
  serviceUrl: string
  onComplete: () => void
}

function EnrollmentTab({ serviceUrl }: EnrollmentTabProps) {
  const openEnrollment = () => {
    window.open(`${serviceUrl.replace(':8085', ':5174')}/enrollment`, '_blank')
  }

  return (
    <div className="card p-8 text-center">
      <UserPlus className="h-12 w-12 mx-auto text-primary-600 dark:text-primary-400 mb-4" />
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
        Speaker Enrollment
      </h3>
      <p className="text-neutral-600 dark:text-neutral-400 mb-6">
        Enroll new speakers by recording or uploading audio samples.
        The full enrollment interface provides quality assessment and batch upload features.
      </p>
      <button onClick={openEnrollment} className="btn-primary flex items-center justify-center space-x-2 mx-auto">
        <ExternalLink className="h-4 w-4" />
        <span>Open Enrollment Interface</span>
      </button>
    </div>
  )
}

// Tab: Live Inference
interface InferenceTabProps {
  serviceUrl: string
}

function InferenceTab({ serviceUrl }: InferenceTabProps) {
  const [isRecording, setIsRecording] = useState(false)

  const openLiveInference = () => {
    window.open(`${serviceUrl.replace(':8085', ':5174')}/infer-live`, '_blank')
  }

  return (
    <div className="space-y-6">
      <div className="card p-6 text-center">
        <Radio className="h-12 w-12 mx-auto text-primary-600 dark:text-primary-400 mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          Live Speaker Identification
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Identify enrolled speakers in real-time using your microphone or uploaded audio.
          The full interface provides waveform visualization and transcription support.
        </p>

        <div className="flex justify-center space-x-4">
          <button
            onClick={() => setIsRecording(!isRecording)}
            disabled
            className={`btn-primary flex items-center space-x-2 opacity-50 cursor-not-allowed ${
              isRecording ? 'bg-red-600 hover:bg-red-700' : ''
            }`}
            title="Use the full UI for live recording"
          >
            {isRecording ? (
              <>
                <Square className="h-4 w-4" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>Start Recording</span>
              </>
            )}
          </button>

          <button
            onClick={openLiveInference}
            className="btn-secondary flex items-center space-x-2"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Open Full Interface</span>
          </button>
        </div>
      </div>
    </div>
  )
}
