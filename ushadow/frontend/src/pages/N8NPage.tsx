import { Workflow, Plus, GitBranch } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export default function N8NPage() {
  const { isDark } = useTheme()

  return (
    <div id="n8n-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Workflow className="h-8 w-8" style={{ color: '#60a5fa' }} />
            <h1
              id="n8n-title"
              className="text-3xl font-bold"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              n8n Workflows
            </h1>
          </div>
          <p
            className="mt-2"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Visual workflow automation and orchestration
          </p>
        </div>
        <button
          id="n8n-new-workflow-btn"
          className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: '#4ade80',
            color: isDark ? '#0f0f13' : '#ffffff',
          }}
        >
          <Plus className="h-5 w-5" />
          <span>New Workflow</span>
        </button>
      </div>

      {/* Status Card */}
      <div
        id="n8n-status-card"
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
        <div className="flex items-center justify-between">
          <span style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
            n8n Instance
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
      </div>

      {/* Empty State */}
      <div
        id="n8n-empty-state"
        className="rounded-xl p-12 text-center"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <GitBranch
          className="h-16 w-16 mx-auto mb-4"
          style={{ color: isDark ? 'var(--surface-400)' : '#a1a1aa' }}
        />
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
        >
          No Workflows Yet
        </h3>
        <p
          className="mb-6"
          style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
        >
          Create powerful automation workflows by connecting different services and APIs.
        </p>
        <button
          id="n8n-create-first-btn"
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: '#a855f7',
            color: '#ffffff',
          }}
        >
          <Plus className="h-5 w-5" />
          <span>Create First Workflow</span>
        </button>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          id="n8n-visual-editor-card"
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
            Visual Editor
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Design workflows with drag-and-drop interface
          </p>
        </div>
        <div
          id="n8n-integrations-card"
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
            400+ Integrations
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Connect with popular services and APIs
          </p>
        </div>
        <div
          id="n8n-custom-nodes-card"
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
            Custom Nodes
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Build your own workflow nodes
          </p>
        </div>
      </div>

      {/* Setup Instructions */}
      <div
        id="n8n-setup-card"
        className="rounded-xl p-6"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          borderLeft: '4px solid #60a5fa',
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
            <span className="font-semibold" style={{ color: '#60a5fa' }}>1.</span>
            <span>Configure n8n URL and credentials in Settings</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="font-semibold" style={{ color: '#60a5fa' }}>2.</span>
            <span>Ensure n8n instance is running and accessible</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="font-semibold" style={{ color: '#60a5fa' }}>3.</span>
            <span>Start creating automated workflows</span>
          </li>
        </ol>
      </div>
    </div>
  )
}
