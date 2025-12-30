import { MessageSquare, ExternalLink } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export default function ChroniclePage() {
  const { isDark } = useTheme()

  return (
    <div id="chronicle-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-8 w-8" style={{ color: '#4ade80' }} />
            <h1
              id="chronicle-title"
              className="text-3xl font-bold"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Chronicle
            </h1>
          </div>
          <p
            className="mt-2"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            AI-powered conversation and memory system
          </p>
        </div>
        <span
          id="chronicle-status-badge"
          className="px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: isDark ? 'var(--surface-600)' : '#e4e4e7',
            color: isDark ? 'var(--text-secondary)' : '#52525b',
          }}
        >
          Offline
        </span>
      </div>

      {/* Status Card */}
      <div
        id="chronicle-connection-card"
        className="rounded-xl p-6"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
        >
          Connection Status
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
              Chronicle Backend
            </span>
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: 'rgba(248, 113, 113, 0.15)',
                color: '#f87171',
              }}
            >
              Not Connected
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
              API Endpoint
            </span>
            <code
              className="text-sm px-2 py-1 rounded"
              style={{
                backgroundColor: isDark ? 'var(--surface-700)' : '#f4f4f5',
                color: isDark ? 'var(--text-secondary)' : '#52525b',
              }}
            >
              http://localhost:8000
            </code>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          id="chronicle-conversations-card"
          className="rounded-xl p-6"
          style={{
            backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
            border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
            boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h3
            className="font-semibold mb-2"
            style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
          >
            Conversations
          </h3>
          <p
            className="text-sm mb-4"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Browse and search your AI conversations
          </p>
          <button
            id="chronicle-view-conversations-btn"
            className="w-full px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: isDark ? 'var(--surface-600)' : '#e4e4e7',
              color: isDark ? 'var(--text-primary)' : '#0f0f13',
            }}
            disabled
          >
            View Conversations
          </button>
        </div>
        <div
          id="chronicle-memories-card"
          className="rounded-xl p-6"
          style={{
            backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
            border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
            boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h3
            className="font-semibold mb-2"
            style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
          >
            Memories
          </h3>
          <p
            className="text-sm mb-4"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Explore extracted memories and insights
          </p>
          <button
            id="chronicle-browse-memories-btn"
            className="w-full px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: isDark ? 'var(--surface-600)' : '#e4e4e7',
              color: isDark ? 'var(--text-primary)' : '#0f0f13',
            }}
            disabled
          >
            Browse Memories
          </button>
        </div>
      </div>

      {/* Setup Instructions */}
      <div
        id="chronicle-setup-card"
        className="rounded-xl p-6"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          borderLeft: '4px solid #4ade80',
          boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
        >
          Getting Started
        </h2>
        <ol className="space-y-3" style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
          <li className="flex items-start space-x-2">
            <span className="font-semibold" style={{ color: '#4ade80' }}>1.</span>
            <span>Configure Chronicle URL in Settings</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="font-semibold" style={{ color: '#4ade80' }}>2.</span>
            <span>Ensure Chronicle backend is running</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="font-semibold" style={{ color: '#4ade80' }}>3.</span>
            <span>Verify connection and start using features</span>
          </li>
        </ol>
        <div className="mt-6">
          <a
            id="chronicle-docs-link"
            href="https://github.com/chronicler-ai/chronicle"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: '#4ade80',
              color: isDark ? '#0f0f13' : '#ffffff',
            }}
          >
            <span>Chronicle Documentation</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  )
}
