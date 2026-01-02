import { Activity, MessageSquare, Plug, Bot, Workflow, TrendingUp, Sparkles } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useFeatureFlags } from '../contexts/FeatureFlagsContext'

export default function Dashboard() {
  const { isDark } = useTheme()
  const { isEnabled } = useFeatureFlags()

  // Define all stats with optional feature flag requirements
  const allStats = [
    {
      label: 'Conversations',
      value: '0',
      icon: MessageSquare,
      accentColor: '#4ade80', // primary-400
      glowColor: 'rgba(74, 222, 128, 0.15)'
    },
    {
      label: 'MCP Servers',
      value: '0',
      icon: Plug,
      accentColor: '#22c55e', // primary-500
      glowColor: 'rgba(34, 197, 94, 0.15)',
      featureFlag: 'mcp_hub'
    },
    {
      label: 'Active Agents',
      value: '0',
      icon: Bot,
      accentColor: '#c084fc', // accent-400
      glowColor: 'rgba(192, 132, 252, 0.15)',
      featureFlag: 'agent_zero'
    },
    {
      label: 'n8n Workflows',
      value: '0',
      icon: Workflow,
      accentColor: '#a855f7', // accent-500
      glowColor: 'rgba(168, 85, 247, 0.15)',
      featureFlag: 'n8n_workflows'
    },
  ]

  // Filter stats based on feature flags
  const stats = allStats.filter(stat => {
    if (!stat.featureFlag) return true
    return isEnabled(stat.featureFlag)
  })

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-bold"
          style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
        >
          Dashboard
        </h1>
        <p
          className="mt-2"
          style={{ color: isDark ? 'var(--text-secondary)' : '#52525b' }}
        >
          Welcome to your AI orchestration platform
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            data-testid={`stat-card-${stat.label.toLowerCase().replace(' ', '-')}`}
            className="rounded-xl p-6 transition-all duration-200 hover:scale-[1.02]"
            style={{
              backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
              border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
              boxShadow: isDark
                ? `0 4px 20px ${stat.glowColor}, 0 4px 6px rgba(0, 0, 0, 0.4)`
                : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                >
                  {stat.label}
                </p>
                <p
                  className="mt-2 text-3xl font-bold"
                  style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                >
                  {stat.value}
                </p>
              </div>
              <stat.icon
                className="h-12 w-12"
                style={{ color: stat.accentColor }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Activity Feed */}
      <div
        className="rounded-xl p-6"
        data-testid="activity-feed"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          boxShadow: isDark
            ? '0 4px 6px rgba(0, 0, 0, 0.4)'
            : '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div className="flex items-center space-x-2 mb-4">
          <Activity
            className="h-5 w-5"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          />
          <h2
            className="text-xl font-semibold"
            style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
          >
            Recent Activity
          </h2>
        </div>
        <div className="text-center py-12">
          <TrendingUp
            className="h-12 w-12 mx-auto mb-4"
            style={{ color: isDark ? 'var(--surface-500)' : '#d4d4d8' }}
          />
          <p style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
            No activity yet. Start by configuring your services in Settings.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div
        className="rounded-xl p-6"
        data-testid="quick-actions"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          boxShadow: isDark
            ? '0 4px 6px rgba(0, 0, 0, 0.4)'
            : '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div className="flex items-center space-x-2 mb-4">
          <Sparkles
            className="h-5 w-5"
            style={{ color: '#4ade80' }}
          />
          <h2
            className="text-xl font-semibold"
            style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
          >
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            data-testid="action-start-conversation"
            className="py-3 px-4 rounded-lg font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: '#4ade80',
              color: '#0f0f13',
              boxShadow: isDark
                ? '0 0 20px rgba(74, 222, 128, 0.2)'
                : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            Start Conversation
          </button>
          {isEnabled('mcp_hub') && (
            <button
              data-testid="action-connect-mcp"
              className="py-3 px-4 rounded-lg font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: '#a855f7',
                color: '#ffffff',
                boxShadow: isDark
                  ? '0 0 20px rgba(168, 85, 247, 0.2)'
                  : '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
            >
              Connect MCP Server
            </button>
          )}
          {isEnabled('n8n_workflows') && (
            <button
              data-testid="action-create-workflow"
              className="py-3 px-4 rounded-lg font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundImage: 'linear-gradient(135deg, #4ade80 0%, #a855f7 100%)',
                color: '#0f0f13',
                boxShadow: isDark
                  ? '0 0 20px rgba(74, 222, 128, 0.2), 0 0 40px rgba(168, 85, 247, 0.2)'
                  : '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
            >
              Create Workflow
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
