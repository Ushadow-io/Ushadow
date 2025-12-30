import { Plug, Plus, Server } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export default function MCPPage() {
  const { isDark } = useTheme()

  return (
    <div id="mcp-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Plug className="h-8 w-8" style={{ color: '#4ade80' }} />
            <h1
              id="mcp-title"
              className="text-3xl font-bold"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              MCP Hub
            </h1>
          </div>
          <p
            className="mt-2"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Model Context Protocol server connections
          </p>
        </div>
        <button
          id="mcp-add-server-btn"
          className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: '#4ade80',
            color: isDark ? '#0f0f13' : '#ffffff',
          }}
        >
          <Plus className="h-5 w-5" />
          <span>Add Server</span>
        </button>
      </div>

      {/* Empty State */}
      <div
        id="mcp-empty-state"
        className="rounded-xl p-12 text-center"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Server
          className="h-16 w-16 mx-auto mb-4"
          style={{ color: isDark ? 'var(--surface-400)' : '#a1a1aa' }}
        />
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
        >
          No MCP Servers Connected
        </h3>
        <p
          className="mb-6"
          style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
        >
          Connect to MCP servers to extend your AI capabilities with external tools and data sources.
        </p>
        <button
          id="mcp-connect-first-btn"
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: '#a855f7',
            color: '#ffffff',
          }}
        >
          <Plus className="h-5 w-5" />
          <span>Connect First Server</span>
        </button>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          id="mcp-filesystem-card"
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
            Filesystem
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Access local files and directories
          </p>
        </div>
        <div
          id="mcp-websearch-card"
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
            Web Search
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Search the web in real-time
          </p>
        </div>
        <div
          id="mcp-custom-card"
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
            Custom Tools
          </h3>
          <p
            className="text-sm"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Build your own MCP servers
          </p>
        </div>
      </div>
    </div>
  )
}
