import { useState, useEffect } from 'react'
import { MessageSquare, ListTodo, Settings, Radio, RefreshCw, WifiOff } from 'lucide-react'
import { isChronicleAvailable, getChronicleConnectionInfo } from '../services/chronicleApi'
import ChronicleConversations from '../components/chronicle/ChronicleConversations'
import ChronicleQueue from '../components/chronicle/ChronicleQueue'
import ChronicleRecording from '../components/chronicle/ChronicleRecording'
import { useChronicle } from '../contexts/ChronicleContext'

type TabType = 'recording' | 'conversations' | 'queue'
type ConnectionState = 'loading' | 'connected' | 'unavailable'

export default function ChroniclePage() {
  const [activeTab, setActiveTab] = useState<TabType>('recording')
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading')
  const [showSettings, setShowSettings] = useState(false)
  const [chronicleInfo, setChronicleInfo] = useState<any>(null)

  // Get recording from context (shared with Layout header button)
  const { recording, checkConnection } = useChronicle()

  useEffect(() => {
    checkChronicleStatus()
  }, [])

  const checkChronicleStatus = async () => {
    console.log('[Chronicle] Checking status...')
    setConnectionState('loading')

    try {
      const available = await isChronicleAvailable()
      const info = await getChronicleConnectionInfo()

      console.log('[Chronicle] Available:', available, 'Info:', info)
      setChronicleInfo(info)

      if (available) {
        console.log('[Chronicle] Connected successfully (auth via ushadow)')
        setConnectionState('connected')
        // Update context so header record button appears
        checkConnection()
      } else {
        console.log('[Chronicle] Service unavailable')
        setConnectionState('unavailable')
      }
    } catch (error) {
      console.error('[Chronicle] Failed to check status:', error)
      setConnectionState('unavailable')
    }
  }

  // Loading state
  if (connectionState === 'loading') {
    return (
      <div className="flex items-center justify-center h-64" data-testid="chronicle-loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-3 text-neutral-600 dark:text-neutral-400">Connecting to Chronicle...</span>
      </div>
    )
  }

  // Unavailable state - Chronicle backend not reachable
  if (connectionState === 'unavailable') {
    return (
      <div className="space-y-6" data-testid="chronicle-unavailable-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-8 w-8 text-primary-600 dark:text-primary-400" />
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Chronicle</h1>
            </div>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              AI-powered conversation and memory system
            </p>
          </div>
        </div>

        {/* Unavailable Card */}
        <div className="card p-6 max-w-md mx-auto" data-testid="chronicle-unavailable-card">
          <div className="flex items-center space-x-2 mb-4">
            <WifiOff className="h-6 w-6 text-amber-500" />
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Chronicle Unavailable
            </h2>
          </div>

          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            The Chronicle backend is not reachable. Make sure the Chronicle service is running.
          </p>

          {chronicleInfo && (
            <div className="text-sm text-neutral-500 dark:text-neutral-400 mb-4 space-y-1">
              <div>
                <span className="font-medium">Direct URL:</span>{' '}
                <code className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded">
                  {chronicleInfo.direct_url || 'Not available'}
                </code>
              </div>
              <div>
                <span className="font-medium">Port:</span>{' '}
                <code className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded">
                  {chronicleInfo.port || 'Not configured'}
                </code>
              </div>
            </div>
          )}

          <button
            onClick={checkChronicleStatus}
            className="btn-primary w-full flex items-center justify-center space-x-2"
            data-testid="chronicle-retry-button"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    )
  }

  // Main authenticated view with tabs
  return (
    <div className="space-y-6" data-testid="chronicle-main-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Chronicle</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            AI-powered conversation and memory system
          </p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="btn-secondary p-2"
          title="Connection Info"
          data-testid="chronicle-settings-button"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Connection Info Panel */}
      {showSettings && chronicleInfo && (
        <div className="card p-4" data-testid="chronicle-settings-panel">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3">Two-Tier Architecture</h3>

          {/* Control Plane */}
          <div className="mb-3">
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Control Plane (REST APIs)
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
              Conversations, Queue, Config → Proxied through ushadow
            </div>
            <code className="block px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-xs text-neutral-700 dark:text-neutral-300">
              {chronicleInfo.proxy_url}
            </code>
          </div>

          {/* Data Plane */}
          <div className="mb-3">
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Data Plane (WebSocket/Streaming)
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
              ws_pcm, Audio Streaming → Direct connection
            </div>
            <code className="block px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-xs text-neutral-700 dark:text-neutral-300">
              {chronicleInfo.direct_url}
            </code>
          </div>

          {/* Status */}
          <div className="flex items-center space-x-2">
            <span className="badge badge-success">Connected</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Port: {chronicleInfo.port} • Auth: Unified (ushadow JWT)
            </span>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-neutral-200 dark:border-neutral-700" data-testid="chronicle-tabs">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('recording')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
              activeTab === 'recording'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-300'
            }`}
            data-testid="tab-recording"
          >
            <Radio className="h-4 w-4" />
            <span>Record</span>
          </button>
          <button
            onClick={() => setActiveTab('conversations')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
              activeTab === 'conversations'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-300'
            }`}
            data-testid="tab-conversations"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Conversations</span>
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
              activeTab === 'queue'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-300'
            }`}
            data-testid="tab-queue"
          >
            <ListTodo className="h-4 w-4" />
            <span>Queue</span>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div data-testid="chronicle-tab-content">
        {activeTab === 'recording' && (
          <ChronicleRecording recording={recording} />
        )}
        {activeTab === 'conversations' && (
          <ChronicleConversations />
        )}
        {activeTab === 'queue' && (
          <ChronicleQueue />
        )}
      </div>
    </div>
  )
}
