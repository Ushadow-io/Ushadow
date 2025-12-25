import { useState, useEffect } from 'react'
import { Server, Plus, RefreshCw, Copy, Trash2, CheckCircle, XCircle, Clock, Monitor, HardDrive, Cpu, Check } from 'lucide-react'
import { clusterApi } from '../services/api'

interface UNode {
  id: string
  hostname: string
  display_name: string
  role: 'leader' | 'worker' | 'standby'
  platform: string
  tailscale_ip: string
  status: 'online' | 'offline' | 'connecting' | 'error'
  last_seen: string
  registered_at: string
  manager_version: string
  services: string[]
  capabilities: {
    can_run_docker: boolean
    can_run_gpu: boolean
    available_memory_mb: number
    available_cpu_cores: number
    available_disk_gb: number
  }
  metadata?: {
    last_metrics?: {
      cpu_percent?: number
      memory_percent?: number
      disk_percent?: number
      containers_running?: number
    }
  }
}

interface JoinToken {
  token: string
  expires_at: string
  join_command: string
  join_command_powershell: string
}

export default function ClusterPage() {
  const [unodes, setUnodes] = useState<UNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [newToken, setNewToken] = useState<JoinToken | null>(null)
  const [creatingToken, setCreatingToken] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    loadUnodes()
    const interval = setInterval(loadUnodes, 15000) // Refresh every 15s
    return () => clearInterval(interval)
  }, [])

  const loadUnodes = async () => {
    try {
      setError(null)
      const response = await clusterApi.listUnodes()
      setUnodes(response.data.unodes)
    } catch (err: any) {
      console.error('Error loading u-nodes:', err)
      setError(err.response?.data?.detail || 'Failed to load cluster nodes')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateToken = async () => {
    try {
      setCreatingToken(true)
      const response = await clusterApi.createToken({
        role: 'worker',
        max_uses: 10,
        expires_in_hours: 72
      })
      setNewToken(response.data)
      setShowTokenModal(true)
    } catch (err: any) {
      console.error('Error creating token:', err)
      alert(`Failed to create token: ${err.response?.data?.detail || err.message}`)
    } finally {
      setCreatingToken(false)
    }
  }

  const handleRemoveNode = async (hostname: string) => {
    if (!confirm(`Remove ${hostname} from the cluster?`)) return
    try {
      await clusterApi.removeUnode(hostname)
      loadUnodes()
    } catch (err: any) {
      alert(`Failed to remove node: ${err.response?.data?.detail || err.message}`)
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-success-600 dark:text-success-400'
      case 'offline': return 'text-neutral-500 dark:text-neutral-400'
      case 'connecting': return 'text-warning-600 dark:text-warning-400'
      case 'error': return 'text-danger-600 dark:text-danger-400'
      default: return 'text-neutral-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <CheckCircle className={`h-5 w-5 ${getStatusColor(status)}`} />
      case 'offline': return <XCircle className={`h-5 w-5 ${getStatusColor(status)}`} />
      case 'connecting': return <Clock className={`h-5 w-5 ${getStatusColor(status)} animate-pulse`} />
      default: return <XCircle className={`h-5 w-5 ${getStatusColor(status)}`} />
    }
  }

  const getPlatformIcon = (_platform: string) => {
    return <Monitor className="h-4 w-4" />
  }

  const formatBytes = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${mb} MB`
  }

  const getJoinCommand = () => {
    if (!newToken) return ''
    // Extract leader IP from the join command or use current backend
    const leaderMatch = newToken.join_command.match(/http:\/\/([^:]+):(\d+)/)
    const leader = leaderMatch ? leaderMatch[1] : window.location.hostname
    const port = leaderMatch ? leaderMatch[2] : '8000'
    return `irm http://${leader}:${port}/api/unodes/bootstrap/${newToken.token}/ps1 | iex`
  }

  const onlineCount = unodes.filter(n => n.status === 'online').length
  const totalCores = unodes.reduce((sum, n) => sum + (n.capabilities?.available_cpu_cores || 0), 0)
  const totalMemory = unodes.reduce((sum, n) => sum + (n.capabilities?.available_memory_mb || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Cluster</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Manage distributed u-nodes in your cluster
          </p>
        </div>
        <button
          className="btn-primary flex items-center space-x-2"
          onClick={handleCreateToken}
          disabled={creatingToken}
        >
          {creatingToken ? (
            <RefreshCw className="h-5 w-5 animate-spin" />
          ) : (
            <Plus className="h-5 w-5" />
          )}
          <span>Add Node</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Nodes</p>
          <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{unodes.length}</p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Online</p>
          <p className="mt-2 text-2xl font-bold text-success-600 dark:text-success-400">{onlineCount}</p>
        </div>
        <div className="card-hover p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total CPU</p>
            <p className="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400">{totalCores}</p>
          </div>
          <Cpu className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
        </div>
        <div className="card-hover p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Memory</p>
            <p className="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400">{formatBytes(totalMemory)}</p>
          </div>
          <HardDrive className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="card p-4 border-l-4 border-danger-600 bg-danger-50 dark:bg-danger-900/20">
          <p className="text-danger-900 dark:text-danger-200">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <RefreshCw className="h-12 w-12 text-neutral-400 mx-auto mb-4 animate-spin" />
          <p className="text-neutral-600 dark:text-neutral-400">Loading cluster...</p>
        </div>
      )}

      {/* Nodes Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {unodes.map((node) => (
            <div key={node.id} className="card-hover p-6">
              {/* Node Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${node.role === 'leader' ? 'bg-warning-100 dark:bg-warning-900/30' : 'bg-primary-100 dark:bg-primary-900/30'}`}>
                    <Server className={`h-6 w-6 ${node.role === 'leader' ? 'text-warning-600 dark:text-warning-400' : 'text-primary-600 dark:text-primary-400'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {node.hostname}
                    </h3>
                    <div className="flex items-center space-x-2 text-xs text-neutral-600 dark:text-neutral-400">
                      {getPlatformIcon(node.platform)}
                      <span className="capitalize">{node.platform}</span>
                      <span className="text-neutral-400">|</span>
                      <span className="capitalize">{node.role}</span>
                    </div>
                  </div>
                </div>
                {getStatusIcon(node.status)}
              </div>

              {/* Node IP */}
              <div className="mb-4 text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">IP: </span>
                <span className="font-mono text-neutral-700 dark:text-neutral-300">{node.tailscale_ip}</span>
              </div>

              {/* Metrics */}
              {node.metadata?.last_metrics && (
                <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
                  <div className="bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1 text-center">
                    <div className="text-neutral-500 dark:text-neutral-400">CPU</div>
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {node.metadata.last_metrics.cpu_percent?.toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1 text-center">
                    <div className="text-neutral-500 dark:text-neutral-400">Mem</div>
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {node.metadata.last_metrics.memory_percent?.toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1 text-center">
                    <div className="text-neutral-500 dark:text-neutral-400">Containers</div>
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {node.metadata.last_metrics.containers_running || 0}
                    </div>
                  </div>
                </div>
              )}

              {/* Capabilities */}
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                {node.capabilities?.available_cpu_cores} cores | {formatBytes(node.capabilities?.available_memory_mb || 0)} RAM | {node.capabilities?.available_disk_gb?.toFixed(0)} GB disk
              </div>

              {/* Actions */}
              {node.role !== 'leader' && (
                <div className="flex justify-end">
                  <button
                    onClick={() => handleRemoveNode(node.hostname)}
                    className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                    title="Remove from cluster"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Node Modal */}
      {showTokenModal && newToken && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg max-w-2xl w-full p-6 shadow-xl">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
              Add New Node
            </h2>

            <p className="text-neutral-600 dark:text-neutral-400 mb-6">
              Run this command on the new machine to join the cluster:
            </p>

            {/* Windows Command */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Windows (PowerShell)</span>
                <button
                  onClick={() => copyToClipboard(getJoinCommand(), 'windows')}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center space-x-1"
                >
                  {copied === 'windows' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copied === 'windows' ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <div className="bg-neutral-900 rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto">
                {getJoinCommand()}
              </div>
            </div>

            {/* Linux/macOS Command */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Linux / macOS</span>
                <button
                  onClick={() => copyToClipboard(newToken.join_command, 'linux')}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center space-x-1"
                >
                  {copied === 'linux' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copied === 'linux' ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <div className="bg-neutral-900 rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto">
                {newToken.join_command}
              </div>
            </div>

            <div className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              Token expires: {new Date(newToken.expires_at).toLocaleString()}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => { setShowTokenModal(false); setNewToken(null); }}
                className="btn-secondary"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
