import { useState, useEffect } from 'react'
import { MessageSquare, ListTodo, LogIn, LogOut, AlertCircle, Settings, Radio, RefreshCw, WifiOff } from 'lucide-react'
import { chronicleAuthApi, getChronicleBaseUrl, setChronicleUrl } from '../services/chronicleApi'
import ChronicleConversations from '../components/chronicle/ChronicleConversations'
import ChronicleQueue from '../components/chronicle/ChronicleQueue'
import ChronicleRecording from '../components/chronicle/ChronicleRecording'
import { getStorageKey } from '../utils/storage'
import { useChronicle } from '../contexts/ChronicleContext'

type TabType = 'recording' | 'conversations' | 'queue'
type ConnectionState = 'loading' | 'connected' | 'unavailable' | 'needs-login'

export default function ChroniclePage() {
  const [activeTab, setActiveTab] = useState<TabType>('recording')
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [chronicleUrl, setChronicleUrlState] = useState('')

  // Get recording from context (shared with Layout header button)
  const { recording, checkConnection } = useChronicle()

  // Login form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [chronicleUrlInput, setChronicleUrlInput] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  useEffect(() => {
    autoConnect()
  }, [])

  const autoConnect = async () => {
    console.log('[Chronicle] autoConnect: starting...')
    setConnectionState('loading')
    setLoginError(null)
    try {
      console.log('[Chronicle] autoConnect: calling chronicleAuthApi.autoConnect()')
      const result = await chronicleAuthApi.autoConnect()
      console.log('[Chronicle] autoConnect: result =', result)
      setChronicleUrlState(result.url)
      setChronicleUrlInput(result.url)

      if (result.connected) {
        console.log('[Chronicle] autoConnect: connected successfully via JWT token')
        setConnectionState('connected')
        // Update context so header record button appears
        checkConnection()
      } else if (result.needsLogin) {
        console.log('[Chronicle] autoConnect: needs manual login')
        setConnectionState('needs-login')
      } else {
        console.log('[Chronicle] autoConnect: Chronicle unavailable')
        setConnectionState('unavailable')
      }
    } catch (error) {
      console.error('[Chronicle] autoConnect: failed with error:', error)
      // Fall back to saved URL
      const savedUrl = localStorage.getItem(getStorageKey('chronicle_url')) || 'http://localhost:8080'
      setChronicleUrlState(savedUrl)
      setChronicleUrlInput(savedUrl)
      setConnectionState('unavailable')
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoggingIn(true)
    setLoginError(null)

    try {
      // Save the URL first
      setChronicleUrl(chronicleUrlInput)

      await chronicleAuthApi.login(email, password)
      setConnectionState('connected')
      setEmail('')
      setPassword('')
      // Update context so header record button appears
      checkConnection()
    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 401) {
        setLoginError('Invalid email or password')
      } else if (!error.response) {
        setLoginError('Cannot connect to Chronicle backend. Check the URL and ensure the service is running.')
      } else {
        setLoginError('Login failed. Please try again.')
      }
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = () => {
    chronicleAuthApi.logout()
    setConnectionState('needs-login')
  }

  const handleAuthRequired = () => {
    // Called when a component detects auth is needed
    setConnectionState('needs-login')
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

          <div className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
            <span className="font-medium">URL:</span>{' '}
            <code className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded">
              {chronicleUrl || 'Not configured'}
            </code>
          </div>

          <button
            onClick={autoConnect}
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

  // Login form when authentication is needed
  if (connectionState === 'needs-login') {
    return (
      <div className="space-y-6" data-testid="chronicle-login-page">
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

        {/* Login Card */}
        <div className="card p-6 max-w-md mx-auto" data-testid="chronicle-login-form">
          <div className="flex items-center space-x-2 mb-6">
            <LogIn className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Connect to Chronicle
            </h2>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-2" data-testid="login-error">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-700 dark:text-red-300">{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Chronicle URL */}
            <div>
              <label htmlFor="chronicle-url" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Chronicle Backend URL
              </label>
              <input
                type="url"
                id="chronicle-url"
                value={chronicleUrlInput}
                onChange={(e) => setChronicleUrlInput(e.target.value)}
                placeholder="http://localhost:8080"
                className="input w-full"
                data-testid="chronicle-url-input"
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Auto-detected from backend. Change only if needed.
              </p>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="input w-full"
                required
                data-testid="chronicle-email-input"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input w-full"
                required
                data-testid="chronicle-password-input"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="btn-primary w-full flex items-center justify-center space-x-2"
              data-testid="chronicle-login-button"
            >
              {isLoggingIn ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  <span>Connect</span>
                </>
              )}
            </button>
          </form>
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
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn-secondary p-2"
            title="Settings"
            data-testid="chronicle-settings-button"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={handleLogout}
            className="btn-secondary flex items-center space-x-2"
            data-testid="chronicle-logout-button"
          >
            <LogOut className="h-4 w-4" />
            <span>Disconnect</span>
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="card p-4" data-testid="chronicle-settings-panel">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-2">Connection Settings</h3>
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-neutral-600 dark:text-neutral-400">Backend URL:</span>
            <code className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-neutral-700 dark:text-neutral-300">
              {chronicleUrl || getChronicleBaseUrl()}
            </code>
            <span className="badge badge-success">Connected</span>
          </div>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Using ushadow JWT for authentication (shared auth)
          </p>
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
          <ChronicleRecording onAuthRequired={handleAuthRequired} recording={recording} />
        )}
        {activeTab === 'conversations' && (
          <ChronicleConversations onAuthRequired={handleAuthRequired} />
        )}
        {activeTab === 'queue' && (
          <ChronicleQueue onAuthRequired={handleAuthRequired} />
        )}
      </div>
    </div>
  )
}
