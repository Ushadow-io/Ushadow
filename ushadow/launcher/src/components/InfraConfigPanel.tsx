import { useState, useEffect } from 'react'
import { FileSearch, Check, Save, Search, ChevronRight, ChevronLeft } from 'lucide-react'
import { tauri, type DetectedEnvVar } from '../hooks/useTauri'

interface InfraConfigPanelProps {
  projectRoot: string
  selectedInfraServices: string[]
  onSave?: (config: InfraConfiguration) => void
}

export interface InfraConfiguration {
  managedPorts: string[]
  sharedInfraPorts: string[]
  appendEnvName: Record<string, boolean>
}

export function InfraConfigPanel({ projectRoot, selectedInfraServices, onSave }: InfraConfigPanelProps) {
  const [allEnvVars, setAllEnvVars] = useState<DetectedEnvVar[]>([])
  const [managedPorts, setManagedPorts] = useState<DetectedEnvVar[]>([])
  const [sharedInfraPorts, setSharedInfraPorts] = useState<DetectedEnvVar[]>([])
  const [otherVars, setOtherVars] = useState<DetectedEnvVar[]>([])
  const [appendEnvName, setAppendEnvName] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState('')

  useEffect(() => {
    if (projectRoot) {
      scanAllEnvVars()
    }
  }, [projectRoot])

  // Auto-categorize ports when selected infrastructure services change
  useEffect(() => {
    if (allEnvVars.length > 0) {
      categorizePorts()
    }
  }, [selectedInfraServices])

  const scanAllEnvVars = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const vars = await tauri.scanAllEnvVars(projectRoot)
      setAllEnvVars(vars)

      const ports = vars.filter(v => v.is_port)
      const nonPorts = vars.filter(v => !v.is_port)

      // Initial categorization
      categorizePorts(ports)
      setOtherVars(nonPorts)

      const appendFlags: Record<string, boolean> = {}
      nonPorts.forEach(v => {
        appendFlags[v.name] = v.should_append_env_name
      })
      setAppendEnvName(appendFlags)
    } catch (err) {
      console.error('Failed to scan env vars:', err)
      setError(`Failed to scan .env file: ${err}`)
    } finally {
      setIsLoading(false)
    }
  }

  const categorizePorts = (portsToCategorize?: DetectedEnvVar[]) => {
    const ports = portsToCategorize || allEnvVars.filter(v => v.is_port)

    // Smart categorization based on selected infrastructure
    const shared: DetectedEnvVar[] = []
    const managed: DetectedEnvVar[] = []

    ports.forEach(port => {
      const portName = port.name.toLowerCase()
      const isShared = selectedInfraServices.some(service =>
        portName.includes(service.toLowerCase())
      )

      if (isShared || port.is_database_port) {
        shared.push(port)
      } else {
        managed.push(port)
      }
    })

    setSharedInfraPorts(shared)
    setManagedPorts(managed)
  }

  // Move ports between columns
  const moveToManaged = (port: DetectedEnvVar) => {
    setSharedInfraPorts(prev => prev.filter(p => p.name !== port.name))
    setManagedPorts(prev => [...prev, port])
  }

  const moveToShared = (port: DetectedEnvVar) => {
    setManagedPorts(prev => prev.filter(p => p.name !== port.name))
    setSharedInfraPorts(prev => [...prev, port])
  }

  const toggleAppendEnvName = (varName: string) => {
    setAppendEnvName(prev => ({
      ...prev,
      [varName]: !prev[varName]
    }))
  }

  const handleSave = () => {
    const config: InfraConfiguration = {
      managedPorts: managedPorts.map(p => p.name),
      sharedInfraPorts: sharedInfraPorts.map(p => p.name),
      appendEnvName
    }

    console.log('Saving infra config:', config)
    if (onSave) onSave(config)

    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  const hasEnvVars = allEnvVars.length > 0

  if (!hasEnvVars) {
    return (
      <div className="bg-surface-800 rounded-lg p-6">
        <button
          onClick={scanAllEnvVars}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded bg-primary-500 hover:bg-primary-600 text-white transition-colors disabled:opacity-50"
          data-testid="scan-env-button"
        >
          <FileSearch className="w-4 h-4" />
          {isLoading ? 'Scanning...' : 'Scan .env Files'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="infra-config-panel">
      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-3" style={{ maxHeight: '50vh' }}>
        {/* Left Column: Port Management */}
        <div className="bg-surface-800 rounded-lg p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Port Management</h3>
            <button
              onClick={scanAllEnvVars}
              className="text-xs text-primary-400 hover:text-primary-300"
            >
              Rescan
            </button>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Drag ports between columns to categorize
          </p>

          <div className="flex-1 grid grid-cols-2 gap-2 overflow-hidden">
            {/* Managed Ports */}
            <div className="bg-surface-700/30 rounded-lg p-2 border border-green-500/30 flex flex-col overflow-hidden">
              <h4 className="text-xs font-medium mb-2 text-green-400">Managed (Offset)</h4>
              <div className="flex-1 overflow-y-auto space-y-1">
                {managedPorts.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-4">Drop ports here</p>
                ) : (
                  managedPorts.map((port) => (
                    <button
                      key={port.name}
                      onClick={() => moveToShared(port)}
                      className="w-full flex items-center gap-1.5 p-1.5 bg-surface-700 rounded text-xs cursor-pointer hover:bg-blue-500/20 hover:border-blue-500/50 border border-transparent transition-all text-left"
                      data-testid={`managed-port-${port.name}`}
                      title="Click to move to Shared (No Offset)"
                    >
                      <code className="flex-1 text-primary-400 truncate text-xs">{port.name}</code>
                      <span className="text-text-muted text-xs">{port.default_value}</span>
                      <ChevronRight className="w-3 h-3 text-blue-400/50" />
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Shared Infrastructure Ports */}
            <div className="bg-surface-700/30 rounded-lg p-2 border border-blue-500/30 flex flex-col overflow-hidden">
              <h4 className="text-xs font-medium mb-2 text-blue-400">Shared (No Offset)</h4>
              <div className="flex-1 overflow-y-auto space-y-1">
                {sharedInfraPorts.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-4">Drop ports here</p>
                ) : (
                  sharedInfraPorts.map((port) => (
                    <button
                      key={port.name}
                      onClick={() => moveToManaged(port)}
                      className="w-full flex items-center gap-1.5 p-1.5 bg-surface-700 rounded text-xs cursor-pointer hover:bg-green-500/20 hover:border-green-500/50 border border-transparent transition-all text-left"
                      data-testid={`shared-port-${port.name}`}
                      title="Click to move to Managed (Offset)"
                    >
                      <ChevronLeft className="w-3 h-3 text-green-400/50" />
                      <code className="flex-1 text-blue-400 truncate text-xs">{port.name}</code>
                      <span className="text-text-muted text-xs">{port.default_value}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Environment Variables */}
        <div className="bg-surface-800 rounded-lg p-4 flex flex-col overflow-hidden">
          <h3 className="font-medium mb-3">Environment Variables</h3>
          <p className="text-xs text-text-muted mb-2">
            Check vars that should have environment name appended
          </p>

          {/* Search Filter */}
          <div className="relative mb-3">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search variables..."
              className="w-full bg-surface-700 rounded px-8 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary-500/50"
              data-testid="env-var-search"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1">
            {(() => {
              const filteredVars = otherVars.filter(envVar =>
                searchFilter === '' ||
                envVar.name.toLowerCase().includes(searchFilter.toLowerCase())
              )

              if (otherVars.length === 0) {
                return <p className="text-xs text-text-muted text-center py-8">No other variables found</p>
              }

              if (filteredVars.length === 0) {
                return <p className="text-xs text-text-muted text-center py-8">No variables match "{searchFilter}"</p>
              }

              return filteredVars.map((envVar) => (
                <button
                  key={envVar.name}
                  onClick={() => toggleAppendEnvName(envVar.name)}
                  className="w-full flex items-center gap-2 p-2 bg-surface-700/50 rounded-lg hover:bg-surface-700 transition-colors text-left"
                  data-testid={`env-var-${envVar.name}`}
                >
                  <div className={`
                    w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0
                    ${appendEnvName[envVar.name]
                      ? 'bg-primary-500 border-primary-500'
                      : 'border-surface-500'
                    }
                  `}>
                    {appendEnvName[envVar.name] && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <code className="flex-1 text-xs text-text-primary truncate">{envVar.name}</code>
                  <span className="text-xs text-text-muted font-mono">{envVar.default_value}</span>
                </button>
              ))
            })()}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="bg-surface-800 rounded-lg p-4 flex justify-end">
        <button
          onClick={handleSave}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg transition-all
            ${isSaved
              ? 'bg-green-500/20 text-green-400'
              : 'bg-primary-500 hover:bg-primary-600 text-white'
            }
          `}
          data-testid="save-infra-config"
        >
          <Save className="w-4 h-4" />
          {isSaved ? 'Saved!' : 'Save Configuration'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}
