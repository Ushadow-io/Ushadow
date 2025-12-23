import { Bot, Plus, Cpu } from 'lucide-react'

export default function AgentZeroPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Bot className="h-8 w-8 text-warning-600 dark:text-warning-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Agent Zero</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Autonomous agent orchestration and management
          </p>
        </div>
        <button className="btn-primary flex items-center space-x-2">
          <Plus className="h-5 w-5" />
          <span>New Agent</span>
        </button>
      </div>

      {/* Status Card */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Connection Status
        </h2>
        <div className="flex items-center justify-between">
          <span className="text-neutral-600 dark:text-neutral-400">Agent Zero Backend</span>
          <span className="badge badge-error">Not Connected</span>
        </div>
      </div>

      {/* Empty State */}
      <div className="card p-12 text-center">
        <Cpu className="h-16 w-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          No Active Agents
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Create and deploy autonomous agents to handle complex tasks and workflows.
        </p>
        <button className="btn-primary inline-flex items-center space-x-2">
          <Plus className="h-5 w-5" />
          <span>Create First Agent</span>
        </button>
      </div>

      {/* Capabilities Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Task Automation</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Automate complex multi-step tasks with intelligent agents
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Context Awareness</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Agents maintain context across conversations and sessions
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Tool Integration</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Connect agents with MCP servers and external tools
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Monitoring</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Track agent performance and task completion
          </p>
        </div>
      </div>
    </div>
  )
}
