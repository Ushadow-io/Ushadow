import { useState, useEffect } from 'react'
import { Bot, Plus, Cpu, Play, Pause, Trash2, MessageSquare, RefreshCw, Clock, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { agentZeroApi } from '../services/api'
import type { Agent, AgentZeroStatus } from '../services/api'

export default function AgentZeroPage() {
  const { isDark } = useTheme()
  const [status, setStatus] = useState<AgentZeroStatus | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [statusRes, agentsRes] = await Promise.all([
        agentZeroApi.getStatus(),
        agentZeroApi.getAgents(),
      ])
      setStatus(statusRes.data)
      setAgents(agentsRes.data)
    } catch (err) {
      console.error('Failed to fetch Agent Zero data:', err)
      setError('Failed to connect to Agent Zero service')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleActivate = async (agentId: string) => {
    setActionLoading(agentId)
    try {
      await agentZeroApi.activateAgent(agentId)
      await fetchData()
    } catch (err) {
      console.error('Failed to activate agent:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeactivate = async (agentId: string) => {
    setActionLoading(agentId)
    try {
      await agentZeroApi.deactivateAgent(agentId)
      await fetchData()
    } catch (err) {
      console.error('Failed to deactivate agent:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (agentId: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return
    setActionLoading(agentId)
    try {
      await agentZeroApi.deleteAgent(agentId)
      await fetchData()
    } catch (err) {
      console.error('Failed to delete agent:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div id="agent-zero-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Bot className="h-8 w-8" style={{ color: '#4ade80' }} />
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
            Autonomous agents that activate based on your conversations
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-surface-600 transition-colors"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
            title="Refresh"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/chat"
            id="agent-zero-new-agent-btn"
            className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: '#4ade80',
              color: '#0f0f13',
            }}
          >
            <Plus className="h-5 w-5" />
            <span>Create in Chat</span>
          </Link>
        </div>
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
              backgroundColor: status?.connected
                ? 'rgba(74, 222, 128, 0.15)'
                : 'rgba(248, 113, 113, 0.15)',
              color: status?.connected ? '#4ade80' : '#f87171',
            }}
          >
            {loading ? 'Checking...' : status?.connected ? 'Connected' : 'Not Connected'}
          </span>
        </div>
        {status?.connected && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: isDark ? 'var(--surface-600)' : '#e4e4e7' }}>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span style={{ color: isDark ? 'var(--text-muted)' : '#a1a1aa' }}>Total Agents</span>
                <p className="text-lg font-semibold" style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}>
                  {status.agent_count}
                </p>
              </div>
              <div>
                <span style={{ color: isDark ? 'var(--text-muted)' : '#a1a1aa' }}>Active Agents</span>
                <p className="text-lg font-semibold text-green-400">
                  {status.active_agents}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
        >
          {error}
        </div>
      )}

      {/* Agents List */}
      {agents.length === 0 ? (
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
            No Agents Yet
          </h3>
          <p
            className="mb-6 max-w-md mx-auto"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Create agents by describing what you want in the chat. For example:
            <br />
            <em className="text-green-400">"When I am having a book review club, summarize the main plot points"</em>
          </p>
          <Link
            to="/chat"
            id="agent-zero-create-first-btn"
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: '#4ade80',
              color: '#0f0f13',
            }}
          >
            <MessageSquare className="h-5 w-5" />
            <span>Create Agent in Chat</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
          >
            Your Agents
          </h2>
          {agents.map(agent => (
            <div
              key={agent.id}
              className="rounded-xl p-6"
              style={{
                backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
                border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
                boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div
                    className="p-3 rounded-lg"
                    style={{
                      backgroundColor: agent.status === 'active'
                        ? 'rgba(74, 222, 128, 0.15)'
                        : 'rgba(161, 161, 170, 0.15)',
                    }}
                  >
                    <Bot
                      className="h-6 w-6"
                      style={{ color: agent.status === 'active' ? '#4ade80' : '#a1a1aa' }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3
                        className="font-semibold"
                        style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                      >
                        {agent.name}
                      </h3>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: agent.status === 'active'
                            ? 'rgba(74, 222, 128, 0.15)'
                            : 'rgba(161, 161, 170, 0.15)',
                          color: agent.status === 'active' ? '#4ade80' : '#a1a1aa',
                        }}
                      >
                        {agent.status}
                      </span>
                    </div>
                    <p
                      className="text-sm mt-1"
                      style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                    >
                      {agent.description}
                    </p>
                    {agent.trigger.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {agent.trigger.keywords.map((keyword, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{
                              backgroundColor: isDark ? 'var(--surface-600)' : '#e4e4e7',
                              color: isDark ? 'var(--text-secondary)' : '#52525b',
                            }}
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center space-x-4 mt-3 text-xs" style={{ color: isDark ? 'var(--text-muted)' : '#a1a1aa' }}>
                      <span className="flex items-center">
                        <Zap className="h-3 w-3 mr-1" />
                        Used {agent.use_count} time{agent.use_count !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        Last used: {formatDate(agent.last_used_at)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {agent.status === 'active' ? (
                    <button
                      onClick={() => handleDeactivate(agent.id)}
                      disabled={actionLoading === agent.id}
                      className="p-2 rounded-lg hover:bg-surface-600 transition-colors"
                      style={{ color: '#f59e0b' }}
                      title="Pause agent"
                    >
                      <Pause className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivate(agent.id)}
                      disabled={actionLoading === agent.id}
                      className="p-2 rounded-lg hover:bg-surface-600 transition-colors"
                      style={{ color: '#4ade80' }}
                      title="Activate agent"
                    >
                      <Play className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(agent.id)}
                    disabled={actionLoading === agent.id}
                    className="p-2 rounded-lg hover:bg-surface-600 transition-colors"
                    style={{ color: '#ef4444' }}
                    title="Delete agent"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
            Natural Language Creation
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Describe what you want in chat and agents are created automatically
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
            Context-Aware Triggers
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Agents automatically activate when relevant keywords appear in your chat
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
            Structured Output
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Agents produce organized responses with customizable output sections
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
            Usage Tracking
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Monitor how often each agent is used and when it was last active
          </p>
        </div>
      </div>
    </div>
  )
}
