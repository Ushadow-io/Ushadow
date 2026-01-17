import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Github,
  Loader2,
  FileCode,
  ChevronRight,
  ChevronLeft,
  Settings,
  Key,
  Check,
  AlertCircle,
  Server,
  Eye,
  EyeOff,
  RefreshCw,
  Box,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  githubImportApi,
  DetectedComposeFile,
  ComposeServiceInfo,
  ShadowHeaderConfig,
  EnvVarConfigItem,
  DockerHubImageInfo,
  PortConfig,
  VolumeConfig,
} from '../services/api'

interface ImportFromGitHubModalProps {
  isOpen: boolean
  onClose: () => void
  onServiceImported: () => void
}

type ImportSource = 'github' | 'dockerhub'
type WizardStep = 'url' | 'compose' | 'service' | 'config' | 'complete'

export default function ImportFromGitHubModal({
  isOpen,
  onClose,
  onServiceImported,
}: ImportFromGitHubModalProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('url')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Source type
  const [sourceType, setSourceType] = useState<ImportSource>('github')

  // URL step
  const [importUrl, setImportUrl] = useState('')
  const [branch, setBranch] = useState('')

  // Docker Hub specific
  const [dockerHubInfo, setDockerHubInfo] = useState<DockerHubImageInfo | null>(null)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTag, setSelectedTag] = useState('latest')
  const [imageDescription, setImageDescription] = useState('')

  // Compose file selection (GitHub)
  const [composeFiles, setComposeFiles] = useState<DetectedComposeFile[]>([])
  const [selectedComposeFile, setSelectedComposeFile] = useState<DetectedComposeFile | null>(null)

  // Service selection (GitHub)
  const [services, setServices] = useState<ComposeServiceInfo[]>([])
  const [selectedServices, setSelectedServices] = useState<ComposeServiceInfo[]>([])

  // Configuration
  const [serviceName, setServiceName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [shadowHeader, setShadowHeader] = useState<ShadowHeaderConfig>({
    enabled: true,
    header_name: 'X-Shadow-Service',
    header_value: '',
    route_path: '',
  })
  const [envVars, setEnvVars] = useState<EnvVarConfigItem[]>([])
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  // Docker Hub specific config
  const [ports, setPorts] = useState<PortConfig[]>([])
  const [volumes, setVolumes] = useState<VolumeConfig[]>([])

  // Capabilities this service provides
  const [capabilities, setCapabilities] = useState<string[]>([])

  // Env template paste
  const [showEnvPaste, setShowEnvPaste] = useState(false)
  const [envPasteText, setEnvPasteText] = useState('')

  // Common capability options
  const CAPABILITY_OPTIONS = [
    { id: 'llm', label: 'LLM', description: 'Language model inference' },
    { id: 'tts', label: 'TTS', description: 'Text to speech' },
    { id: 'stt', label: 'STT', description: 'Speech to text' },
    { id: 'embedding', label: 'Embedding', description: 'Text embeddings' },
    { id: 'memory', label: 'Memory', description: 'Persistent memory storage' },
    { id: 'vision', label: 'Vision', description: 'Image understanding' },
    { id: 'image_gen', label: 'Image Gen', description: 'Image generation' },
  ]

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep('url')
      setSourceType('github')
      setImportUrl('')
      setBranch('')
      setDockerHubInfo(null)
      setAvailableTags([])
      setSelectedTag('latest')
      setImageDescription('')
      setComposeFiles([])
      setSelectedComposeFile(null)
      setServices([])
      setSelectedServices([])
      setServiceName('')
      setDisplayName('')
      setDescription('')
      setShadowHeader({
        enabled: true,
        header_name: 'X-Shadow-Service',
        header_value: '',
        route_path: '',
      })
      setEnvVars([])
      setPorts([])
      setVolumes([])
      setCapabilities([])
      setShowEnvPaste(false)
      setEnvPasteText('')
      setError(null)
    }
  }, [isOpen])

  // Helper to extract error message from various error formats
  const extractErrorMessage = (err: any, fallback: string): string => {
    // Handle axios error response
    const detail = err?.response?.data?.detail
    if (detail) {
      // If detail is a string, use it directly
      if (typeof detail === 'string') {
        return detail
      }
      // If detail is an array (Pydantic validation errors), extract messages
      if (Array.isArray(detail)) {
        return detail
          .map((e: any) => e.msg || e.message || JSON.stringify(e))
          .join(', ')
      }
      // If detail is an object with a message field
      if (typeof detail === 'object' && detail.msg) {
        return detail.msg
      }
    }
    // Check for direct message field
    if (err?.response?.data?.message) {
      return err.response.data.message
    }
    // Check for error message on the error object itself
    if (err?.message && typeof err.message === 'string') {
      return err.message
    }
    return fallback
  }

  // Auto-detect source type from URL
  useEffect(() => {
    const url = importUrl.toLowerCase().trim()
    if (url.includes('github.com') || url.includes('githubusercontent.com')) {
      setSourceType('github')
    } else if (url.includes('hub.docker.com') || url.includes('docker.io') ||
               (url && !url.startsWith('http') && url.includes('/'))) {
      setSourceType('dockerhub')
    }
  }, [importUrl])

  // Scan using unified endpoint
  const handleScan = async () => {
    if (!importUrl.trim()) {
      setError('Please enter a URL or image reference')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await githubImportApi.unifiedScan(
        importUrl,
        branch || undefined,
        selectedTag !== 'latest' ? selectedTag : undefined
      )
      const data = response.data

      if (!data.success) {
        setError(data.error || 'Failed to scan')
        return
      }

      if (data.source_type === 'github') {
        // GitHub flow
        if (!data.compose_files || data.compose_files.length === 0) {
          setError('No docker-compose files found in the repository')
          return
        }
        setComposeFiles(data.compose_files)
        setStep('compose')
      } else {
        // Docker Hub flow
        if (data.dockerhub_info) {
          setDockerHubInfo(data.dockerhub_info)
          setAvailableTags(data.available_tags || ['latest'])
          setImageDescription(data.image_description || '')

          // Pre-populate service name from image
          const name = data.dockerhub_info.repository.replace(/[^a-zA-Z0-9]/g, '-')
          setServiceName(name)
          setDisplayName(name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' '))
          setDescription(data.image_description || `Docker Hub image: ${data.dockerhub_info.namespace}/${data.dockerhub_info.repository}`)
          setShadowHeader({
            enabled: true,
            header_name: 'X-Shadow-Service',
            header_value: name,
            route_path: `/${name}`,
          })

          // Add default port and volume
          setPorts([{ host_port: 8080, container_port: 8080, protocol: 'tcp' }])
          setVolumes([{ name: 'data', container_path: '/data', is_named_volume: true }])

          setStep('config')
        } else {
          setError('Could not parse Docker Hub image information')
        }
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to scan'))
    } finally {
      setLoading(false)
    }
  }

  // Parse selected compose file (GitHub)
  const handleSelectComposeFile = async (file: DetectedComposeFile) => {
    setSelectedComposeFile(file)
    setLoading(true)
    setError(null)

    try {
      const response = await githubImportApi.parse(importUrl, file.path)
      const data = response.data

      if (!data.success) {
        setError(data.error || 'Failed to parse compose file')
        return
      }

      if (data.services.length === 0) {
        setError('No services found in compose file')
        return
      }

      setServices(data.services)
      setStep('service')
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to parse compose file'))
    } finally {
      setLoading(false)
    }
  }

  // Toggle service selection (GitHub)
  const handleToggleService = (service: ComposeServiceInfo) => {
    setSelectedServices((prev) => {
      const isSelected = prev.some((s) => s.name === service.name)
      if (isSelected) {
        return prev.filter((s) => s.name !== service.name)
      } else {
        return [...prev, service]
      }
    })
  }

  // Select/deselect all services
  const handleSelectAllServices = () => {
    if (selectedServices.length === services.length) {
      setSelectedServices([])
    } else {
      setSelectedServices([...services])
    }
  }

  // Proceed to config after service selection
  const handleProceedToConfig = () => {
    if (selectedServices.length === 0) return

    // Use first selected service for basic config defaults
    const firstService = selectedServices[0]
    setServiceName(firstService.name)
    setDisplayName(firstService.name.charAt(0).toUpperCase() + firstService.name.slice(1).replace(/-/g, ' '))
    setShadowHeader({
      enabled: true,
      header_name: 'X-Shadow-Service',
      header_value: firstService.name,
      route_path: `/${firstService.name}`,
    })

    // Combine env vars from all selected services (deduplicated)
    const allEnvVars = new Map<string, EnvVarConfigItem>()
    for (const service of selectedServices) {
      for (const env of service.environment) {
        if (!allEnvVars.has(env.name)) {
          allEnvVars.set(env.name, {
            name: env.name,
            source: env.has_default ? 'default' : 'literal',
            value: env.default_value || '',
            is_secret: env.name.toLowerCase().includes('key') ||
                       env.name.toLowerCase().includes('secret') ||
                       env.name.toLowerCase().includes('password') ||
                       env.name.toLowerCase().includes('token'),
          })
        }
      }
    }
    setEnvVars(Array.from(allEnvVars.values()))
    setStep('config')
  }

  // Update environment variable
  const updateEnvVar = (index: number, updates: Partial<EnvVarConfigItem>) => {
    setEnvVars((prev) =>
      prev.map((ev, i) => (i === index ? { ...ev, ...updates } : ev))
    )
  }

  // Add new env var
  const addEnvVar = () => {
    setEnvVars((prev) => [...prev, { name: '', source: 'literal', value: '', is_secret: false }])
  }

  // Remove env var
  const removeEnvVar = (index: number) => {
    setEnvVars((prev) => prev.filter((_, i) => i !== index))
  }

  // Parse env template (KEY=value format, one per line)
  const parseEnvTemplate = () => {
    const lines = envPasteText.split('\n')
    const newEnvVars: EnvVarConfigItem[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue

      // Parse KEY=value or KEY= or just KEY
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/)
      if (match) {
        const name = match[1]
        const value = match[2] ?? ''

        // Check if already exists
        const exists = envVars.some((e) => e.name === name)
        if (!exists) {
          newEnvVars.push({
            name,
            source: 'literal',
            value,
            is_secret: name.toLowerCase().includes('key') ||
                       name.toLowerCase().includes('secret') ||
                       name.toLowerCase().includes('password') ||
                       name.toLowerCase().includes('token'),
          })
        }
      }
    }

    if (newEnvVars.length > 0) {
      setEnvVars((prev) => [...prev, ...newEnvVars])
    }
    setEnvPasteText('')
    setShowEnvPaste(false)
  }

  // Add port
  const addPort = () => {
    setPorts((prev) => [...prev, { host_port: 8080, container_port: 8080, protocol: 'tcp' }])
  }

  // Remove port
  const removePort = (index: number) => {
    setPorts((prev) => prev.filter((_, i) => i !== index))
  }

  // Update port
  const updatePort = (index: number, updates: Partial<PortConfig>) => {
    setPorts((prev) => prev.map((p, i) => (i === index ? { ...p, ...updates } : p)))
  }

  // Add volume
  const addVolume = () => {
    setVolumes((prev) => [...prev, { name: 'data', container_path: '/data', is_named_volume: true }])
  }

  // Remove volume
  const removeVolume = (index: number) => {
    setVolumes((prev) => prev.filter((_, i) => i !== index))
  }

  // Update volume
  const updateVolume = (index: number, updates: Partial<VolumeConfig>) => {
    setVolumes((prev) => prev.map((v, i) => (i === index ? { ...v, ...updates } : v)))
  }

  // Import the service
  const handleImport = async () => {
    setLoading(true)
    setError(null)

    try {
      if (sourceType === 'dockerhub' || dockerHubInfo) {
        // Docker Hub import
        const response = await githubImportApi.registerDockerHub({
          service_name: serviceName,
          dockerhub_url: importUrl,
          tag: selectedTag,
          display_name: displayName,
          description,
          ports,
          volumes,
          env_vars: envVars,
          shadow_header_enabled: shadowHeader.enabled,
          shadow_header_name: shadowHeader.header_name,
          shadow_header_value: shadowHeader.header_value || serviceName,
          route_path: shadowHeader.route_path || `/${serviceName}`,
          capabilities: capabilities.length > 0 ? capabilities : undefined,
        })

        const data = response.data
        if (!data.success) {
          setError(data.message || 'Failed to import service')
          return
        }
      } else {
        // GitHub import - supports multiple services
        if (!selectedComposeFile || selectedServices.length === 0) {
          setError('Please select a compose file and at least one service')
          return
        }

        const errors: string[] = []
        let successCount = 0

        // Import each selected service
        for (const service of selectedServices) {
          try {
            const svcName = service.name
            const svcDisplayName = svcName.charAt(0).toUpperCase() + svcName.slice(1).replace(/-/g, ' ')

            const response = await githubImportApi.register({
              github_url: importUrl,
              compose_path: selectedComposeFile.path,
              service_name: svcName,
              config: {
                service_name: svcName,
                display_name: svcDisplayName,
                description: description || `Imported from GitHub`,
                source_url: importUrl,
                compose_path: selectedComposeFile.path,
                shadow_header: {
                  ...shadowHeader,
                  header_value: svcName,
                  route_path: `/${svcName}`,
                },
                env_vars: envVars,
                enabled: true,
                capabilities: capabilities.length > 0 ? capabilities : undefined,
              },
            })

            const data = response.data
            if (data.success) {
              successCount++
            } else {
              errors.push(`${svcName}: ${data.message || 'Failed'}`)
            }
          } catch (err: any) {
            errors.push(`${service.name}: ${extractErrorMessage(err, 'Failed')}`)
          }
        }

        // Check results
        if (successCount === 0) {
          setError(`Failed to import services: ${errors.join('; ')}`)
          return
        }

        if (errors.length > 0) {
          // Partial success
          setError(`Imported ${successCount} service(s), but some failed: ${errors.join('; ')}`)
        }

        // Proceed to complete (even with partial success)
      }

      setStep('complete')
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to import service'))
    } finally {
      setLoading(false)
    }
  }

  // Handle completion
  const handleComplete = () => {
    onServiceImported()
    onClose()
  }

  if (!isOpen) return null

  const getSteps = (): { key: WizardStep; label: string }[] => {
    if (sourceType === 'dockerhub' || dockerHubInfo) {
      return [
        { key: 'url', label: 'Source' },
        { key: 'config', label: 'Configure' },
        { key: 'complete', label: 'Done' },
      ]
    }
    return [
      { key: 'url', label: 'Source' },
      { key: 'compose', label: 'Compose' },
      { key: 'service', label: 'Service' },
      { key: 'config', label: 'Configure' },
      { key: 'complete', label: 'Done' },
    ]
  }

  const renderStepIndicator = () => {
    const steps = getSteps()
    const currentIndex = steps.findIndex((s) => s.key === step)

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, index) => (
          <div key={s.key} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                index < currentIndex
                  ? 'bg-green-500 text-white'
                  : index === currentIndex
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              }`}
            >
              {index < currentIndex ? <Check className="w-4 h-4" /> : index + 1}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-8 h-0.5 ${
                  index < currentIndex
                    ? 'bg-green-500'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  const renderUrlStep = () => (
    <div className="space-y-4">
      {/* Source Type Selector */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSourceType('github')}
          className={`flex-1 p-3 rounded-lg border-2 flex items-center justify-center gap-2 transition-all ${
            sourceType === 'github'
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
          }`}
        >
          <Github className="w-5 h-5" />
          <span className="font-medium">GitHub</span>
        </button>
        <button
          onClick={() => setSourceType('dockerhub')}
          className={`flex-1 p-3 rounded-lg border-2 flex items-center justify-center gap-2 transition-all ${
            sourceType === 'dockerhub'
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
          }`}
        >
          <Box className="w-5 h-5" />
          <span className="font-medium">Docker Hub</span>
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {sourceType === 'github' ? 'GitHub Repository URL' : 'Docker Hub Image'}
        </label>
        <input
          type="text"
          value={importUrl}
          onChange={(e) => setImportUrl(e.target.value)}
          placeholder={
            sourceType === 'github'
              ? 'https://github.com/owner/repo'
              : 'https://hub.docker.com/r/namespace/repo or namespace/repo'
          }
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {sourceType === 'github'
            ? 'Supports repository URLs, specific branches, or direct paths to compose files'
            : 'Supports Docker Hub URLs or direct image references (e.g., fishaudio/fish-speech)'}
        </p>
      </div>

      {sourceType === 'github' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Branch (optional)
          </label>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      )}
    </div>
  )

  const renderComposeStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Found {composeFiles.length} docker-compose file(s). Select one to continue:
      </p>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {composeFiles.map((file) => (
          <button
            key={file.path}
            onClick={() => handleSelectComposeFile(file)}
            className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
              selectedComposeFile?.path === file.path
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
            }`}
          >
            <FileCode className="w-5 h-5 text-primary-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-white truncate">
                {file.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {file.path}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  )

  const renderServiceStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Found {services.length} service(s). Select the services to import:
        </p>
        <button
          onClick={handleSelectAllServices}
          className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          {selectedServices.length === services.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {services.map((service) => {
          const isSelected = selectedServices.some((s) => s.name === service.name)
          return (
            <button
              key={service.name}
              onClick={() => handleToggleService(service)}
              className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                isSelected
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isSelected
                    ? 'bg-primary-500 border-primary-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {service.name}
                  </p>
                  {service.image && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      Image: {service.image}
                    </p>
                  )}
                  {service.ports.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Ports: {service.ports.map((p) => p.container).join(', ')}
                    </p>
                  )}
                  {service.environment.filter((e) => e.is_required).length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 mt-2">
                      {service.environment.filter((e) => e.is_required).length} required env vars
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {selectedServices.length > 0 && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {selectedServices.length} service(s) selected
          </p>
          <button
            onClick={handleProceedToConfig}
            className="w-full py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2"
          >
            Continue to Configuration
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )

  const renderConfigStep = () => (
    <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2">
      {/* Docker Hub Tag Selection */}
      {dockerHubInfo && availableTags.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Box className="w-4 h-4" />
            Image Tag
          </h4>
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      )}

      {/* Basic Info */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Basic Information
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Service Name
            </label>
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          />
        </div>
      </div>

      {/* Capabilities */}
      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Server className="w-4 h-4" />
          Capabilities Provided
        </h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select the capabilities this service provides (optional)
        </p>
        <div className="flex flex-wrap gap-2">
          {CAPABILITY_OPTIONS.map((cap) => (
            <button
              key={cap.id}
              onClick={() => {
                if (capabilities.includes(cap.id)) {
                  setCapabilities(capabilities.filter((c) => c !== cap.id))
                } else {
                  setCapabilities([...capabilities, cap.id])
                }
              }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                capabilities.includes(cap.id)
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-2 border-primary-500'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              title={cap.description}
            >
              {cap.label}
            </button>
          ))}
        </div>
        {capabilities.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Selected: {capabilities.join(', ')}
          </p>
        )}
      </div>

      {/* Ports (Docker Hub) */}
      {dockerHubInfo && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900 dark:text-white">Port Mappings</h4>
            <button
              onClick={addPort}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add Port
            </button>
          </div>
          {ports.map((port, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="number"
                value={port.host_port}
                onChange={(e) => updatePort(index, { host_port: parseInt(e.target.value) || 0 })}
                placeholder="Host"
                className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <span className="text-gray-500">:</span>
              <input
                type="number"
                value={port.container_port}
                onChange={(e) => updatePort(index, { container_port: parseInt(e.target.value) || 0 })}
                placeholder="Container"
                className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <button
                onClick={() => removePort(index)}
                className="p-1 text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Volumes (Docker Hub) */}
      {dockerHubInfo && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900 dark:text-white">Volumes</h4>
            <button
              onClick={addVolume}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add Volume
            </button>
          </div>
          {volumes.map((vol, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={vol.name}
                onChange={(e) => updateVolume(index, { name: e.target.value })}
                placeholder="Volume name"
                className="w-32 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <span className="text-gray-500">:</span>
              <input
                type="text"
                value={vol.container_path}
                onChange={(e) => updateVolume(index, { container_path: e.target.value })}
                placeholder="/path/in/container"
                className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <button
                onClick={() => removeVolume(index)}
                className="p-1 text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Shadow Header Configuration */}
      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Shadow Header Configuration
        </h4>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="shadow-enabled"
            checked={shadowHeader.enabled}
            onChange={(e) =>
              setShadowHeader({ ...shadowHeader, enabled: e.target.checked })
            }
            className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
          />
          <label htmlFor="shadow-enabled" className="text-sm text-gray-700 dark:text-gray-300">
            Enable shadow header routing
          </label>
        </div>
        {shadowHeader.enabled && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Header Name
              </label>
              <input
                type="text"
                value={shadowHeader.header_name}
                onChange={(e) =>
                  setShadowHeader({ ...shadowHeader, header_name: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Header Value
              </label>
              <input
                type="text"
                value={shadowHeader.header_value || ''}
                onChange={(e) =>
                  setShadowHeader({ ...shadowHeader, header_value: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Route Path (for Tailscale Serve)
              </label>
              <input
                type="text"
                value={shadowHeader.route_path || ''}
                onChange={(e) =>
                  setShadowHeader({ ...shadowHeader, route_path: e.target.value })
                }
                placeholder="/myservice"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Environment Variables */}
      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Key className="w-4 h-4" />
            Environment Variables ({envVars.length})
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEnvPaste(!showEnvPaste)}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
            >
              <FileCode className="w-4 h-4" /> Paste Template
            </button>
            <button
              onClick={addEnvVar}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add Variable
            </button>
          </div>
        </div>

        {/* Env Template Paste Area */}
        {showEnvPaste && (
          <div className="p-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Paste environment variables (KEY=value format, one per line):
            </p>
            <textarea
              value={envPasteText}
              onChange={(e) => setEnvPasteText(e.target.value)}
              placeholder={`# Example:\nAPI_KEY=your-key-here\nDATABASE_URL=postgres://...\nDEBUG=true`}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => {
                  setEnvPasteText('')
                  setShowEnvPaste(false)
                }}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={parseEnvTemplate}
                disabled={!envPasteText.trim()}
                className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Add Variables
              </button>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {envVars.map((env, index) => {
            // Find original env across all selected services
            const originalEnv = selectedServices
              .flatMap((s) => s.environment)
              .find((e) => e.name === env.name)
            return (
              <div
                key={index}
                className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-center justify-between mb-2">
                  {dockerHubInfo ? (
                    <input
                      type="text"
                      value={env.name}
                      onChange={(e) => updateEnvVar(index, { name: e.target.value.toUpperCase() })}
                      placeholder="VAR_NAME"
                      className="font-mono text-sm text-gray-900 dark:text-white bg-transparent border-none p-0 focus:ring-0"
                    />
                  ) : (
                    <span className="font-mono text-sm text-gray-900 dark:text-white">
                      {env.name}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    {originalEnv?.is_required && (
                      <span className="text-xs text-red-500">Required</span>
                    )}
                    {env.is_secret && (
                      <span className="text-xs text-amber-500">Secret</span>
                    )}
                    {dockerHubInfo && (
                      <button
                        onClick={() => removeEnvVar(index)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={env.source}
                    onChange={(e) =>
                      updateEnvVar(index, {
                        source: e.target.value as 'literal' | 'setting' | 'default',
                      })
                    }
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="literal">Set Value</option>
                    <option value="default">Use Default</option>
                    <option value="setting">From Settings</option>
                  </select>
                  {env.source === 'literal' && (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type={env.is_secret && !showSecrets[env.name] ? 'password' : 'text'}
                        value={env.value || ''}
                        onChange={(e) => updateEnvVar(index, { value: e.target.value })}
                        placeholder={originalEnv?.default_value || 'Enter value'}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      {env.is_secret && (
                        <button
                          onClick={() =>
                            setShowSecrets((prev) => ({
                              ...prev,
                              [env.name]: !prev[env.name],
                            }))
                          }
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          {showSecrets[env.name] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                  {env.source === 'default' && originalEnv?.default_value && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Default: {originalEnv.default_value}
                    </span>
                  )}
                  {env.source === 'setting' && (
                    <input
                      type="text"
                      value={env.setting_path || ''}
                      onChange={(e) => updateEnvVar(index, { setting_path: e.target.value })}
                      placeholder="api_keys.my_key"
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  const renderCompleteStep = () => (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
        <Check className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Service Imported Successfully
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        The service "{displayName || serviceName}" has been imported and is ready to use.
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-500">
        You can now start the service from the Services page.
      </p>
    </div>
  )

  const renderCurrentStep = () => {
    switch (step) {
      case 'url':
        return renderUrlStep()
      case 'compose':
        return renderComposeStep()
      case 'service':
        return renderServiceStep()
      case 'config':
        return renderConfigStep()
      case 'complete':
        return renderCompleteStep()
      default:
        return null
    }
  }

  const canGoBack = step !== 'url' && step !== 'complete'
  const canGoNext = step !== 'complete'

  const handleBack = () => {
    if (dockerHubInfo) {
      // Docker Hub flow
      if (step === 'config') {
        setDockerHubInfo(null)
        setStep('url')
      }
    } else {
      // GitHub flow
      switch (step) {
        case 'compose':
          setStep('url')
          break
        case 'service':
          setStep('compose')
          break
        case 'config':
          setStep('service')
          break
      }
    }
  }

  const handleNext = () => {
    switch (step) {
      case 'url':
        handleScan()
        break
      case 'config':
        handleImport()
        break
    }
  }

  const getNextButtonLabel = () => {
    switch (step) {
      case 'url':
        return 'Scan'
      case 'config':
        return 'Import Service'
      default:
        return 'Next'
    }
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            {sourceType === 'github' && !dockerHubInfo ? (
              <Github className="w-6 h-6 text-primary-600" />
            ) : (
              <Box className="w-6 h-6 text-primary-600" />
            )}
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Import Docker Service
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4">
          {renderStepIndicator()}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          {renderCurrentStep()}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <div>
            {canGoBack && (
              <button
                onClick={handleBack}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              {step === 'complete' ? 'Close' : 'Cancel'}
            </button>
            {canGoNext && step !== 'compose' && step !== 'service' && (
              <button
                onClick={step === 'complete' ? handleComplete : handleNext}
                disabled={loading || (step === 'url' && !importUrl.trim())}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : step === 'complete' ? (
                  <>
                    <Check className="w-4 h-4" />
                    Done
                  </>
                ) : (
                  <>
                    {getNextButtonLabel()}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  // Render to body using portal for proper positioning
  return createPortal(modalContent, document.body)
}
