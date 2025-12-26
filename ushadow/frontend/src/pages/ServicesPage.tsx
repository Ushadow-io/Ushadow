import { useState, useEffect } from 'react'
import { Server, Plus, RefreshCw, Settings, Trash2, CheckCircle, XCircle, AlertCircle, Package, Upload, Network, Play, Square, RotateCw, FileText, X } from 'lucide-react'
import { servicesApi, deploymentsApi, clusterApi, ServiceDefinition, Deployment } from '../services/api'

interface Service {
  service_id: string
  name: string
  description?: string
  service_type: string
  integration_type: string
  status: string
  connection?: {
    base_url?: string
  }
  metadata?: {
    last_sync?: string
    sync_count?: number
    error_count?: number
  }
}

interface UNode {
  hostname: string
  status: string
  role: string
  tailscale_ip?: string
}

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState<'deployable' | 'integrations'>('deployable')
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testingService, setTestingService] = useState<string | null>(null)

  // Deployable services state
  const [deployableServices, setDeployableServices] = useState<ServiceDefinition[]>([])
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [unodes, setUnodes] = useState<UNode[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDeployModal, setShowDeployModal] = useState(false)
  const [selectedService, setSelectedService] = useState<ServiceDefinition | null>(null)
  const [selectedNode, setSelectedNode] = useState<string>('')
  const [deploying, setDeploying] = useState(false)
  const [creatingService, setCreatingService] = useState(false)
  const [newService, setNewService] = useState({
    service_id: '',
    name: '',
    description: '',
    image: '',
    ports: '',
    environment: '',
    restart_policy: 'unless-stopped',
  })

  useEffect(() => {
    if (activeTab === 'integrations') {
      loadServices()
    } else {
      loadDeployableData()
    }
  }, [activeTab])

  const loadServices = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await servicesApi.list()
      setServices(response.data)
    } catch (err: any) {
      console.error('Error loading services:', err)
      setError(err.response?.data?.detail || 'Failed to load services')
    } finally {
      setLoading(false)
    }
  }

  const loadDeployableData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [servicesRes, deploymentsRes, unodesRes] = await Promise.all([
        deploymentsApi.listServices(),
        deploymentsApi.listDeployments(),
        clusterApi.listUnodes(),
      ])
      setDeployableServices(servicesRes.data)
      setDeployments(deploymentsRes.data)
      setUnodes(unodesRes.data)
    } catch (err: any) {
      console.error('Error loading deployable data:', err)
      setError(err.response?.data?.detail || 'Failed to load deployable services')
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async (serviceId: string) => {
    try {
      setTestingService(serviceId)
      const response = await servicesApi.testConnection(serviceId)
      if (response.data.success) {
        alert(`Connection successful: ${response.data.message}`)
      } else {
        alert(`Connection failed: ${response.data.message}`)
      }
    } catch (err: any) {
      console.error('Error testing connection:', err)
      alert(`Connection test failed: ${err.response?.data?.detail || err.message}`)
    } finally {
      setTestingService(null)
    }
  }

  const handleDeleteService = async (serviceId: string, serviceName: string) => {
    if (!confirm(`Are you sure you want to delete "${serviceName}"?`)) {
      return
    }

    try {
      await servicesApi.delete(serviceId)
      alert(`Deleted service: ${serviceName}`)
      loadServices()
    } catch (err: any) {
      console.error('Error deleting service:', err)
      alert(`Failed to delete service: ${err.response?.data?.detail || err.message}`)
    }
  }

  const handleCreateService = async () => {
    try {
      setCreatingService(true)

      // Parse ports JSON
      let ports: Record<string, number> = {}
      if (newService.ports.trim()) {
        try {
          ports = JSON.parse(newService.ports)
        } catch {
          alert('Invalid ports JSON. Example: {"8080": 80}')
          return
        }
      }

      // Parse environment JSON
      let environment: Record<string, string> = {}
      if (newService.environment.trim()) {
        try {
          environment = JSON.parse(newService.environment)
        } catch {
          alert('Invalid environment JSON. Example: {"KEY": "value"}')
          return
        }
      }

      await deploymentsApi.createService({
        service_id: newService.service_id,
        name: newService.name,
        description: newService.description,
        image: newService.image,
        ports,
        environment,
        volumes: [],
        restart_policy: newService.restart_policy,
        tags: [],
        metadata: {},
      })

      setShowCreateModal(false)
      setNewService({
        service_id: '',
        name: '',
        description: '',
        image: '',
        ports: '',
        environment: '',
        restart_policy: 'unless-stopped',
      })
      loadDeployableData()
    } catch (err: any) {
      console.error('Error creating service:', err)
      alert(`Failed to create service: ${err.response?.data?.detail || err.message}`)
    } finally {
      setCreatingService(false)
    }
  }

  const handleDeleteDeployableService = async (serviceId: string, serviceName: string) => {
    if (!confirm(`Are you sure you want to delete "${serviceName}"? This will not affect running deployments.`)) {
      return
    }

    try {
      await deploymentsApi.deleteService(serviceId)
      loadDeployableData()
    } catch (err: any) {
      console.error('Error deleting service:', err)
      alert(`Failed to delete service: ${err.response?.data?.detail || err.message}`)
    }
  }

  const handleOpenDeployModal = (service: ServiceDefinition) => {
    setSelectedService(service)
    setSelectedNode('')
    setShowDeployModal(true)
  }

  const handleDeploy = async () => {
    if (!selectedService || !selectedNode) return

    try {
      setDeploying(true)
      await deploymentsApi.deploy(selectedService.service_id, selectedNode)
      setShowDeployModal(false)
      loadDeployableData()
    } catch (err: any) {
      console.error('Error deploying service:', err)
      alert(`Failed to deploy service: ${err.response?.data?.detail || err.message}`)
    } finally {
      setDeploying(false)
    }
  }

  const handleStopDeployment = async (deploymentId: string) => {
    try {
      await deploymentsApi.stopDeployment(deploymentId)
      loadDeployableData()
    } catch (err: any) {
      console.error('Error stopping deployment:', err)
      alert(`Failed to stop deployment: ${err.response?.data?.detail || err.message}`)
    }
  }

  const handleRestartDeployment = async (deploymentId: string) => {
    try {
      await deploymentsApi.restartDeployment(deploymentId)
      loadDeployableData()
    } catch (err: any) {
      console.error('Error restarting deployment:', err)
      alert(`Failed to restart deployment: ${err.response?.data?.detail || err.message}`)
    }
  }

  const handleRemoveDeployment = async (deploymentId: string) => {
    if (!confirm('Are you sure you want to remove this deployment?')) return

    try {
      await deploymentsApi.removeDeployment(deploymentId)
      loadDeployableData()
    } catch (err: any) {
      console.error('Error removing deployment:', err)
      alert(`Failed to remove deployment: ${err.response?.data?.detail || err.message}`)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'running':
        return <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400" />
      case 'inactive':
      case 'stopped':
        return <XCircle className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
      case 'error':
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-danger-600 dark:text-danger-400" />
      case 'deploying':
      case 'pending':
        return <RefreshCw className="h-5 w-5 text-warning-600 dark:text-warning-400 animate-spin" />
      default:
        return <AlertCircle className="h-5 w-5 text-warning-600 dark:text-warning-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase()
    let colorClass = 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'

    switch (statusLower) {
      case 'running':
        colorClass = 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
        break
      case 'stopped':
        colorClass = 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
        break
      case 'failed':
        colorClass = 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400'
        break
      case 'deploying':
      case 'pending':
        colorClass = 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
        break
    }

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colorClass}`}>
        {status}
      </span>
    )
  }

  const getIntegrationTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'rest':
        return 'text-primary-600 dark:text-primary-400'
      case 'mcp':
        return 'text-info-600 dark:text-info-400'
      case 'graphql':
        return 'text-warning-600 dark:text-warning-400'
      default:
        return 'text-neutral-600 dark:text-neutral-400'
    }
  }

  const getServiceDeployments = (serviceId: string) => {
    return deployments.filter(d => d.service_id === serviceId)
  }

  const getAvailableNodes = (serviceId: string) => {
    const deployedNodes = new Set(
      deployments
        .filter(d => d.service_id === serviceId && d.status !== 'failed' && d.status !== 'stopped')
        .map(d => d.unode_hostname)
    )
    return unodes.filter(n => n.status === 'online' && !deployedNodes.has(n.hostname))
  }

  // Stats for integrations tab
  const totalServices = services.length
  const activeServices = services.filter(s => s.status?.toLowerCase() === 'active').length
  const memoryServices = services.filter(s => s.service_type?.includes('memory')).length
  const errorServices = services.filter(s => s.status?.toLowerCase() === 'error').length

  // Stats for deployable tab
  const totalDeployable = deployableServices.length
  const runningDeployments = deployments.filter(d => d.status === 'running').length
  const failedDeployments = deployments.filter(d => d.status === 'failed').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Services</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Manage deployable services and external integrations
          </p>
        </div>
        {activeTab === 'deployable' ? (
          <button
            className="btn-primary flex items-center space-x-2"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="h-5 w-5" />
            <span>Create Service</span>
          </button>
        ) : (
          <button
            className="btn-primary flex items-center space-x-2"
            onClick={() => alert('Add Service wizard coming in Phase 2!')}
          >
            <Plus className="h-5 w-5" />
            <span>Add Integration</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-200 dark:border-neutral-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('deployable')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'deployable'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-300'
            }`}
          >
            <Package className="h-5 w-5 inline mr-2" />
            Deployable Services
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'integrations'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-300'
            }`}
          >
            <Network className="h-5 w-5 inline mr-2" />
            Integrations
          </button>
        </nav>
      </div>

      {/* Stats */}
      {activeTab === 'deployable' ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card-hover p-4">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Service Definitions</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{totalDeployable}</p>
          </div>
          <div className="card-hover p-4">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Running</p>
            <p className="mt-2 text-2xl font-bold text-success-600 dark:text-success-400">{runningDeployments}</p>
          </div>
          <div className="card-hover p-4">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Deployments</p>
            <p className="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400">{deployments.length}</p>
          </div>
          <div className="card-hover p-4">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Failed</p>
            <p className="mt-2 text-2xl font-bold text-danger-600 dark:text-danger-400">{failedDeployments}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card-hover p-4">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Services</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{totalServices}</p>
          </div>
          <div className="card-hover p-4">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Active</p>
            <p className="mt-2 text-2xl font-bold text-success-600 dark:text-success-400">{activeServices}</p>
          </div>
          <div className="card-hover p-4">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Memory Sources</p>
            <p className="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400">{memoryServices}</p>
          </div>
          <div className="card-hover p-4">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Errors</p>
            <p className="mt-2 text-2xl font-bold text-danger-600 dark:text-danger-400">{errorServices}</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="card p-4 border-l-4 border-danger-600 bg-danger-50 dark:bg-danger-900/20">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-danger-600 dark:text-danger-400" />
            <p className="text-danger-900 dark:text-danger-200">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <RefreshCw className="h-12 w-12 text-neutral-400 dark:text-neutral-600 mx-auto mb-4 animate-spin" />
          <p className="text-neutral-600 dark:text-neutral-400">Loading services...</p>
        </div>
      )}

      {/* Deployable Services Tab Content */}
      {!loading && !error && activeTab === 'deployable' && (
        <div>
          {deployableServices.length === 0 ? (
            <div className="card p-12 text-center">
              <Package className="h-16 w-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                No service definitions yet
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 mb-6">
                Create a service definition to deploy Docker containers to your u-nodes
              </p>
              <button
                className="btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="h-5 w-5 mr-2 inline" />
                Create First Service
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {deployableServices.map((service) => {
                const serviceDeployments = getServiceDeployments(service.service_id)
                const availableNodes = getAvailableNodes(service.service_id)

                return (
                  <div key={service.service_id} className="card p-6">
                    {/* Service Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                          <Package className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {service.name}
                          </h3>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                            {service.image}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleOpenDeployModal(service)}
                          disabled={availableNodes.length === 0}
                          className="btn-primary py-1.5 px-3 text-sm disabled:opacity-50"
                          title={availableNodes.length === 0 ? 'No available nodes' : 'Deploy to node'}
                        >
                          <Upload className="h-4 w-4 mr-1 inline" />
                          Deploy
                        </button>
                        <button
                          onClick={() => handleDeleteDeployableService(service.service_id, service.name)}
                          className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Service Description */}
                    {service.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                        {service.description}
                      </p>
                    )}

                    {/* Service Config Summary */}
                    <div className="flex flex-wrap gap-2 mb-4 text-xs">
                      {Object.keys(service.ports || {}).length > 0 && (
                        <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded">
                          Ports: {Object.entries(service.ports || {}).map(([c, h]) => `${h}:${c}`).join(', ')}
                        </span>
                      )}
                      <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded">
                        Restart: {service.restart_policy}
                      </span>
                    </div>

                    {/* Deployments */}
                    {serviceDeployments.length > 0 && (
                      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
                        <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
                          Deployments ({serviceDeployments.length})
                        </h4>
                        <div className="space-y-2">
                          {serviceDeployments.map((deployment) => (
                            <div
                              key={deployment.id}
                              className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg"
                            >
                              <div className="flex items-center space-x-3">
                                {getStatusIcon(deployment.status)}
                                <div>
                                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                    {deployment.unode_hostname}
                                  </p>
                                  <div className="flex items-center space-x-2 mt-1">
                                    {getStatusBadge(deployment.status)}
                                    {deployment.error && (
                                      <span className="text-xs text-danger-600 dark:text-danger-400">
                                        {deployment.error}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-1">
                                {deployment.status === 'running' ? (
                                  <>
                                    <button
                                      onClick={() => handleRestartDeployment(deployment.id)}
                                      className="p-1.5 text-neutral-500 hover:text-warning-600 dark:hover:text-warning-400 rounded"
                                      title="Restart"
                                    >
                                      <RotateCw className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => handleStopDeployment(deployment.id)}
                                      className="p-1.5 text-neutral-500 hover:text-danger-600 dark:hover:text-danger-400 rounded"
                                      title="Stop"
                                    >
                                      <Square className="h-4 w-4" />
                                    </button>
                                  </>
                                ) : deployment.status === 'stopped' ? (
                                  <button
                                    onClick={() => handleRestartDeployment(deployment.id)}
                                    className="p-1.5 text-neutral-500 hover:text-success-600 dark:hover:text-success-400 rounded"
                                    title="Start"
                                  >
                                    <Play className="h-4 w-4" />
                                  </button>
                                ) : null}
                                <button
                                  onClick={() => handleRemoveDeployment(deployment.id)}
                                  className="p-1.5 text-neutral-500 hover:text-danger-600 dark:hover:text-danger-400 rounded"
                                  title="Remove"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No Deployments Message */}
                    {serviceDeployments.length === 0 && (
                      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-2">
                          Not deployed to any nodes yet
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Integrations Tab Content */}
      {!loading && !error && activeTab === 'integrations' && (
        <div>
          {services.length === 0 ? (
            <div className="card p-12 text-center">
              <Server className="h-16 w-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                No integrations configured
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 mb-6">
                Get started by adding your first external service integration
              </p>
              <button
                className="btn-primary"
                onClick={() => alert('Add Service wizard coming in Phase 2!')}
              >
                <Plus className="h-5 w-5 mr-2 inline" />
                Add Your First Integration
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((service) => (
                <div key={service.service_id} className="card-hover p-6">
                  {/* Service Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                        <Server className={`h-6 w-6 ${getIntegrationTypeColor(service.integration_type)}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {service.name}
                        </h3>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">
                          {service.integration_type?.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    {getStatusIcon(service.status)}
                  </div>

                  {/* Service Description */}
                  {service.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 line-clamp-2">
                      {service.description}
                    </p>
                  )}

                  {/* Service Stats */}
                  {service.metadata && (
                    <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                      {service.metadata.sync_count !== undefined && (
                        <div className="bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1">
                          <span className="text-neutral-600 dark:text-neutral-400">Syncs:</span>{' '}
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {service.metadata.sync_count}
                          </span>
                        </div>
                      )}
                      {service.metadata.error_count !== undefined && (
                        <div className="bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1">
                          <span className="text-neutral-600 dark:text-neutral-400">Errors:</span>{' '}
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {service.metadata.error_count}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Service Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleTestConnection(service.service_id)}
                      disabled={testingService === service.service_id}
                      className="flex-1 btn-secondary py-2 text-sm disabled:opacity-50"
                    >
                      {testingService === service.service_id ? (
                        <RefreshCw className="h-4 w-4 mx-auto animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </button>
                    <button
                      onClick={() => alert(`Settings for ${service.name} coming soon!`)}
                      className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteService(service.service_id, service.name)}
                      className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Service Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Create Service Definition
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Service ID
                </label>
                <input
                  type="text"
                  value={newService.service_id}
                  onChange={(e) => setNewService({ ...newService, service_id: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                  placeholder="my-service"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                  placeholder="My Service"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Description
                </label>
                <textarea
                  value={newService.description}
                  onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Docker Image
                </label>
                <input
                  type="text"
                  value={newService.image}
                  onChange={(e) => setNewService({ ...newService, image: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                  placeholder="nginx:latest"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Ports (JSON)
                </label>
                <input
                  type="text"
                  value={newService.ports}
                  onChange={(e) => setNewService({ ...newService, ports: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono text-sm"
                  placeholder='{"80": 8080}'
                />
                <p className="text-xs text-neutral-500 mt-1">Container port to host port mapping</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Environment (JSON)
                </label>
                <input
                  type="text"
                  value={newService.environment}
                  onChange={(e) => setNewService({ ...newService, environment: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono text-sm"
                  placeholder='{"KEY": "value"}'
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Restart Policy
                </label>
                <select
                  value={newService.restart_policy}
                  onChange={(e) => setNewService({ ...newService, restart_policy: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                >
                  <option value="unless-stopped">Unless Stopped</option>
                  <option value="always">Always</option>
                  <option value="on-failure">On Failure</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-4 border-t border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateService}
                disabled={creatingService || !newService.service_id || !newService.name || !newService.image}
                className="btn-primary disabled:opacity-50"
              >
                {creatingService ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  'Create Service'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy Modal */}
      {showDeployModal && selectedService && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Deploy {selectedService.name}
              </h2>
              <button
                onClick={() => setShowDeployModal(false)}
                className="p-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Select Target Node
              </label>
              <select
                value={selectedNode}
                onChange={(e) => setSelectedNode(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
              >
                <option value="">Select a node...</option>
                {getAvailableNodes(selectedService.service_id).map((node) => (
                  <option key={node.hostname} value={node.hostname}>
                    {node.hostname} ({node.role})
                  </option>
                ))}
              </select>
              {getAvailableNodes(selectedService.service_id).length === 0 && (
                <p className="text-sm text-warning-600 dark:text-warning-400 mt-2">
                  No available nodes. The service may already be deployed to all online nodes.
                </p>
              )}
            </div>
            <div className="flex justify-end space-x-3 p-4 border-t border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => setShowDeployModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDeploy}
                disabled={deploying || !selectedNode}
                className="btn-primary disabled:opacity-50"
              >
                {deploying ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2 inline" />
                    Deploy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
