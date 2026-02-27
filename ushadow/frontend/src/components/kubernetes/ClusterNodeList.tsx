import { useState } from 'react'
import { ChevronDown, ChevronRight, Server, RefreshCw } from 'lucide-react'
import { kubernetesApi, KubernetesNode } from '../../services/api'

interface ClusterNodeListProps {
  clusterId: string
  clusterStatus: string
  nodeCount?: number
}

function formatMemory(memStr?: string): string {
  if (!memStr) return '?'
  const ki = parseInt(memStr.replace('Ki', ''))
  if (!isNaN(ki)) return `${(ki / 1024 / 1024).toFixed(1)} Gi`
  if (memStr.endsWith('Gi')) return memStr
  return memStr
}

function GpuBadge({ node }: { node: KubernetesNode }) {
  const nvidia = node.gpu_capacity_nvidia
  const amd = node.gpu_capacity_amd
  if (!nvidia && !amd) return null

  const parts: string[] = []
  if (nvidia) parts.push(`${nvidia}x NVIDIA`)
  if (amd) parts.push(`${amd}x AMD`)

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300"
      data-testid={`k8s-node-gpu-${node.name}`}
    >
      {parts.join(', ')} GPU
    </span>
  )
}

function K8sNodeCard({ node }: { node: KubernetesNode }) {
  return (
    <div
      className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700"
      data-testid={`k8s-node-card-${node.name}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-neutral-400" />
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {node.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <GpuBadge node={node} />
          <span
            className={`px-2 py-0.5 text-xs rounded-full font-medium ${
              node.ready
                ? 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300'
                : 'bg-danger-100 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300'
            }`}
            data-testid={`k8s-node-status-${node.name}`}
          >
            {node.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
        {node.roles.length > 0 && (
          <div>
            <span className="text-neutral-400 dark:text-neutral-500">Roles: </span>
            {node.roles.join(', ')}
          </div>
        )}
        <div>
          <span className="text-neutral-400 dark:text-neutral-500">CPU: </span>
          {node.cpu_capacity || '?'}
        </div>
        <div>
          <span className="text-neutral-400 dark:text-neutral-500">Mem: </span>
          {formatMemory(node.memory_capacity)}
        </div>
        {node.kubelet_version && (
          <div>
            <span className="text-neutral-400 dark:text-neutral-500">Kubelet: </span>
            {node.kubelet_version}
          </div>
        )}
        {node.os_image && (
          <div className="col-span-2 truncate">
            <span className="text-neutral-400 dark:text-neutral-500">OS: </span>
            {node.os_image}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ClusterNodeList({ clusterId, clusterStatus, nodeCount }: ClusterNodeListProps) {
  const [expanded, setExpanded] = useState(false)
  const [nodes, setNodes] = useState<KubernetesNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const handleToggle = async () => {
    if (!expanded && !loaded) {
      setLoading(true)
      setError(null)
      try {
        const response = await kubernetesApi.listNodes(clusterId)
        setNodes(response.data)
        setLoaded(true)
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load nodes')
      } finally {
        setLoading(false)
      }
    }
    setExpanded(!expanded)
  }

  if (clusterStatus !== 'connected') return null

  return (
    <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors w-full"
        data-testid={`cluster-nodes-toggle-${clusterId}`}
      >
        {loading ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Nodes{nodeCount != null && ` (${nodeCount})`}
      </button>

      {expanded && (
        <div
          className="mt-3 space-y-2"
          data-testid={`cluster-nodes-list-${clusterId}`}
        >
          {error && (
            <p className="text-xs text-danger-600 dark:text-danger-400">{error}</p>
          )}
          {!error && nodes.map((node) => (
            <K8sNodeCard key={node.name} node={node} />
          ))}
          {!error && loaded && nodes.length === 0 && (
            <p className="text-xs text-neutral-500">No nodes found</p>
          )}
        </div>
      )}
    </div>
  )
}
