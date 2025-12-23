import { Plug, Plus, Server } from 'lucide-react'

export default function MCPPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Plug className="h-8 w-8 text-success-600 dark:text-success-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">MCP Hub</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Model Context Protocol server connections
          </p>
        </div>
        <button className="btn-primary flex items-center space-x-2">
          <Plus className="h-5 w-5" />
          <span>Add Server</span>
        </button>
      </div>

      {/* Empty State */}
      <div className="card p-12 text-center">
        <Server className="h-16 w-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          No MCP Servers Connected
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Connect to MCP servers to extend your AI capabilities with external tools and data sources.
        </p>
        <button className="btn-primary inline-flex items-center space-x-2">
          <Plus className="h-5 w-5" />
          <span>Connect First Server</span>
        </button>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Filesystem</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Access local files and directories
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Web Search</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Search the web in real-time
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Custom Tools</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Build your own MCP servers
          </p>
        </div>
      </div>
    </div>
  )
}
