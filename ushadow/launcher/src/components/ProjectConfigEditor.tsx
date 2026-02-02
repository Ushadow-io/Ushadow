import { useState, useEffect } from 'react'
import { Save, X, FileSearch, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { tauri, type DetectedEnvVar } from '../hooks/useTauri'
import type { LauncherConfig } from '../hooks/useTauri'

interface ProjectConfigEditorProps {
  isOpen: boolean
  projectRoot: string
  onClose: () => void
  onSave?: () => void
}

// Common infrastructure services
const INFRASTRUCTURE_SERVICES = [
  { id: 'postgres', name: 'PostgreSQL', defaultPort: 5432 },
  { id: 'mysql', name: 'MySQL', defaultPort: 3306 },
  { id: 'redis', name: 'Redis', defaultPort: 6379 },
  { id: 'mongodb', name: 'MongoDB', defaultPort: 27017 },
  { id: 'elasticsearch', name: 'Elasticsearch', defaultPort: 9200 },
  { id: 'rabbitmq', name: 'RabbitMQ', defaultPort: 5672 },
  { id: 'kafka', name: 'Kafka', defaultPort: 9092 },
]

export function ProjectConfigEditor({ isOpen, projectRoot, onClose, onSave }: ProjectConfigEditorProps) {
  const [config, setConfig] = useState<Partial<LauncherConfig> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Infrastructure selection
  const [selectedInfra, setSelectedInfra] = useState<string[]>([])

  // All detected env vars
  const [allEnvVars, setAllEnvVars] = useState<DetectedEnvVar[]>([])

  // Port categorization
  const [managedPorts, setManagedPorts] = useState<DetectedEnvVar[]>([])
  const [sharedInfraPorts, setSharedInfraPorts] = useState<DetectedEnvVar[]>([])

  // Other variables with append env name flags
  const [otherVars, setOtherVars] = useState<DetectedEnvVar[]>([])
  const [appendEnvName, setAppendEnvName] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (isOpen && projectRoot) {
      loadConfig()
      scanAllEnvVars()
    }
  }, [isOpen, projectRoot])

  const loadConfig = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const cfg = await tauri.loadProjectConfig(projectRoot)
      setConfig(cfg)
    } catch (err) {
      console.warn('No existing config, creating new:', err)
      // Create default config
      setConfig({
        project: {
          name: projectRoot.split('/').pop() || 'project',
          display_name: projectRoot.split('/').pop() || 'Project'
        },
        prerequisites: {
          required: ['docker', 'git'],
          optional: []
        },
        setup: {
          command: './go.sh',
          env_vars: ['PROJECT_ROOT', 'WORKTREE_PATH', 'PORT_OFFSET']
        },
        infrastructure: {
          compose_file: 'docker-compose.yml',
          project_name: `${projectRoot.split('/').pop()}-infra`,
          profile: undefined
        },
        containers: {
          naming_pattern: '{env_name}-{service}',
          primary_service: 'backend',
          health_endpoint: '/health',
          tailscale_project_prefix: undefined
        },
        ports: {
          allocation_strategy: 'offset',
          base_port: 8000,
          offset: {
            min: 0,
            max: 100,
            step: 10
          }
        },
        worktrees: {
          default_parent: `../worktrees/${projectRoot.split('/').pop()}`,
          branch_prefix: undefined
        }
      })
    } finally {
      setIsLoading(false)
    }
  }

  const scanAllEnvVars = async () => {
    try {
      const vars = await tauri.scanAllEnvVars(projectRoot)
      setAllEnvVars(vars)

      // Separate into categories
      const ports = vars.filter(v => v.is_port)
      const nonPorts = vars.filter(v => !v.is_port)

      // Initially put all ports in managed, database ports can be moved to shared-infra
      setManagedPorts(ports.filter(v => !v.is_database_port))
      setSharedInfraPorts(ports.filter(v => v.is_database_port))
      setOtherVars(nonPorts)

      // Initialize append env name checkboxes
      const appendFlags: Record<string, boolean> = {}
      nonPorts.forEach(v => {
        appendFlags[v.name] = v.should_append_env_name
      })
      setAppendEnvName(appendFlags)
    } catch (err) {
      console.error('Failed to scan env vars:', err)
      setError(`Failed to scan .env file: ${err}`)
    }
  }

  const toggleInfraService = (serviceId: string) => {
    setSelectedInfra(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    )
  }

  const movePortToManaged = (portVar: DetectedEnvVar) => {
    setSharedInfraPorts(prev => prev.filter(p => p.name !== portVar.name))
    setManagedPorts(prev => [...prev, portVar])
  }

  const movePortToSharedInfra = (portVar: DetectedEnvVar) => {
    setManagedPorts(prev => prev.filter(p => p.name !== portVar.name))
    setSharedInfraPorts(prev => [...prev, portVar])
  }

  const toggleAppendEnvName = (varName: string) => {
    setAppendEnvName(prev => ({
      ...prev,
      [varName]: !prev[varName]
    }))
  }

  const handleSave = async () => {
    if (!config) return

    setIsSaving(true)
    setError(null)

    try {
      // TODO: Call Rust backend to save config
      // await tauri.saveProjectConfig(projectRoot, config)
      console.log('Saving config:', {
        config,
        selectedInfra,
        managedPorts: managedPorts.map(p => p.name),
        sharedInfraPorts: sharedInfraPorts.map(p => p.name),
        appendEnvName
      })

      if (onSave) onSave()
      onClose()
    } catch (err) {
      setError(`Failed to save config: ${err}`)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="project-config-editor">
      <div className="bg-surface-800 rounded-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto mx-4 shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-surface-800 border-b border-surface-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Project Configuration</h2>
            <p className="text-sm text-text-muted mt-1">{projectRoot}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-surface-700 transition-colors"
            data-testid="close-config-editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-text-muted">Loading configuration...</div>
        ) : config ? (
          <div className="p-6 space-y-6">
            {/* Project Info */}
            <section>
              <h3 className="text-lg font-semibold mb-4">Project Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">Project Name</label>
                  <input
                    type="text"
                    value={config.project?.name || ''}
                    onChange={(e) => setConfig({
                      ...config,
                      project: { ...config.project!, name: e.target.value }
                    })}
                    className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500/50"
                    data-testid="project-name-input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-2">Display Name</label>
                  <input
                    type="text"
                    value={config.project?.display_name || ''}
                    onChange={(e) => setConfig({
                      ...config,
                      project: { ...config.project!, display_name: e.target.value }
                    })}
                    className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500/50"
                    data-testid="project-display-name-input"
                  />
                </div>
              </div>
            </section>

            {/* Environment Startup */}
            <section>
              <h3 className="text-lg font-semibold mb-4">Environment Startup</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">
                    Startup Command
                    <span className="text-text-muted ml-2">(run when starting an environment)</span>
                  </label>
                  <input
                    type="text"
                    value={config.setup?.command || ''}
                    onChange={(e) => setConfig({
                      ...config,
                      setup: { ...config.setup!, command: e.target.value }
                    })}
                    placeholder="./go.sh or docker compose up -d"
                    className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500/50 font-mono text-sm"
                    data-testid="startup-command-input"
                  />
                </div>
              </div>
            </section>

            {/* Infrastructure Selection */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Shared Infrastructure</h3>
                <button
                  onClick={scanAllEnvVars}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface-700 hover:bg-surface-600 text-sm transition-colors"
                  data-testid="scan-env-button"
                >
                  <FileSearch className="w-4 h-4" />
                  Scan .env files
                </button>
              </div>
              <p className="text-sm text-text-muted mb-4">
                Select which infrastructure services are shared across environments (won't be offset)
              </p>
              <div className="grid grid-cols-3 gap-3">
                {INFRASTRUCTURE_SERVICES.map(service => {
                  const isSelected = selectedInfra.includes(service.id)
                  return (
                    <button
                      key={service.id}
                      onClick={() => toggleInfraService(service.id)}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg border-2 transition-all
                        ${isSelected
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-surface-600 bg-surface-700/50 hover:border-surface-500'
                        }
                      `}
                      data-testid={`infra-service-${service.id}`}
                    >
                      <div className={`
                        w-5 h-5 rounded border-2 flex items-center justify-center
                        ${isSelected ? 'bg-primary-500 border-primary-500' : 'border-surface-500'}
                      `}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-sm">{service.name}</p>
                        <p className="text-xs text-text-muted">:{service.defaultPort}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Port Management - Two Column Layout */}
            <section>
              <h3 className="text-lg font-semibold mb-4">Port Management</h3>
              <p className="text-sm text-text-muted mb-4">
                Drag ports between columns or click arrows. Managed ports will be offset for each environment.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Managed Ports (Left) */}
                <div className="bg-surface-700/30 rounded-lg p-4 border-2 border-green-500/30">
                  <h4 className="font-medium mb-3 text-green-400">Managed Ports (Offset)</h4>
                  <div className="space-y-2 min-h-[200px]">
                    {managedPorts.length === 0 ? (
                      <p className="text-sm text-text-muted text-center py-8">No managed ports</p>
                    ) : (
                      managedPorts.map((port, idx) => (
                        <div
                          key={port.name}
                          className="flex items-center gap-2 p-2 bg-surface-700 rounded border border-surface-600"
                          data-testid={`managed-port-${port.name}`}
                        >
                          <code className="flex-1 text-sm text-primary-400">{port.name}</code>
                          <span className="text-xs text-text-muted">{port.default_value}</span>
                          <button
                            onClick={() => movePortToSharedInfra(port)}
                            className="p-1 rounded hover:bg-surface-600 text-text-muted hover:text-primary-400"
                            title="Move to shared infrastructure"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Shared Infrastructure Ports (Right) */}
                <div className="bg-surface-700/30 rounded-lg p-4 border-2 border-blue-500/30">
                  <h4 className="font-medium mb-3 text-blue-400">Shared Infrastructure (No Offset)</h4>
                  <div className="space-y-2 min-h-[200px]">
                    {sharedInfraPorts.length === 0 ? (
                      <p className="text-sm text-text-muted text-center py-8">No shared infrastructure ports</p>
                    ) : (
                      sharedInfraPorts.map((port, idx) => (
                        <div
                          key={port.name}
                          className="flex items-center gap-2 p-2 bg-surface-700 rounded border border-surface-600"
                          data-testid={`shared-port-${port.name}`}
                        >
                          <button
                            onClick={() => movePortToManaged(port)}
                            className="p-1 rounded hover:bg-surface-600 text-text-muted hover:text-primary-400"
                            title="Move to managed"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </button>
                          <code className="flex-1 text-sm text-blue-400">{port.name}</code>
                          <span className="text-xs text-text-muted">{port.default_value}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Port Offset Settings */}
              {config.ports?.allocation_strategy === 'offset' && (
                <div className="mt-4 grid grid-cols-3 gap-4 p-4 bg-surface-700/30 rounded-lg">
                  <div>
                    <label className="block text-sm text-text-secondary mb-2">Base Port</label>
                    <input
                      type="number"
                      value={config.ports?.base_port || 8000}
                      onChange={(e) => setConfig({
                        ...config,
                        ports: { ...config.ports!, base_port: parseInt(e.target.value) }
                      })}
                      className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-2">Step</label>
                    <input
                      type="number"
                      value={config.ports?.offset?.step || 10}
                      onChange={(e) => setConfig({
                        ...config,
                        ports: {
                          ...config.ports!,
                          offset: { ...config.ports!.offset!, step: parseInt(e.target.value) }
                        }
                      })}
                      className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-text-secondary mb-2">Max Offset</label>
                    <input
                      type="number"
                      value={config.ports?.offset?.max || 100}
                      onChange={(e) => setConfig({
                        ...config,
                        ports: {
                          ...config.ports!,
                          offset: { ...config.ports!.offset!, max: parseInt(e.target.value) }
                        }
                      })}
                      className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Other Environment Variables */}
            {otherVars.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold mb-4">Other Environment Variables</h3>
                <p className="text-sm text-text-muted mb-4">
                  Check variables that should have the environment name appended (e.g., DB_NAME becomes DB_NAME_envname)
                </p>
                <div className="space-y-2">
                  {otherVars.map((envVar) => (
                    <div
                      key={envVar.name}
                      className="flex items-center gap-3 p-3 bg-surface-700/50 rounded-lg hover:bg-surface-700 transition-colors"
                      data-testid={`env-var-${envVar.name}`}
                    >
                      <button
                        onClick={() => toggleAppendEnvName(envVar.name)}
                        className={`
                          w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                          ${appendEnvName[envVar.name]
                            ? 'bg-primary-500 border-primary-500'
                            : 'border-surface-500 hover:border-surface-400'
                          }
                        `}
                        data-testid={`append-env-checkbox-${envVar.name}`}
                      >
                        {appendEnvName[envVar.name] && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <code className="flex-1 text-sm text-text-primary">{envVar.name}</code>
                      <span className="text-xs text-text-muted font-mono">{envVar.default_value}</span>
                      {appendEnvName[envVar.name] && (
                        <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-1 rounded">
                          Append env name
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="sticky bottom-0 bg-surface-800 border-t border-surface-700 p-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
            data-testid="cancel-config-button"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-2"
            data-testid="save-config-button"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  )
}
