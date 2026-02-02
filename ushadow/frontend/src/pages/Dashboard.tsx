import { Activity, MessageSquare, Clock, TrendingUp, Sparkles, Brain } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useDashboardData } from '../hooks/useDashboardData'
import { ActivityType } from '../services/api'

export default function Dashboard() {
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const { data, isLoading, error } = useDashboardData(10, 10)

  // Format timestamp as "2m ago", "Yesterday", etc.
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString()
  }

  // Get icon and color for activity type
  const getActivityStyle = (type: ActivityType) => {
    switch (type) {
      case ActivityType.CONVERSATION:
        return { icon: MessageSquare, color: '#4ade80' }
      case ActivityType.MEMORY:
        return { icon: Brain, color: '#22c55e' }
      default:
        return { icon: Activity, color: '#71717a' }
    }
  }

  // Combine and sort all activities by timestamp
  const allActivities = [
    ...(data?.recent_conversations || []),
    ...(data?.recent_memories || []),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Conversations Stat */}
        <div
          data-testid="stat-card-conversations"
          className="rounded-xl p-6 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
          onClick={() => navigate('/conversations')}
          style={{
            backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
            border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
            boxShadow: isDark
              ? '0 4px 20px rgba(74, 222, 128, 0.15), 0 4px 6px rgba(0, 0, 0, 0.4)'
              : '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
              >
                Conversations
              </p>
              <p
                className="mt-2 text-3xl font-bold"
                style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
              >
                {isLoading ? '...' : data?.stats.conversation_count || '0'}
              </p>
            </div>
            <MessageSquare
              className="h-12 w-12"
              style={{ color: '#4ade80' }}
            />
          </div>
        </div>

        {/* Memories Stat */}
        <div
          data-testid="stat-card-memories"
          className="rounded-xl p-6 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
          onClick={() => navigate('/memories')}
          style={{
            backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
            border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
            boxShadow: isDark
              ? '0 4px 20px rgba(34, 197, 94, 0.15), 0 4px 6px rgba(0, 0, 0, 0.4)'
              : '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
              >
                Memories
              </p>
              <p
                className="mt-2 text-3xl font-bold"
                style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
              >
                {isLoading ? '...' : data?.stats.memory_count || '0'}
              </p>
            </div>
            <Brain
              className="h-12 w-12"
              style={{ color: '#22c55e' }}
            />
          </div>
        </div>
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

        {isLoading ? (
          <div className="text-center py-12">
            <div
              className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
              style={{ borderColor: '#4ade80' }}
            />
            <p
              className="mt-4"
              style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
            >
              Loading activities...
            </p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <TrendingUp
              className="h-12 w-12 mx-auto mb-4"
              style={{ color: isDark ? 'var(--surface-500)' : '#d4d4d8' }}
            />
            <p style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
              Failed to load activities. Please try again.
            </p>
          </div>
        ) : !allActivities.length ? (
          <div className="text-center py-12">
            <TrendingUp
              className="h-12 w-12 mx-auto mb-4"
              style={{ color: isDark ? 'var(--surface-500)' : '#d4d4d8' }}
            />
            <p style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
              No activity yet. Start a conversation or create memories to see activity here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {allActivities.map((activity) => {
              const style = getActivityStyle(activity.type)
              const Icon = style.icon

              return (
                <div
                  key={activity.id}
                  data-testid={`activity-${activity.id}`}
                  className="flex items-start space-x-3 p-3 rounded-lg transition-colors duration-150 hover:bg-opacity-80"
                  style={{
                    backgroundColor: isDark ? 'var(--surface-700)' : '#f9fafb',
                    border: `1px solid ${isDark ? 'var(--surface-600)' : '#e5e7eb'}`,
                  }}
                >
                  <div
                    className="rounded-full p-2 flex-shrink-0"
                    style={{
                      backgroundColor: isDark ? 'var(--surface-600)' : '#ffffff',
                    }}
                  >
                    <Icon className="h-4 w-4" style={{ color: style.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className="font-medium text-sm truncate"
                      style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                    >
                      {activity.title}
                    </p>
                    {activity.description && (
                      <p
                        className="text-sm mt-1 line-clamp-2"
                        style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
                      >
                        {activity.description}
                      </p>
                    )}
                    <div className="flex items-center space-x-2 mt-1">
                      <Clock className="h-3 w-3" style={{ color: '#9ca3af' }} />
                      <span className="text-xs" style={{ color: '#9ca3af' }}>
                        {formatTimestamp(activity.timestamp)}
                      </span>
                      {activity.source && (
                        <>
                          <span style={{ color: '#9ca3af' }}>•</span>
                          <span className="text-xs" style={{ color: '#9ca3af' }}>
                            {activity.source}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            data-testid="action-start-conversation"
            onClick={() => navigate('/chat')}
            className="py-3 px-4 rounded-lg font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: '#4ade80',
              color: '#0f0f13',
              boxShadow: isDark
                ? '0 0 20px rgba(74, 222, 128, 0.2)'
                : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            Start Chat
          </button>
          <button
            data-testid="action-view-conversations"
            onClick={() => navigate('/conversations')}
            className="py-3 px-4 rounded-lg font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: '#22c55e',
              color: '#0f0f13',
              boxShadow: isDark
                ? '0 0 20px rgba(34, 197, 94, 0.2)'
                : '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
          >
            View Conversations
          </button>
        </div>
      </div>
    </div>
  )
}
