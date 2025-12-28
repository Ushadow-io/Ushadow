import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Server, Plus, RefreshCw, Trash2, CheckCircle, XCircle, Clock, Upload, X } from 'lucide-react'
import { kubernetesApi, KubernetesCluster } from '../services/api'

export default function KubernetesClustersPage() {
  const [clusters, setClusters] = useState<KubernetesCluster[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [adding, setAdding] = useState(false)

  // Form state
  const [clusterName, setClusterName] = useState('')
  const [kubeconfig, setKubeconfig] = useState('')
  const [namespace, setNamespace] = useState('default')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadClusters()
  }, [])

  const loadClusters = async () => {
    try {
      setError(null)
      const response = await kubernetesApi.listClusters()
      setClusters(response.data)
    } catch (err: any) {
      console.error('Error loading clusters:', err)
      setError(err.response?.data?.detail || 'Failed to load clusters')
    } finally {
      setLoading(false)
    }
  }

  const handleAddCluster = async () => {
    if (!clusterName.trim() || !kubeconfig.trim()) return

    try {
      setAdding(true)
      setError(null)

      // Base64 encode the kubeconfig
      const encoded = btoa(kubeconfig)

      await kubernetesApi.addCluster({
        name: clusterName,
        kubeconfig: encoded,
        namespace: namespace || 'default'
      })

      // Reset form and close modal
      setShowAddModal(false)
      setClusterName('')
      setKubeconfig('')
      setNamespace('default')

      // Reload clusters
      loadClusters()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to add cluster')
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveCluster = async (clusterId: string) => {
    if (!confirm('Remove this cluster from Ushadow?')) return

    try {
      await kubernetesApi.removeCluster(clusterId)
      loadClusters()
    } catch (err: any) {
      alert(`Failed to remove cluster: ${err.response?.data?.detail || err.message}`)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setKubeconfig(event.target?.result as string)
      }
      reader.readAsText(file)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-success-600 dark:text-success-400'
      case 'unreachable': return 'text-neutral-500 dark:text-neutral-400'
      case 'unauthorized': return 'text-warning-600 dark:text-warning-400'
      case 'error': return 'text-danger-600 dark:text-danger-400'
      default: return 'text-neutral-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <CheckCircle className={`h-5 w-5 ${getStatusColor(status)}`} />
      case 'unreachable': return <XCircle className={`h-5 w-5 ${getStatusColor(status)}`} />
      case 'unauthorized': return <XCircle className={`h-5 w-5 ${getStatusColor(status)}`} />
      case 'error': return <Clock className={`h-5 w-5 ${getStatusColor(status)} animate-pulse`} />
      default: return <XCircle className={`h-5 w-5 ${getStatusColor(status)}`} />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Kubernetes Clusters</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Manage Kubernetes clusters for service deployment
          </p>
        </div>
        <button
          className="btn-primary flex items-center space-x-2"
          onClick={() => setShowAddModal(true)}
          data-testid="add-cluster-btn"
        >
          <Plus className="h-5 w-5" />
          <span>Add Cluster</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Clusters</p>
          <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{clusters.length}</p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Connected</p>
          <p className="mt-2 text-2xl font-bold text-success-600 dark:text-success-400">
            {clusters.filter(c => c.status === 'connected').length}
          </p>
        </div>
        <div className="card-hover p-4">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Nodes</p>
          <p className="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400">
            {clusters.reduce((sum, c) => sum + (c.node_count || 0), 0)}
          </p>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <RefreshCw className="h-12 w-12 text-neutral-400 mx-auto mb-4 animate-spin" />
          <p className="text-neutral-600 dark:text-neutral-400">Loading clusters...</p>
        </div>
      )}

      {/* Clusters Grid */}
      {!loading && clusters.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clusters.map((cluster) => (
            <div key={cluster.cluster_id} className="card-hover p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                    <Server className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {cluster.name}
                    </h3>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {cluster.context}
                    </p>
                  </div>
                </div>
                {getStatusIcon(cluster.status)}
              </div>

              {/* Server */}
              <div className="mb-4 text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Server: </span>
                <span className="font-mono text-neutral-700 dark:text-neutral-300 text-xs break-all">
                  {cluster.server}
                </span>
              </div>

              {/* Info */}
              {cluster.version && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                  K8s {cluster.version} | {cluster.node_count} nodes | namespace: {cluster.namespace}
                </div>
              )}

              {/* Labels */}
              {Object.keys(cluster.labels).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {Object.entries(cluster.labels).map(([key, value]) => (
                    <span
                      key={key}
                      className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                    >
                      {key}: {value}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end">
                <button
                  onClick={() => handleRemoveCluster(cluster.cluster_id)}
                  className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                  title="Remove cluster"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && clusters.length === 0 && (
        <div className="text-center py-12">
          <Server className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">No Kubernetes clusters configured</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary inline-flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>Add Your First Cluster</span>
          </button>
        </div>
      )}

      {/* Add Cluster Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl">
            {/* Header - Fixed */}
            <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-700">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Add Kubernetes Cluster
                </h2>
                <p className="text-neutral-600 dark:text-neutral-400 text-sm mt-1">
                  Upload your kubeconfig file or paste its contents
                </p>
              </div>
              <button
                onClick={() => { setShowAddModal(false); setError(null); }}
                className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
                data-testid="close-add-cluster-modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Error */}
              {error && (
                <div className="mb-4 p-4 rounded-lg bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-300">
                  {error}
                </div>
              )}

              {/* Cluster Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Cluster Name
                </label>
                <input
                  type="text"
                  value={clusterName}
                  onChange={(e) => setClusterName(e.target.value)}
                  placeholder="e.g., Production, Dev Cluster"
                  className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                  data-testid="cluster-name-input"
                />
              </div>

              {/* Namespace */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Default Namespace
                </label>
                <input
                  type="text"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="default"
                  className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                  data-testid="namespace-input"
                />
              </div>

              {/* Kubeconfig Upload */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Kubeconfig
                </label>

                {/* File Upload Button */}
                <div className="mb-3">
                  <label className="btn-secondary inline-flex items-center space-x-2 cursor-pointer">
                    <Upload className="h-4 w-4" />
                    <span>Upload kubeconfig file</span>
                    <input
                      type="file"
                      accept=".yaml,.yml,.config"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Or Paste */}
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-2">Or paste your kubeconfig:</p>
                <textarea
                  value={kubeconfig}
                  onChange={(e) => setKubeconfig(e.target.value)}
                  placeholder="apiVersion: v1&#10;kind: Config&#10;clusters:&#10;  - cluster:&#10;      server: https://..."
                  rows={12}
                  className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-mono text-sm resize-none"
                  data-testid="kubeconfig-input"
                />
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Usually found at <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded">~/.kube/config</code>
                </p>
              </div>
            </div>

            {/* Footer - Fixed */}
            <div className="flex justify-end space-x-3 p-6 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
              <button
                onClick={() => { setShowAddModal(false); setError(null); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCluster}
                disabled={adding || !clusterName.trim() || !kubeconfig.trim()}
                className="btn-primary flex items-center space-x-2"
                data-testid="confirm-add-cluster-btn"
              >
                {adding ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Add Cluster</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
