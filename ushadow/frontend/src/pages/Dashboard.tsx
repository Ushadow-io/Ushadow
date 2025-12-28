import { Activity, MessageSquare, Plug, Bot, Workflow, TrendingUp } from 'lucide-react'

export default function Dashboard() {
  const stats = [
    { label: 'Conversations', value: '0', icon: MessageSquare, color: 'text-primary-600 dark:text-primary-400' },
    { label: 'MCP Servers', value: '0', icon: Plug, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Active Agents', value: '0', icon: Bot, color: 'text-amber-600 dark:text-amber-400' },
    { label: 'n8n Workflows', value: '0', icon: Workflow, color: 'text-purple-600 dark:text-purple-400' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Dashboard</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Welcome to your AI orchestration platform
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card-hover p-6 backdrop-blur-sm bg-white/70 dark:bg-neutral-800/70 shadow-lg border border-neutral-200/50 dark:border-neutral-700/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                  {stat.label}
                </p>
                <p className="mt-2 text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                  {stat.value}
                </p>
              </div>
              <stat.icon className={`h-12 w-12 ${stat.color}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Activity Feed */}
      <div className="card p-6 backdrop-blur-sm bg-white/70 dark:bg-neutral-800/70 shadow-lg border border-neutral-200/50 dark:border-neutral-700/50">
        <div className="flex items-center space-x-2 mb-4">
          <Activity className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Recent Activity
          </h2>
        </div>
        <div className="text-center py-12">
          <TrendingUp className="h-12 w-12 text-neutral-400 dark:text-neutral-600 mx-auto mb-4" />
          <p className="text-neutral-600 dark:text-neutral-400">
            No activity yet. Start by configuring your services in Settings.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-6 backdrop-blur-sm bg-white/70 dark:bg-neutral-800/70 shadow-lg border border-neutral-200/50 dark:border-neutral-700/50">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="btn-primary py-3 shadow-md hover:shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98]">
            Start Conversation
          </button>
          <button className="btn-primary py-3 shadow-md hover:shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98]">
            Connect MCP Server
          </button>
          <button className="btn-primary py-3 shadow-md hover:shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98]">
            Create Workflow
          </button>
        </div>
      </div>
    </div>
  )
}
