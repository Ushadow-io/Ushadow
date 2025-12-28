import { useState, useEffect } from 'react'
import { Server, Plus, RefreshCw, Copy, Trash2, CheckCircle, XCircle, Clock, Monitor, HardDrive, Cpu, Check, Play, Square, RotateCcw, Package, FileText, ArrowUpCircle, X, Unlink } from 'lucide-react'
import { clusterApi, deploymentsApi, ServiceDefinition, Deployment } from '../services/api'

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

// Discovered peer from Tailscale network
interface DiscoveredPeer {
  hostname: string
  tailscale_ip: string
  os?: string
  online?: boolean
  registered_to?: 'this_leader' | 'other_leader' | null
  manager_info?: {
    version?: string
    platform?: string
  }
}

// Response structure from discover peers API
interface DiscoveredPeersResponse {
  peers: {
    registered: DiscoveredPeer[]
    available: DiscoveredPeer[]
    unknown: DiscoveredPeer[]
  }
  counts: {
    registered: number
    available: number
    unknown: number
    total: number
  }
}

export default function ClusterPage() {
  const [activeTab, setActiveTab] = useState<'registered' | 'discovered'>('registered')
  const [unodes, setUnodes] = useState<UNode[]>([])
  const [discoveredPeers, setDiscoveredPeers] = useState<DiscoveredPeersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [discoveringPeers, setDiscoveringPeers] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [newToken, setNewToken] = useState<JoinToken | null>(null)
  const [creatingToken, setCreatingToken] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Deployment state
  const [services, setServices] = useState<ServiceDefinition[]>([])
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [showDeployModal, setShowDeployModal] = useState(false)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [logsDeploymentId, setLogsDeploymentId] = useState<string | null>(null)
  const [logs, setLogs] = useState<string>('')
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Upgrade state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeTarget, setUpgradeTarget] = useState<string | 'all' | null>(null)
  const [upgradeVersion, setUpgradeVersion] = useState('latest')
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeResult, setUpgradeResult] = useState<{ success: boolean; message: string } | null>(null)
  const [availableVersions, setAvailableVersions] = useState<string[]>(['latest'])
  const [loadingVersions, setLoadingVersions] = useState(false)

  useEffect(() => {
    loadUnodes()
    loadServices()
    loadDeployments()
    const interval = setInterval(() => {
      loadUnodes()
      loadDeployments()
    }, 15000) // Refresh every 15s
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (activeTab === 'discovered') {
      loadDiscoveredPeers()
    }
  }, [activeTab])

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

  const loadServices = async () => {
    try {
      const response = await deploymentsApi.listServices()
      setServices(response.data)
    } catch (err: any) {
      console.error('Error loading services:', err)
    }
  }

  const loadDeployments = async () => {
    try {
      const response = await deploymentsApi.listDeployments()
      setDeployments(response.data)
    } catch (err: any) {
      console.error('Error loading deployments:', err)
    }
  }

  const loadDiscoveredPeers = async () => {
    try {
      setDiscoveringPeers(true)
      setError(null)
      const response = await clusterApi.discoverPeers()
      setDiscoveredPeers(response.data)
    } catch (err: any) {
      console.error('Error discovering peers:', err)
      setError(err.response?.data?.detail || 'Failed to discover Tailscale peers')
    } finally {
      setDiscoveringPeers(false)
    }
  }

  const handleClaimNode = async (hostname: string, tailscaleIp: string) => {
    if (!confirm(`Claim ${hostname} and register it to this leader?`)) return
    try {
      await clusterApi.claimNode(hostname, tailscaleIp)
      // Refresh both lists
      await loadUnodes()
      await loadDiscoveredPeers()
    } catch (err: any) {
      alert(`Failed to claim node: ${err.response?.data?.detail || err.message}`)
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

  const handleReleaseNode = async (hostname: string) => {
    if (!confirm(`Release ${hostname}? The node will become available for other leaders to claim.`)) return
    try {
      await clusterApi.releaseNode(hostname)
      loadUnodes()
    } catch (err: any) {
      alert(`Failed to release node: ${err.response?.data?.detail || err.message}`)
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  // Deployment handlers
  const openDeployModal = (hostname: string) => {
    setSelectedNode(hostname)
    setShowDeployModal(true)
  }

  const handleDeploy = async (serviceId: string) => {
    if (!selectedNode) return
    try {
      setDeploying(true)
      await deploymentsApi.deploy(serviceId, selectedNode)
      setShowDeployModal(false)
      setSelectedNode(null)
      loadDeployments()
    } catch (err: any) {
      alert(`Deploy failed: ${err.response?.data?.detail || err.message}`)
    } finally {
      setDeploying(false)
    }
  }

  const handleStopDeployment = async (deploymentId: string) => {
    try {
      await deploymentsApi.stopDeployment(deploymentId)
      loadDeployments()
    } catch (err: any) {
      alert(`Stop failed: ${err.response?.data?.detail || err.message}`)
    }
  }

  const handleRestartDeployment = async (deploymentId: string) => {
    try {
      await deploymentsApi.restartDeployment(deploymentId)
      loadDeployments()
    } catch (err: any) {
      alert(`Restart failed: ${err.response?.data?.detail || err.message}`)
    }
  }

  const handleRemoveDeployment = async (deploymentId: string) => {
    if (!confirm('Remove this deployment?')) return
    try {
      await deploymentsApi.removeDeployment(deploymentId)
      loadDeployments()
    } catch (err: any) {
      alert(`Remove failed: ${err.response?.data?.detail || err.message}`)
    }
  }

  const handleViewLogs = async (deploymentId: string) => {
    setLogsDeploymentId(deploymentId)
    setShowLogsModal(true)
    setLoadingLogs(true)
    try {
      const response = await deploymentsApi.getDeploymentLogs(deploymentId)
      setLogs(response.data.logs)
    } catch (err: any) {
      setLogs(`Failed to load logs: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoadingLogs(false)
    }
  }

  // Upgrade handlers
  const openUpgradeModal = async (target: string | 'all') => {
    setUpgradeTarget(target)
    setUpgradeVersion('latest')
    setUpgradeResult(null)
    setShowUpgradeModal(true)

    // Fetch available versions
    setLoadingVersions(true)
    try {
      const response = await clusterApi.getManagerVersions()
      setAvailableVersions(response.data.versions)
    } catch (err) {
      console.error('Failed to fetch versions:', err)
      setAvailableVersions(['latest'])
    } finally {
      setLoadingVersions(false)
    }
  }

  const handleUpgrade = async () => {
    if (!upgradeTarget) return

    try {
      setUpgrading(true)
      setUpgradeResult(null)

      if (upgradeTarget === 'all') {
        const response = await clusterApi.upgradeAllNodes(upgradeVersion)
        const data = response.data
        const successCount = data.succeeded?.length || 0
        const failCount = data.failed?.length || 0
        setUpgradeResult({
          success: failCount === 0,
          message: `Upgraded ${successCount} node(s)${failCount > 0 ? `, ${failCount} failed` : ''}`
        })
      } else {
        const response = await clusterApi.upgradeNode(upgradeTarget, upgradeVersion)
        setUpgradeResult({
          success: response.data.success,
          message: response.data.message
        })
      }

      // Refresh nodes after a delay (upgrade takes time)
      setTimeout(() => loadUnodes(), 5000)
    } catch (err: any) {
      setUpgradeResult({
        success: false,
        message: err.response?.data?.detail || err.message || 'Upgrade failed'
      })
    } finally {
      setUpgrading(false)
    }
  }

  const getNodeDeployments = (hostname: string) => {
    return deployments.filter(d => d.unode_hostname === hostname)
  }

  const getServiceName = (serviceId: string) => {
    const service = services.find(s => s.service_id === serviceId)
    return service?.name || serviceId
  }

  const getDeploymentStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-success-600 bg-success-100 dark:text-success-400 dark:bg-success-900/30'
      case 'stopped': return 'text-neutral-600 bg-neutral-100 dark:text-neutral-400 dark:bg-neutral-800'
      case 'deploying': return 'text-warning-600 bg-warning-100 dark:text-warning-400 dark:bg-warning-900/30'
      case 'failed': return 'text-danger-600 bg-danger-100 dark:text-danger-400 dark:bg-danger-900/30'
      default: return 'text-neutral-600 bg-neutral-100'
    }
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
        <div className="flex items-center space-x-3">
          {unodes.filter(n => n.role === 'worker' && n.status === 'online').length > 0 && (
            <button
              className="btn-secondary flex items-center space-x-2"
              onClick={() => openUpgradeModal('all')}
              data-testid="upgrade-all-btn"
            >
              <ArrowUpCircle className="h-5 w-5" />
              <span>Upgrade All</span>
            </button>
          )}
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
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => setActiveTab('registered')}
          className={`px-4 py-3 font-medium transition-colors relative ${
            activeTab === 'registered'
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
          data-testid="registered-tab"
        >
          Registered Nodes
          {activeTab === 'registered' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('discovered')}
          className={`px-4 py-3 font-medium transition-colors relative ${
            activeTab === 'discovered'
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
          data-testid="discovered-tab"
        >
          Discovered Peers
          {activeTab === 'discovered' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 dark:bg-primary-400" />
          )}
        </button>
      </div>

      {/* Stats - Only show for registered tab */}
      {activeTab === 'registered' && (
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
      )}

      {/* Error State */}
      {error && (
        <div className="card p-4 border-l-4 border-danger-600 bg-danger-50 dark:bg-danger-900/20">
          <p className="text-danger-900 dark:text-danger-200">{error}</p>
        </div>
      )}

      {/* Registered Tab Content */}
      {activeTab === 'registered' && (
        <>
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

              {/* Version & Capabilities */}
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span>{node.capabilities?.available_cpu_cores} cores | {formatBytes(node.capabilities?.available_memory_mb || 0)} RAM | {node.capabilities?.available_disk_gb?.toFixed(0)} GB disk</span>
                </div>
                {node.manager_version && (
                  <div className="flex items-center mt-1">
                    <span className="text-neutral-400 dark:text-neutral-500">Manager: </span>
                    <span className="ml-1 font-mono text-neutral-600 dark:text-neutral-300" data-testid={`node-version-${node.hostname}`}>v{node.manager_version}</span>
                  </div>
                )}
              </div>

              {/* Deployed Services */}
              {getNodeDeployments(node.hostname).length > 0 && (
                <div className="mb-4 border-t border-neutral-200 dark:border-neutral-700 pt-3">
                  <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2 flex items-center">
                    <Package className="h-3 w-3 mr-1" />
                    Deployed Services
                  </div>
                  <div className="space-y-2">
                    {getNodeDeployments(node.hostname).map((deployment) => (
                      <div
                        key={deployment.id}
                        className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/50 rounded px-2 py-1.5"
                      >
                        <div className="flex items-center space-x-2">
                          <span className={`px-1.5 py-0.5 text-xs rounded ${getDeploymentStatusColor(deployment.status)}`}>
                            {deployment.status}
                          </span>
                          <span className="text-sm text-neutral-700 dark:text-neutral-300">
                            {getServiceName(deployment.service_id)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {deployment.status === 'running' ? (
                            <button
                              onClick={() => handleStopDeployment(deployment.id)}
                              className="p-1 text-neutral-500 hover:text-warning-600 rounded"
                              title="Stop"
                            >
                              <Square className="h-3 w-3" />
                            </button>
                          ) : deployment.status === 'stopped' ? (
                            <button
                              onClick={() => handleRestartDeployment(deployment.id)}
                              className="p-1 text-neutral-500 hover:text-success-600 rounded"
                              title="Start"
                            >
                              <Play className="h-3 w-3" />
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleRestartDeployment(deployment.id)}
                            className="p-1 text-neutral-500 hover:text-primary-600 rounded"
                            title="Restart"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleViewLogs(deployment.id)}
                            className="p-1 text-neutral-500 hover:text-primary-600 rounded"
                            title="View Logs"
                          >
                            <FileText className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleRemoveDeployment(deployment.id)}
                            className="p-1 text-neutral-500 hover:text-danger-600 rounded"
                            title="Remove"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between items-center">
                {node.role !== 'leader' && node.status === 'online' && (
                  <button
                    onClick={() => openDeployModal(node.hostname)}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Deploy Service
                  </button>
                )}
                {node.role === 'leader' && <div />}
                <div className="flex items-center space-x-1">
                  {node.role !== 'leader' && node.status === 'online' && (
                    <button
                      onClick={() => openUpgradeModal(node.hostname)}
                      className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                      title="Upgrade manager"
                      data-testid={`upgrade-node-${node.hostname}`}
                    >
                      <ArrowUpCircle className="h-4 w-4" />
                    </button>
                  )}
                  {node.role !== 'leader' && (
                    <button
                      onClick={() => handleReleaseNode(node.hostname)}
                      className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-warning-600 dark:hover:text-warning-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                      title="Release for another leader"
                      data-testid={`release-node-${node.hostname}`}
                    >
                      <Unlink className="h-4 w-4" />
                    </button>
                  )}
                  {node.role !== 'leader' && (
                    <button
                      onClick={() => handleRemoveNode(node.hostname)}
                      className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                      title="Remove from cluster"
                      data-testid={`remove-node-${node.hostname}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* Discovered Tab Content */}
      {activeTab === 'discovered' && (
        <div className="space-y-4">
          {discoveringPeers && (
            <div className="text-center py-12">
              <RefreshCw className="h-12 w-12 text-neutral-400 mx-auto mb-4 animate-spin" />
              <p className="text-neutral-600 dark:text-neutral-400">Discovering Tailscale peers...</p>
            </div>
          )}

          {!discoveringPeers && discoveredPeers && (
            <>
              {/* Available Nodes */}
              {discoveredPeers.peers.available.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                    Available Nodes ({discoveredPeers.counts.available})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {discoveredPeers.peers.available.map((peer: DiscoveredPeer, idx: number) => (
                      <div key={`${peer.tailscale_ip}-${idx}`} className="card-hover p-6 border-2 border-warning-200 dark:border-warning-800">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 rounded-lg bg-warning-100 dark:bg-warning-900/30">
                              <Server className="h-6 w-6 text-warning-600 dark:text-warning-400" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                                {peer.hostname || 'Unknown'}
                              </h3>
                              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                                {peer.os || 'unknown'}
                              </p>
                            </div>
                          </div>
                          {peer.online && (
                            <CheckCircle className="h-5 w-5 text-success-600" />
                          )}
                        </div>

                        <div className="mb-4 text-sm">
                          <span className="text-neutral-500 dark:text-neutral-400">IP: </span>
                          <span className="font-mono text-neutral-700 dark:text-neutral-300">{peer.tailscale_ip}</span>
                        </div>

                        {peer.registered_to === 'other_leader' && (
                          <div className="mb-4 text-xs text-warning-600 dark:text-warning-400">
                            ⚠️ Registered to another leader
                          </div>
                        )}

                        <button
                          onClick={() => handleClaimNode(peer.hostname, peer.tailscale_ip)}
                          className="w-full btn-secondary text-sm"
                        >
                          Claim Node
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unknown Peers */}
              {discoveredPeers.peers.unknown.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                    Other Tailscale Peers ({discoveredPeers.counts.unknown})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {discoveredPeers.peers.unknown.map((peer: DiscoveredPeer, idx: number) => (
                      <div key={`${peer.tailscale_ip}-${idx}`} className="card-hover p-6 opacity-60">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 rounded-lg bg-neutral-200 dark:bg-neutral-700">
                              <Monitor className="h-6 w-6 text-neutral-600 dark:text-neutral-400" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                                {peer.hostname || 'Unknown'}
                              </h3>
                              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                                {peer.os || 'unknown'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="text-sm">
                          <span className="text-neutral-500 dark:text-neutral-400">IP: </span>
                          <span className="font-mono text-neutral-700 dark:text-neutral-300">{peer.tailscale_ip}</span>
                        </div>

                        <div className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
                          No u-node manager detected
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {discoveredPeers.peers.available.length === 0 && discoveredPeers.peers.unknown.length === 0 && (
                <div className="text-center py-12">
                  <Server className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                  <p className="text-neutral-600 dark:text-neutral-400">No unregistered peers found on Tailscale network</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Add Node Modal */}
      {showTokenModal && newToken && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg max-w-2xl w-full p-6 shadow-xl relative">
            {/* Close button */}
            <button
              onClick={() => { setShowTokenModal(false); setNewToken(null); }}
              className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              title="Close"
              data-testid="close-add-node-modal"
            >
              <XCircle className="h-5 w-5" />
            </button>
            
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
              <div className="bg-neutral-900 rounded-lg p-4 font-mono text-sm text-green-400 break-all whitespace-pre-wrap">
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
              <div className="bg-neutral-900 rounded-lg p-4 font-mono text-sm text-green-400 break-all whitespace-pre-wrap">
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

      {/* Deploy Service Modal */}
      {showDeployModal && selectedNode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg max-w-md w-full p-6 shadow-xl relative">
            <button
              onClick={() => { setShowDeployModal(false); setSelectedNode(null); }}
              className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
            >
              <XCircle className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
              Deploy to {selectedNode}
            </h2>

            {services.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  No service definitions found
                </p>
                <p className="text-sm text-neutral-500">
                  Create a service definition first to deploy containers
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  Select a service to deploy:
                </p>
                {services.map((service) => {
                  const existingDeployment = deployments.find(
                    d => d.service_id === service.service_id && d.unode_hostname === selectedNode
                  )
                  const isDeployed = existingDeployment && ['running', 'deploying'].includes(existingDeployment.status)

                  return (
                    <button
                      key={service.service_id}
                      onClick={() => !isDeployed && handleDeploy(service.service_id)}
                      disabled={deploying || isDeployed}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        isDeployed
                          ? 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 opacity-50 cursor-not-allowed'
                          : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-neutral-900 dark:text-neutral-100">
                            {service.name}
                          </div>
                          <div className="text-sm text-neutral-500 dark:text-neutral-400">
                            {service.image}
                          </div>
                        </div>
                        {isDeployed && (
                          <span className="text-xs px-2 py-1 rounded bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                            Deployed
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={() => { setShowDeployModal(false); setSelectedNode(null); }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogsModal && logsDeploymentId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg max-w-4xl w-full max-h-[80vh] flex flex-col shadow-xl relative">
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                Container Logs
              </h2>
              <button
                onClick={() => { setShowLogsModal(false); setLogsDeploymentId(null); setLogs(''); }}
                className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {loadingLogs ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 text-neutral-400 animate-spin" />
                </div>
              ) : (
                <pre className="bg-neutral-900 text-green-400 p-4 rounded-lg text-sm font-mono whitespace-pre-wrap overflow-x-auto">
                  {logs || 'No logs available'}
                </pre>
              )}
            </div>

            <div className="flex justify-end p-4 border-t border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => handleViewLogs(logsDeploymentId)}
                className="btn-secondary mr-2"
                disabled={loadingLogs}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingLogs ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => { setShowLogsModal(false); setLogsDeploymentId(null); setLogs(''); }}
                className="btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && upgradeTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg max-w-md w-full p-6 shadow-xl relative" data-testid="upgrade-modal">
            <button
              onClick={() => { setShowUpgradeModal(false); setUpgradeTarget(null); setUpgradeResult(null); }}
              className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              data-testid="close-upgrade-modal"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                <ArrowUpCircle className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                Upgrade {upgradeTarget === 'all' ? 'All Nodes' : upgradeTarget}
              </h2>
            </div>

            <p className="text-neutral-600 dark:text-neutral-400 mb-6">
              {upgradeTarget === 'all'
                ? 'This will upgrade all online worker nodes to the specified version.'
                : `Upgrade the manager on ${upgradeTarget} to a new version.`}
            </p>

            {/* Version Select */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Version
              </label>
              {loadingVersions ? (
                <div className="flex items-center space-x-2 py-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-neutral-400" />
                  <span className="text-sm text-neutral-500">Loading versions...</span>
                </div>
              ) : (
                <select
                  value={upgradeVersion}
                  onChange={(e) => setUpgradeVersion(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  disabled={upgrading}
                  data-testid="upgrade-version-select"
                >
                  {availableVersions.map((version) => (
                    <option key={version} value={version}>
                      {version === 'latest' ? 'latest (recommended)' : version}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                Select a version from the container registry
              </p>
            </div>

            {/* Result Message */}
            {upgradeResult && (
              <div className={`mb-6 p-4 rounded-lg ${
                upgradeResult.success
                  ? 'bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-300'
                  : 'bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-300'
              }`} data-testid="upgrade-result">
                <div className="flex items-center space-x-2">
                  {upgradeResult.success ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                  <span>{upgradeResult.message}</span>
                </div>
              </div>
            )}

            {/* Warning */}
            <div className="mb-6 p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg text-sm text-warning-700 dark:text-warning-300">
              <strong>Note:</strong> Nodes will be briefly offline (~10 seconds) during upgrade.
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowUpgradeModal(false); setUpgradeTarget(null); setUpgradeResult(null); }}
                className="btn-secondary"
              >
                {upgradeResult ? 'Close' : 'Cancel'}
              </button>
              {!upgradeResult && (
                <button
                  onClick={handleUpgrade}
                  disabled={upgrading || !upgradeVersion.trim()}
                  className="btn-primary flex items-center space-x-2"
                  data-testid="confirm-upgrade-btn"
                >
                  {upgrading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Upgrading...</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpCircle className="h-4 w-4" />
                      <span>Upgrade</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
