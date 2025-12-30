import { Bot, Plus, Cpu } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export default function AgentZeroPage() {
  const { isDark } = useTheme()

  return (
    <div id="agent-zero-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Bot className="h-8 w-8" style={{ color: '#a855f7' }} />
            <h1
              id="agent-zero-title"
              className="text-3xl font-bold"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Agent Zero
            </h1>
          </div>
          <p
            className="mt-2"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Autonomous agent orchestration and management
          </p>
        </div>
        <button
          id="agent-zero-new-agent-btn"
          className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: '#4ade80',
            color: isDark ? '#0f0f13' : '#ffffff',
          }}
        >
          <Plus className="h-5 w-5" />
          <span>New Agent</span>
        </button>
      </div>

      {/* Status Card */}
      <div
        id="agent-zero-status-card"
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
            Agent Zero Backend
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
        id="agent-zero-empty-state"
        className="rounded-xl p-12 text-center"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Cpu
          className="h-16 w-16 mx-auto mb-4"
          style={{ color: isDark ? 'var(--surface-400)' : '#a1a1aa' }}
        />
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
        >
          No Active Agents
        </h3>
        <p
          className="mb-6"
          style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
        >
          Create and deploy autonomous agents to handle complex tasks and workflows.
        </p>
        <button
          id="agent-zero-create-first-btn"
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: '#a855f7',
            color: '#ffffff',
          }}
        >
          <Plus className="h-5 w-5" />
          <span>Create First Agent</span>
        </button>
      </div>

      {/* Capabilities Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          id="agent-zero-task-card"
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
            Task Automation
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Automate complex multi-step tasks with intelligent agents
          </p>
        </div>
        <div
          id="agent-zero-context-card"
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
            Context Awareness
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Agents maintain context across conversations and sessions
          </p>
        </div>
        <div
          id="agent-zero-tools-card"
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
            Tool Integration
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Connect agents with MCP servers and external tools
          </p>
        </div>
        <div
          id="agent-zero-monitoring-card"
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
            Monitoring
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Track agent performance and task completion
          </p>
        </div>
      </div>
    </div>
  )
}
