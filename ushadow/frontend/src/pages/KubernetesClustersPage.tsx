import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Server, Plus, RefreshCw, Trash2, CheckCircle, XCircle, Clock, Upload, X, Search, Database, AlertCircle, Rocket } from 'lucide-react'
import { kubernetesApi, KubernetesCluster, DeployTarget, deploymentsApi } from '../services/api'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import DeployModal from '../components/DeployModal'

interface InfraService {
  found: boolean
  endpoints: string[]
  type: string
  default_port: number
  error?: string
}

interface InfraScanResults {
  cluster_id: string
  namespace: string
  infra_services: Record<string, InfraService>
}

export default function KubernetesClustersPage() {
  const [clusters, setClusters] = useState<KubernetesCluster[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [adding, setAdding] = useState(false)

  // Infrastructure scanning
  const [scanningClusterId, setScanningClusterId] = useState<string | null>(null)
  const [scanResults, setScanResults] = useState<Record<string, InfraScanResults>>({})
  const [showScanResults, setShowScanResults] = useState<string | null>(null)
  const [showNamespaceSelector, setShowNamespaceSelector] = useState<string | null>(null)
  const [scanNamespace, setScanNamespace] = useState<string>('')

  // Deployment
  const [showDeployModal, setShowDeployModal] = useState(false)
  const [selectedClusterForDeploy, setSelectedClusterForDeploy] = useState<KubernetesCluster | null>(null)

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

      // Load cached scan results from clusters
      const cachedScans: Record<string, InfraScanResults> = {}
      response.data.forEach((cluster: KubernetesCluster) => {
        if (cluster.infra_scans) {
          Object.entries(cluster.infra_scans).forEach(([namespace, scanData]) => {
            cachedScans[`${cluster.cluster_id}-${namespace}`] = {
              cluster_id: cluster.cluster_id,
              namespace: namespace,
              infra_services: scanData as Record<string, InfraService>
            }
          })
        }
      })
      setScanResults(cachedScans)
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
      // Remove scan results for this cluster
      const newScanResults = { ...scanResults }
      delete newScanResults[clusterId]
      setScanResults(newScanResults)
      loadClusters()
    } catch (err: any) {
      alert(`Failed to remove cluster: ${err.response?.data?.detail || err.message}`)
    }
  }

  const handleScanInfrastructure = async (clusterId: string, namespace?: string) => {
    try {
      setScanningClusterId(clusterId)
      setError(null)

      const cluster = clusters.find(c => c.cluster_id === clusterId)
      const namespaceToScan = namespace || cluster?.namespace || 'default'

      const response = await kubernetesApi.scanInfraServices(clusterId, namespaceToScan)

      // Store scan results
      setScanResults(prev => ({
        ...prev,
        [`${clusterId}-${namespaceToScan}`]: response.data
      }))

      // Show results modal
      setShowScanResults(`${clusterId}-${namespaceToScan}`)
      setShowNamespaceSelector(null)
      setScanNamespace('')
    } catch (err: any) {
      console.error('Error scanning infrastructure:', err)
      alert(`Failed to scan infrastructure: ${err.response?.data?.detail || err.message}`)
    } finally {
      setScanningClusterId(null)
    }
  }

  const handleOpenNamespaceSelector = (clusterId: string) => {
    const cluster = clusters.find(c => c.cluster_id === clusterId)
    setScanNamespace(cluster?.namespace || 'ushadow')
    setShowNamespaceSelector(clusterId)
  }

  const handleOpenDeployModal = (cluster: KubernetesCluster) => {
    setSelectedClusterForDeploy(cluster)
    setShowDeployModal(true)
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

  const renderInfraScanResults = (clusterId: string) => {
    const results = scanResults[clusterId]
    if (!results) return null

    const foundServices = Object.entries(results.infra_services).filter(([_, service]) => service.found)
    const notFoundServices = Object.entries(results.infra_services).filter(([_, service]) => !service.found)

    return (
      <Modal
        isOpen={showScanResults === clusterId}
        onClose={() => setShowScanResults(null)}
        title="Infrastructure Scan Results"
        maxWidth="lg"
        testId="infra-scan-results-modal"
      >
        <div className="space-y-4">
          <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4">
            <p className="text-sm text-primary-700 dark:text-primary-300">
              Scanned namespace: <span className="font-semibold">{results.namespace}</span>
            </p>
          </div>

          {/* Found Services */}
          {foundServices.length > 0 && (
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-3 flex items-center">
                <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400 mr-2" />
                Found Infrastructure ({foundServices.length})
              </h3>
              <div className="space-y-2">
                {foundServices.map(([name, service]) => (
                  <div
                    key={name}
                    className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-success-900 dark:text-success-100 capitalize">
                        {name}
                      </span>
                      <span className="text-xs bg-success-100 dark:bg-success-900/40 text-success-700 dark:text-success-300 px-2 py-1 rounded">
                        Running
                      </span>
                    </div>
                    {service.endpoints.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-success-700 dark:text-success-300 mb-1">Connection endpoints:</p>
                        {service.endpoints.map((endpoint, idx) => (
                          <code
                            key={idx}
                            className="block text-xs bg-success-100 dark:bg-success-900/40 text-success-800 dark:text-success-200 px-2 py-1 rounded font-mono mb-1"
                          >
                            {endpoint}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Not Found Services */}
          {notFoundServices.length > 0 && (
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-3 flex items-center">
                <AlertCircle className="h-5 w-5 text-neutral-400 mr-2" />
                Not Found ({notFoundServices.length})
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {notFoundServices.map(([name, service]) => (
                  <div
                    key={name}
                    className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3"
                  >
                    <span className="text-sm text-neutral-600 dark:text-neutral-400 capitalize">{name}</span>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                      Not running in {results.namespace}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              <strong>Next steps:</strong> You can use existing infrastructure services when deploying applications,
              or deploy your own infrastructure using the unified deployment UI.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <button
              onClick={() => setShowScanResults(null)}
              className="btn-primary"
              data-testid="close-scan-results"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <div className="space-y-6" data-testid="kubernetes-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Kubernetes Clusters</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Configure clusters and scan infrastructure for deployments
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
          {clusters.map((cluster) => {
            // Get all scanned namespaces for this cluster
            const scannedKeys = Object.keys(scanResults).filter(key => key.startsWith(cluster.cluster_id))
            const hasScanned = scannedKeys.length > 0

            return (
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

                {/* Infrastructure Status */}
                {hasScanned && (
                  <div className="mb-4 space-y-2">
                    {scannedKeys.map(key => {
                      const results = scanResults[key]
                      const namespace = results.namespace
                      const foundInfra = Object.values(results.infra_services).filter(s => s.found).length

                      return (
                        <div key={key} className="p-3 bg-success-50 dark:bg-success-900/20 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Database className="h-4 w-4 text-success-600 dark:text-success-400" />
                              <span className="text-sm text-success-700 dark:text-success-300">
                                {foundInfra} in <code className="px-1 py-0.5 bg-success-100 dark:bg-success-900/40 rounded text-xs">{namespace}</code>
                              </span>
                            </div>
                            <button
                              onClick={() => setShowScanResults(key)}
                              className="text-xs text-success-600 dark:text-success-400 hover:underline"
                              data-testid={`view-scan-results-${key}`}
                            >
                              View
                            </button>
                          </div>
                        </div>
                      )
                    })}
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
                <div className="flex justify-between items-center pt-4 border-t border-neutral-200 dark:border-neutral-700 gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenNamespaceSelector(cluster.cluster_id)}
                      disabled={scanningClusterId === cluster.cluster_id || cluster.status !== 'connected'}
                      className="btn-secondary flex items-center space-x-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid={`scan-infra-${cluster.cluster_id}`}
                    >
                      {scanningClusterId === cluster.cluster_id ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Scanning...</span>
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          <span>Scan</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleOpenDeployModal(cluster)}
                      disabled={cluster.status !== 'connected'}
                      className="btn-primary flex items-center space-x-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid={`deploy-services-${cluster.cluster_id}`}
                    >
                      <Rocket className="h-4 w-4" />
                      <span>Deploy</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleRemoveCluster(cluster.cluster_id)}
                    className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                    title="Remove cluster"
                    data-testid={`remove-cluster-${cluster.cluster_id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
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

      {/* Namespace Selector Modal */}
      {showNamespaceSelector && (
        <Modal
          isOpen={true}
          onClose={() => setShowNamespaceSelector(null)}
          title="Select Namespace to Scan"
          maxWidth="md"
          testId="namespace-selector-modal"
        >
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Choose which namespace to scan for infrastructure services.
            </p>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Namespace
              </label>
              <input
                type="text"
                value={scanNamespace}
                onChange={(e) => setScanNamespace(e.target.value)}
                placeholder="e.g., ushadow, default, kube-system"
                className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                data-testid="scan-namespace-input"
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Common namespaces: <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded">ushadow</code>, <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded">default</code>, <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded">kube-system</code>
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => setShowNamespaceSelector(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleScanInfrastructure(showNamespaceSelector, scanNamespace)}
                disabled={!scanNamespace.trim()}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="confirm-scan-btn"
              >
                <Search className="h-4 w-4 mr-2" />
                Scan {scanNamespace || 'Namespace'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Scan Results Modal */}
      {showScanResults && renderInfraScanResults(showScanResults)}

      {/* Deploy to K8s Modal */}
      {showDeployModal && selectedClusterForDeploy && (
        <DeployModal
          isOpen={showDeployModal}
          onClose={() => {
            setShowDeployModal(false)
            setSelectedClusterForDeploy(null)
          }}
          target={{
            id: selectedClusterForDeploy.deployment_target_id,
            type: 'k8s',
            name: selectedClusterForDeploy.name,
            identifier: selectedClusterForDeploy.cluster_id,
            environment: selectedClusterForDeploy.environment || 'unknown',
            status: selectedClusterForDeploy.status || 'unknown',
            namespace: selectedClusterForDeploy.namespace,
            infrastructure: Object.keys(scanResults).find(key => key.startsWith(selectedClusterForDeploy.cluster_id))
              ? scanResults[Object.keys(scanResults).find(key => key.startsWith(selectedClusterForDeploy.cluster_id))!].infra_services
              : undefined,
            provider: selectedClusterForDeploy.labels?.provider,
            region: selectedClusterForDeploy.labels?.region,
            is_leader: undefined,
            raw_metadata: selectedClusterForDeploy
          }}
          infraServices={
            Object.keys(scanResults).find(key => key.startsWith(selectedClusterForDeploy.cluster_id))
              ? scanResults[Object.keys(scanResults).find(key => key.startsWith(selectedClusterForDeploy.cluster_id))!].infra_services
              : undefined
          }
        />
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
                  placeholder="ushadow"
                  className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                  data-testid="namespace-input"
                />
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Recommended: <code className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded">ushadow</code>
                </p>
              </div>

              {/* Kubeconfig Upload */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
                  Kubeconfig
                </label>

                {/* File Upload or Paste Buttons */}
                <div className="flex gap-3 mb-4">
                  <label className="flex-1 btn-secondary inline-flex items-center justify-center space-x-2 cursor-pointer">
                    <Upload className="h-4 w-4" />
                    <span>Upload File</span>
                    <input
                      type="file"
                      accept=".yaml,.yml,.config"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText()
                        if (text && (text.includes('apiVersion') || text.includes('kind: Config'))) {
                          setKubeconfig(text)
                        } else {
                          alert('Clipboard does not contain valid kubeconfig content')
                        }
                      } catch (err) {
                        // Fallback - just focus the textarea
                        document.querySelector('[data-testid="kubeconfig-input"]')?.focus()
                      }
                    }}
                    className="flex-1 btn-primary inline-flex items-center justify-center space-x-2"
                    data-testid="paste-kubeconfig-btn"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>Paste from Clipboard</span>
                  </button>
                </div>

                {/* Textarea for manual paste/edit */}
                <div className="relative">
                  <textarea
                    value={kubeconfig}
                    onChange={(e) => setKubeconfig(e.target.value)}
                    placeholder="Paste your kubeconfig here, or use the buttons above...&#10;&#10;apiVersion: v1&#10;kind: Config&#10;clusters:&#10;  - cluster:&#10;      server: https://..."
                    rows={12}
                    className="w-full px-4 py-3 rounded-lg border-2 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-mono text-sm resize-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    data-testid="kubeconfig-input"
                  />
                  {kubeconfig && (
                    <div className="absolute top-2 right-2">
                      <span className="px-2 py-1 bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400 text-xs rounded">
                        ✓ Config loaded ({kubeconfig.split('\n').length} lines)
                      </span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Usually found at <code className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded font-mono">~/.kube/config</code>
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
