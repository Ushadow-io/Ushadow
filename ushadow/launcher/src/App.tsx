import { useState, useEffect, useCallback, useRef } from 'react'
import { tauri, type Prerequisites, type Discovery, type UshadowEnvironment, type PlatformPrerequisitesConfig, type EnvironmentConflict } from './hooks/useTauri'
import { useAppStore, type BranchType } from './store/appStore'
import { useWindowFocus } from './hooks/useWindowFocus'
import { useTmuxMonitoring } from './hooks/useTmuxMonitoring'
import { DevToolsPanel } from './components/DevToolsPanel'
import { PrerequisitesPanel } from './components/PrerequisitesPanel'
import { InfrastructurePanel } from './components/InfrastructurePanel'
import { InfraConfigPanel } from './components/InfraConfigPanel'
import { EnvironmentsPanel } from './components/EnvironmentsPanel'
import { LogPanel, type LogEntry, type LogLevel } from './components/LogPanel'
import { ProjectSetupDialog } from './components/ProjectSetupDialog'
import { NewEnvironmentDialog } from './components/NewEnvironmentDialog'
import { EnvironmentConflictDialog } from './components/EnvironmentConflictDialog'
import { TmuxManagerDialog } from './components/TmuxManagerDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { EmbeddedView } from './components/EmbeddedView'
import { ProjectManager } from './components/ProjectManager'
import { AuthButton } from './components/AuthButton'
import { RefreshCw, Settings, Zap, Loader2, FolderOpen, Pencil, Terminal, Sliders, Package, FolderGit2, Trello, Bot } from 'lucide-react'
import { getColors } from './utils/colors'
import { KanbanBoard } from './components/KanbanBoard'
import { ClaudeSessionsPanel } from './components/ClaudeSessionsPanel'
import { LauncherNotch } from './components/LauncherNotch'
import { useClaudeSessions } from './hooks/useClaudeSessions'

function App() {
  // Store
  const {
    dryRunMode,
    showDevTools,
    setShowDevTools,
    logExpanded,
    setLogExpanded,
    appMode,
    setAppMode,
    spoofedPrereqs,
    setSpoofedPrereq,
    projectRoot,
    setProjectRoot,
    worktreesDir,
    setWorktreesDir,
    multiProjectMode,
    kanbanEnabled,
    claudeEnabled,
    projects,
    activeProjectId,
  } = useAppStore()

  // Get active project in multi-project mode, or use legacy projectRoot
  const activeProject = multiProjectMode && activeProjectId
    ? projects.find(p => p.id === activeProjectId)
    : null
  const effectiveProjectRoot = activeProject?.rootPath || projectRoot
  const effectiveWorktreesDir = activeProject?.worktreesPath || worktreesDir

  // State
  const [platform, setPlatform] = useState<string>('')
  const [prerequisites, setPrerequisites] = useState<Prerequisites | null>(null)
  const [prerequisitesConfig, setPrerequisitesConfig] = useState<PlatformPrerequisitesConfig | null>(null)
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isInstalling, setIsInstalling] = useState(false)
  const [installingItem, setInstallingItem] = useState<string | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const [loadingInfra, setLoadingInfra] = useState(false)
  const [loadingEnv, setLoadingEnv] = useState<{ name: string; action: 'starting' | 'stopping' | 'deleting' | 'merging' } | null>(null)
  const [showProjectDialog, setShowProjectDialog] = useState(false)
  const [showNewEnvDialog, setShowNewEnvDialog] = useState(false)
  const [showTmuxManager, setShowTmuxManager] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [embeddedView, setEmbeddedView] = useState<{ url: string; envName: string; envColor: string; envPath: string | null; backendPort: number | null } | null>(null)
  const [creatingEnvs, setCreatingEnvs] = useState<{ name: string; status: 'cloning' | 'starting' | 'error'; path?: string; error?: string }[]>([])
  const [shouldAutoLaunch, setShouldAutoLaunch] = useState(false)
  const [leftColumnWidth, setLeftColumnWidth] = useState(350) // pixels
  const [isResizing, setIsResizing] = useState(false)
  const [environmentConflict, setEnvironmentConflict] = useState<EnvironmentConflict | null>(null)
  const [pendingEnvCreation, setPendingEnvCreation] = useState<{ name: string; branch: string; baseBranch?: string } | null>(null)
  const [selectedEnvironment, setSelectedEnvironment] = useState<UshadowEnvironment | null>(null)

  // Auto-select environment matching current directory's ENV_NAME, or first running
  useEffect(() => {
    if (!selectedEnvironment && discovery?.environments) {
      // Try to find environment matching the current project root
      const currentEnv = discovery.environments.find(e =>
        e.running && e.path === projectRoot
      )
      // Fallback to first running environment
      const envToSelect = currentEnv || discovery.environments.find(e => e.running)
      if (envToSelect) {
        console.log('[App] Auto-selecting environment:', {
          name: envToSelect.name,
          backend_port: envToSelect.backend_port,
          path: envToSelect.path,
          projectRoot,
          matched: !!currentEnv
        })
        setSelectedEnvironment(envToSelect)
      }
    }
  }, [discovery?.environments, selectedEnvironment, projectRoot])

  // Debug: expose selectedEnvironment to console
  useEffect(() => {
    if (selectedEnvironment) {
      (window as any).selectedEnv = selectedEnvironment
      console.log('[App] Selected environment updated:', {
        name: selectedEnvironment.name,
        backend_port: selectedEnvironment.backend_port
      })
    }
  }, [selectedEnvironment])

  // Window focus detection for smart polling
  const isWindowFocused = useWindowFocus()

  // Tmux monitoring for agent status (only when window is focused and worktrees exist)
  const environmentNames = discovery?.environments.map(e => e.name) ?? []
  const tmuxStatuses = useTmuxMonitoring(environmentNames, isWindowFocused && environmentNames.length > 0)

  // Claude Code session monitoring (only polls when feature flag is enabled)
  const environments = discovery?.environments ?? []
  const { sessions: claudeSessions, hooksInstalled, installing: installingHooks, error: hooksError, installSuccess: hooksInstallSuccess, installHooks } =
    useClaudeSessions(effectiveProjectRoot, environments, claudeEnabled)

  // Infrastructure service selection
  const [selectedInfraServices, setSelectedInfraServices] = useState<string[]>([])

  // Auto-select running infrastructure services
  useEffect(() => {
    if (discovery?.infrastructure) {
      const runningServiceIds = discovery.infrastructure
        .filter(service => service.running)
        .map(service => service.name)

      // Only update if the running services have changed
      setSelectedInfraServices(prev => {
        const prevSet = new Set(prev)
        const newSet = new Set(runningServiceIds)

        // Check if sets are different
        if (prevSet.size !== newSet.size) return runningServiceIds
        for (const id of runningServiceIds) {
          if (!prevSet.has(id)) return runningServiceIds
        }

        return prev // No change needed
      })
    }
  }, [discovery?.infrastructure])

  const handleToggleInfraService = (serviceId: string) => {
    setSelectedInfraServices(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    )
  }

  const logIdRef = useRef(0)
  const lastStateRef = useRef<string>('')

  // Logging functions
  const log = useCallback((message: string, level: LogLevel = 'info', detailed = false) => {
    setLogs(prev => [...prev, {
      id: logIdRef.current++,
      timestamp: new Date(),
      message,
      level,
      detailed,
    }])
  }, [])

  // Log only on state change (prevents polling noise)
  const logStateChange = useCallback((stateKey: string, message: string, level: LogLevel = 'info') => {
    if (lastStateRef.current !== stateKey) {
      lastStateRef.current = stateKey
      log(message, level)
    }
  }, [log])

  const clearLogs = useCallback(() => {
    setLogs([])
    lastStateRef.current = ''
  }, [])

  // Handle column resize
  const handleMouseDown = useCallback(() => {
    setIsResizing(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX - 16 // Account for padding
      if (newWidth >= 250 && newWidth <= 600) {
        setLeftColumnWidth(newWidth)
      }
    }
  }, [isResizing])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  // Enable native clipboard operations (undo/redo/copy/paste/cut/select-all)
  // Tauri webview supports standard browser clipboard API
  // All native keyboard shortcuts work by default: Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z (redo), Cmd/Ctrl+A (select all), etc.

  // Token sharing API: Listen for token requests from environment iframes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: Only respond to messages from embedded environments
      // TODO: Add origin validation if needed

      if (event.data.type === 'GET_KC_TOKEN') {
        // Get tokens from localStorage
        const token = localStorage.getItem('kc_access_token')
        const refreshToken = localStorage.getItem('kc_refresh_token')
        const idToken = localStorage.getItem('kc_id_token')

        // Send tokens back to requesting iframe
        event.source?.postMessage(
          {
            type: 'KC_TOKEN_RESPONSE',
            tokens: { token, refreshToken, idToken },
          },
          '*' // TODO: Restrict to specific origins in production
        )
      }

      if (event.data.type === 'REFRESH_KC_TOKEN') {
        // TODO: Implement token refresh logic
        // For now, just return current tokens
        const token = localStorage.getItem('kc_access_token')
        const refreshToken = localStorage.getItem('kc_refresh_token')
        const idToken = localStorage.getItem('kc_id_token')

        event.source?.postMessage(
          {
            type: 'KC_TOKEN_REFRESHED',
            tokens: { token, refreshToken, idToken },
          },
          '*'
        )
      }
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  // Apply spoofed values to prerequisites
  const getEffectivePrereqs = useCallback((real: Prerequisites | null): Prerequisites | null => {
    if (!real) return null
    return {
      homebrew_installed: spoofedPrereqs.homebrew_installed ?? real.homebrew_installed,
      git_installed: spoofedPrereqs.git_installed ?? real.git_installed,
      docker_installed: spoofedPrereqs.docker_installed ?? real.docker_installed,
      docker_running: spoofedPrereqs.docker_running ?? real.docker_running,
      tailscale_installed: spoofedPrereqs.tailscale_installed ?? real.tailscale_installed,
      tailscale_connected: real.tailscale_connected,
      python_installed: spoofedPrereqs.python_installed ?? real.python_installed,
      uv_installed: real.uv_installed,
      workmux_installed: real.workmux_installed,
      tmux_installed: real.tmux_installed,
      homebrew_version: real.homebrew_version,
      docker_version: real.docker_version,
      tailscale_version: real.tailscale_version,
      git_version: real.git_version,
      python_version: real.python_version,
      uv_version: real.uv_version,
      workmux_version: real.workmux_version,
      tmux_version: real.tmux_version,
    }
  }, [spoofedPrereqs])

  // Refresh functions
  const refreshPrerequisites = useCallback(async (silent = false) => {
    try {
      const prereqs = await tauri.checkPrerequisites()
      setPrerequisites(prereqs)

      if (!silent) {
        // Log actual command results
        log(`$ brew --version → ${prereqs.homebrew_version || 'not found'}`)
        log(`$ docker --version → ${prereqs.docker_version || 'not found'}`)
        log(`$ docker info → ${prereqs.docker_running ? 'running' : 'not running'}`)
        log(`$ git --version → ${prereqs.git_version || 'not found'}`)
        log(`$ python3 --version → ${prereqs.python_version || 'not found'}`)
        log(`$ tailscale --version → ${prereqs.tailscale_version || 'not found'}`)
      }

      return prereqs
    } catch (err) {
      log(`Failed to check prerequisites: ${err}`, 'error')
      return null
    }
  }, [log])

  const refreshDiscovery = useCallback(async (silent = false) => {
    try {
      const disc = await tauri.discoverEnvironments()
      setDiscovery(disc)

      // Remove creating environments that are now in discovery
      // This merges the "creating" card with the actual discovered environment
      setCreatingEnvs(prev => {
        return prev.filter(creatingEnv => {
          // Keep environments that haven't been discovered yet
          const foundInDiscovery = disc.environments.some(e => e.name === creatingEnv.name)
          return !foundInDiscovery
        })
      })

      // Auto-start tmux if worktrees exist but tmux isn't running
      const worktrees = disc.environments.filter(e => e.is_worktree)
      if (worktrees.length > 0) {
        try {
          await tauri.ensureTmuxRunning()
        } catch (err) {
          // Non-critical, just log it
          if (!silent) {
            console.log('Could not ensure tmux is running:', err)
          }
        }
      }

      if (!silent) {
        const runningCount = disc.infrastructure.filter(s => s.running).length
        const envCount = disc.environments.length
        logStateChange(
          `disc-${runningCount}-${envCount}`,
          `Found ${envCount} environment(s), ${runningCount} service(s) running`
        )
      }
      return disc
    } catch (err) {
      log(`Failed to discover: ${err}`, 'error')
      return null
    }
  }, [log, logStateChange])

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        log('Initializing...', 'step')

        const os = await tauri.getOsType()
        setPlatform(os)
        log(`Platform: ${os}`)

        // Load prerequisites configuration for this platform
        const config = await tauri.getPlatformPrerequisitesConfig(os)
        setPrerequisitesConfig(config)

        const defaultDir = await tauri.getDefaultProjectDir()

        // Track if this is first time setup (showing project dialog)
        let isFirstTimeSetup = false

        // Show project setup dialog on first launch if no project root is configured
        if (!projectRoot) {
          setProjectRoot(defaultDir)
          setShowProjectDialog(true)
          isFirstTimeSetup = true
          log('Please configure your repository location', 'step')
        } else {
          // Sync existing project root to Rust backend
          await tauri.setProjectRoot(projectRoot)
        }

        // Check prerequisites immediately (system-wide, no project needed)
        await refreshPrerequisites()

        // Only run discovery if we have a valid project root
        if (!isFirstTimeSetup) {
          await refreshDiscovery()
        }

        log('Ready', 'success')
      } catch (err) {
        console.error('[Init] Initialization error:', err)
        log(`Initialization failed: ${err}`, 'error')
      }
    }

    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-launch effect - triggers quick launch when shouldAutoLaunch is set
  useEffect(() => {
    if (shouldAutoLaunch && !isLaunching) {
      setShouldAutoLaunch(false)
      handleQuickLaunch()
    }
  }, [shouldAutoLaunch, isLaunching]) // eslint-disable-line react-hooks/exhaustive-deps

  // Smart polling with multiple safeguards
  useEffect(() => {
    // Don't poll if window is not focused (save CPU/battery)
    if (!isWindowFocused) {
      return
    }

    // CRITICAL: Don't poll if no project is configured yet
    // This prevents docker discovery from running on first launch
    if (!projectRoot) {
      return
    }

    // Set up periodic polling
    const interval = setInterval(() => {
      refreshPrerequisites(true)
      refreshDiscovery(true)
    }, 60000) // 60 seconds - reduced from 30s for better performance

    return () => clearInterval(interval)
  }, [refreshPrerequisites, refreshDiscovery, isWindowFocused, projectRoot])

  // Sync active project root to Rust backend when it changes (multi-project mode)
  useEffect(() => {
    if (effectiveProjectRoot && effectiveProjectRoot !== projectRoot) {
      tauri.setProjectRoot(effectiveProjectRoot).catch(err => {
        console.error('Failed to sync project root to backend:', err)
      })
    }
  }, [effectiveProjectRoot, projectRoot])

  // Install handlers
  const handleInstall = async (item: string) => {
    setIsInstalling(true)
    setInstallingItem(item)
    log(`Installing ${item}...`, 'step')

    try {
      if (dryRunMode) {
        // Show what would be executed
        let command = ''
        if (platform === 'macos') {
          switch (item) {
            case 'homebrew':
              command = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
              break
            case 'git':
              command = 'brew install git'
              break
            case 'python':
              command = 'brew install python3'
              break
            case 'docker':
              command = 'brew install --cask docker'
              break
            case 'tailscale':
              command = 'brew install --cask tailscale'
              break
          }
        } else if (platform === 'windows') {
          switch (item) {
            case 'git':
              command = 'winget install Git.Git'
              break
            case 'docker':
              command = 'winget install Docker.DockerDesktop'
              break
            case 'tailscale':
              command = 'winget install Tailscale.Tailscale'
              break
          }
        }

        log(`[DRY RUN] Would execute: ${command}`, 'warning')
        log(`[DRY RUN] Simulating installation (waiting 1.5s)...`, 'info')
        await new Promise(r => setTimeout(r, 1500)) // Simulate

        // Auto-spoof success so UI updates
        const spoofKey = item === 'homebrew' ? 'homebrew_installed'
          : item === 'git' ? 'git_installed'
          : item === 'docker' ? 'docker_installed'
          : item === 'python' ? 'python_installed'
          : 'tailscale_installed'
        log(`[DRY RUN] Spoofing state: ${spoofKey} = true`, 'info')
        setSpoofedPrereq(spoofKey, true)
        if (item === 'docker') {
          log(`[DRY RUN] Spoofing state: docker_running = true`, 'info')
          setSpoofedPrereq('docker_running', true)
        }
        log(`[DRY RUN] ${item} installation simulated successfully`, 'success')
      } else {
        // Use generic installer - works on all platforms via YAML config
        log(`Installing ${item}...`, 'step')
        const result = await tauri.installPrerequisite(item)
        log(result, 'success')
      }

      await refreshPrerequisites()
    } catch (err) {
      log(`Failed to install ${item}: ${err}`, 'error')
    } finally {
      setIsInstalling(false)
      setInstallingItem(null)
    }
  }

  const handleStartDocker = async () => {
    setIsInstalling(true)
    setInstallingItem('docker')
    log('Starting Docker...', 'step')

    try {
      if (dryRunMode) {
        let command = ''
        if (platform === 'macos') {
          command = 'open -a Docker'
        } else if (platform === 'windows') {
          command = 'Start-Process "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"'
        } else {
          command = 'systemctl start docker'
        }

        log(`[DRY RUN] Would execute: ${command}`, 'warning')
        log(`[DRY RUN] Simulating Docker startup (waiting 1.5s)...`, 'info')
        await new Promise(r => setTimeout(r, 1500))

        log(`[DRY RUN] Spoofing state: docker_running = true`, 'info')
        setSpoofedPrereq('docker_running', true)
        log(`[DRY RUN] Docker start simulated successfully`, 'success')
      } else {
        // Use generic start function - works on all platforms
        const result = await tauri.startPrerequisite('docker')
        log(result, 'success')
      }
      await refreshPrerequisites()
    } catch (err) {
      log(`Failed to start Docker`, 'error')
      log(String(err), 'error')
    } finally {
      setIsInstalling(false)
      setInstallingItem(null)
    }
  }

  // Infrastructure handlers
  const handleStartInfra = async () => {
    setLoadingInfra(true)
    log('Starting infrastructure...', 'step')

    try {
      if (dryRunMode) {
        log('[DRY RUN] Would start infrastructure', 'warning')
        await new Promise(r => setTimeout(r, 2000))
        log('[DRY RUN] Infrastructure start simulated', 'success')
      } else {
        const result = await tauri.startInfrastructure()
        // Log the full compose output to Detail tab only — it contains pull progress
        log(result, 'info', true)
        log('✓ Infrastructure started', 'success')
      }
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to start infrastructure`, 'error')
      // Log the detailed error output to Detail tab
      log(String(err), 'error', true)
    } finally {
      setLoadingInfra(false)
    }
  }

  const handleStopInfra = async () => {
    setLoadingInfra(true)
    log('Stopping infrastructure...', 'step')

    try {
      if (dryRunMode) {
        log('[DRY RUN] Would stop infrastructure', 'warning')
        await new Promise(r => setTimeout(r, 1000))
        log('[DRY RUN] Infrastructure stop simulated', 'success')
      } else {
        const result = await tauri.stopInfrastructure()
        log(result, 'success')
      }
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to stop infrastructure`, 'error')
      log(String(err), 'error')
    } finally {
      setLoadingInfra(false)
    }
  }

  const handleRestartInfra = async () => {
    setLoadingInfra(true)
    log('Restarting infrastructure...', 'step')

    try {
      if (dryRunMode) {
        log('[DRY RUN] Would restart infrastructure', 'warning')
        await new Promise(r => setTimeout(r, 2000))
        log('[DRY RUN] Infrastructure restart simulated', 'success')
      } else {
        const result = await tauri.restartInfrastructure()
        log(result, 'success')
      }
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to restart infrastructure`, 'error')
      log(String(err), 'error')
    } finally {
      setLoadingInfra(false)
    }
  }

  // Environment handlers
  const handleStartEnv = async (envName: string, explicitPath?: string) => {
    setLoadingEnv({ name: envName, action: 'starting' })
    log(`Starting ${envName}...`, 'step')

    // Use explicit path if provided, otherwise look up the environment
    const envPath = explicitPath || discovery?.environments.find(e => e.name === envName)?.path || undefined

    // Log the folder path if available
    if (envPath) {
      log(`Creating in: ${envPath}`, 'info')
    }

    // Always add to creating list when starting an environment to show immediate feedback
    // This ensures users see a loading card even if discovery already found stopped containers
    setCreatingEnvs(prev => {
      const alreadyExists = prev.some(e => e.name === envName)
      if (alreadyExists) {
        // Update existing entry
        return prev.map(e => e.name === envName ? { ...e, status: 'starting' as const } : e)
      }
      return [...prev, { name: envName, status: 'starting' as const }]
    })

    try {
      if (dryRunMode) {
        log(`[DRY RUN] Would start ${envName}`, 'warning')
        log(`[DRY RUN] Simulating container startup (waiting 2s)...`, 'info')
        await new Promise(r => setTimeout(r, 2000))
        log(`[DRY RUN] ${envName} start simulated successfully`, 'success')

        // In dry run mode, add a mock environment to discovery if it doesn't exist
        setDiscovery(prev => {
          // Initialize empty discovery if null
          if (!prev) {
            prev = {
              infrastructure: [],
              environments: [],
              docker_ok: true,
              tailscale_ok: false,
            }
          }

          const exists = prev.environments.find(e => e.name === envName)
          if (exists) {
            // Just mark it as running
            return {
              ...prev,
              environments: prev.environments.map(e =>
                e.name === envName ? { ...e, running: true } : e
              )
            }
          } else {
            // Create a mock environment
            const mockEnv: UshadowEnvironment = {
              name: envName,
              color: envName,
              localhost_url: `http://localhost:8000`,
              tailscale_url: null,
              backend_port: 8000,
              webui_port: 3000,
              running: true,
              status: 'Running' as const,
              tailscale_active: false,
              containers: ['backend', 'webui', 'postgres', 'redis'],
              path: projectRoot,
              branch: null,
              is_worktree: false,
              base_branch: null,
            }
            return {
              ...prev,
              environments: [...prev.environments, mockEnv]
            }
          }
        })
      } else {
        const result = await tauri.startEnvironment(envName, envPath)
        // Only log summary to activity log (full detail is in console/detail pane)
        log(`✓ Environment ${envName} started successfully`, 'success')

        // Initial refresh
        await refreshDiscovery(true)

        // Continue polling in background to show container health updates
        // Don't await this - let it run in background
        ;(async () => {
          for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 2000))
            await refreshDiscovery(true)
          }
        })()
      }
    } catch (err) {
      console.error(`DEBUG: handleStartEnv caught error:`, err)
      // Log simple error for State view
      log(`Failed to start ${envName}`, 'error')
      // Log detailed error for Detail view
      log(String(err), 'error')
      // Update creating env to error state
      setCreatingEnvs(prev => prev.map(e => e.name === envName ? { ...e, status: 'error', error: String(err) } : e))
    } finally {
      setLoadingEnv(null)
      // Keep showing "starting" status longer while containers are coming up
      // Remove after containers should be healthy (polling runs for ~12s)
      setTimeout(() => {
        setCreatingEnvs(prev => prev.filter(e => e.name !== envName))
      }, 15000) // 15 seconds to allow containers to fully start
    }
  }

  const handleStopEnv = async (envName: string) => {
    setLoadingEnv({ name: envName, action: 'stopping' })
    log(`Stopping ${envName}...`, 'step')

    try {
      if (dryRunMode) {
        log(`[DRY RUN] Would stop ${envName}`, 'warning')
        log(`[DRY RUN] Simulating container shutdown (waiting 1s)...`, 'info')
        await new Promise(r => setTimeout(r, 1000))
        log(`[DRY RUN] ${envName} stop simulated successfully`, 'success')

        // In dry run mode, mark environment as not running
        setDiscovery(prev => {
          if (!prev) return prev
          return {
            ...prev,
            environments: prev.environments.map(e =>
              e.name === envName ? { ...e, running: false } : e
            )
          }
        })
      } else {
        const result = await tauri.stopEnvironment(envName)
        log(result, 'success')
        await refreshDiscovery()
      }
    } catch (err) {
      log(`Failed to stop ${envName}`, 'error')
      log(String(err), 'error')
    } finally {
      setLoadingEnv(null)
    }
  }

  const handleOpenInApp = (env: { name: string; color?: string; localhost_url: string | null; tailscale_url?: string | null; webui_port: number | null; backend_port: number | null; path: string | null }) => {
    // Prefer Tailscale URL if available, otherwise use localhost
    const url = env.tailscale_url || env.localhost_url || `http://localhost:${env.webui_port || env.backend_port}`
    const colors = getColors(env.color || env.name)
    log(`Opening ${env.name} in embedded view...`, 'info')
    setEmbeddedView({ url, envName: env.name, envColor: colors.primary, envPath: env.path, backendPort: env.backend_port })
  }

  const handleMerge = async (envName: string) => {
    // Confirm with user before merging
    const confirmed = window.confirm(
      `Merge worktree "${envName}" to main?\n\n` +
      `This will:\n` +
      `• Rebase your branch onto main\n` +
      `• Merge to main\n` +
      `• Stop and remove the environment\n` +
      `• Delete the worktree and close the tmux window\n\n` +
      `Make sure all your changes are committed!`
    )

    if (!confirmed) return

    setLoadingEnv({ name: envName, action: 'merging' })
    log(`Merging worktree "${envName}" to main...`, 'step')

    try {
      // First stop the environment if running
      const env = discovery?.environments.find(e => e.name === envName)
      if (env?.running) {
        log(`Stopping environment before merge...`, 'info')
        await tauri.stopEnvironment(envName)
      }

      // Merge with workmux
      const result = await tauri.mergeWorktreeWithRebase(
        projectRoot,
        envName,
        true,  // use rebase
        false  // don't keep worktree
      )

      log(result, 'success')
      log(`✓ Worktree "${envName}" merged and cleaned up`, 'success')

      // Refresh discovery to update environment list
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to merge worktree: ${err}`, 'error')
    } finally {
      setLoadingEnv(null)
    }
  }

  const handleDelete = async (envName: string) => {
    // Find the environment to check if it's a worktree
    const env = discovery?.environments.find(e => e.name === envName)
    const isWorktree = env?.is_worktree || false

    // Prevent deleting the root ushadow environment (main repo)
    if (envName === 'ushadow' && !isWorktree) {
      log('Cannot delete the root ushadow environment. Stop containers instead.', 'warning')
      window.alert('The main "ushadow" environment is your root repository and cannot be deleted.\n\nYou can stop its containers if needed.')
      return
    }

    // Confirm with user before deleting
    const message = isWorktree
      ? `Delete environment "${envName}"?\n\n` +
        `This will:\n` +
        `• Stop all containers\n` +
        `• Remove the worktree (including any uncommitted changes)\n` +
        `• Close the tmux session\n\n` +
        `⚠️  This action cannot be undone!`
      : `Delete environment "${envName}"?\n\n` +
        `This will:\n` +
        `• Stop all containers\n` +
        `• Close the tmux session\n\n` +
        `⚠️  This action cannot be undone!`

    const confirmed = window.confirm(message)

    if (!confirmed) return

    setLoadingEnv({ name: envName, action: 'deleting' })
    log(`Deleting environment "${envName}"...`, 'step')

    try {
      const result = await tauri.deleteEnvironment(effectiveProjectRoot, envName)
      log(result, 'success')
      log(`✓ Environment "${envName}" deleted`, 'success')

      // Refresh discovery to update environment list
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to delete environment: ${err}`, 'error')
    } finally {
      setLoadingEnv(null)
    }
  }

  const handleAttachTmux = async (env: UshadowEnvironment) => {
    if (!env.path) {
      log('Cannot attach tmux: environment has no path', 'error')
      return
    }

    log(`Opening VS Code with embedded tmux terminal for "${env.name}"...`, 'step')

    try {
      await tauri.openInVscodeWithTmux(env.path, env.name)
      log(`✓ VS Code opened with tmux in integrated terminal`, 'success')

      // Refresh to update tmux status
      await refreshDiscovery(true)
    } catch (err) {
      log(`Failed to open VS Code with tmux: ${err}`, 'error')
    }
  }

  // New environment handlers
  const handleNewEnvClone = async (name: string, serverMode: 'dev' | 'prod') => {
    setShowNewEnvDialog(false)

    // Force lowercase to avoid Docker Compose naming issues
    name = name.toLowerCase()

    const envPath = `${effectiveProjectRoot}/../${name}` // Expected clone location
    const modeLabel = serverMode === 'dev' ? 'hot reload' : 'production'

    // Check port availability in dev mode (non-quick launch)
    try {
      const [backendOk, webuiOk, suggestedOffset] = await tauri.checkPorts()
      if (!backendOk || !webuiOk) {
        const backendPort = 8000 + suggestedOffset
        const webuiPort = 3000 + suggestedOffset
        const proceed = window.confirm(
          `Default ports are in use:\n` +
          `• Backend (8000): ${backendOk ? 'available' : 'in use'}\n` +
          `• WebUI (3000): ${webuiOk ? 'available' : 'in use'}\n\n` +
          `Use alternate ports instead?\n` +
          `• Backend: ${backendPort}\n` +
          `• WebUI: ${webuiPort}`
        )
        if (!proceed) {
          log('Environment creation cancelled - ports in use', 'warning')
          return
        }
        log(`Using alternate ports: backend=${backendPort}, webui=${webuiPort}`)
      }
    } catch (err) {
      log(`Warning: Could not check ports: ${err}`, 'warning')
    }

    // Add to creating environments list
    setCreatingEnvs(prev => [...prev, { name, status: 'cloning', path: envPath }])
    log(`Creating environment "${name}" (${modeLabel} mode)...`, 'step')

    try {
      if (dryRunMode) {
        log(`[DRY RUN] Would clone new environment: ${name} (${modeLabel})`, 'warning')
        setCreatingEnvs(prev => prev.map(e => e.name === name ? { ...e, status: 'starting' } : e))
        await new Promise(r => setTimeout(r, 2000))
        log(`[DRY RUN] Environment "${name}" created`, 'success')
      } else {
        setCreatingEnvs(prev => prev.map(e => e.name === name ? { ...e, status: 'starting' } : e))
        const result = await tauri.createEnvironment(name, serverMode)
        log(result, 'success')
      }
      // Remove from creating list after success
      setCreatingEnvs(prev => prev.filter(e => e.name !== name))
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to create environment`, 'error')
      log(String(err), 'error')
      setCreatingEnvs(prev => prev.map(e => e.name === name ? { ...e, status: 'error', error: String(err) } : e))
    }
  }

  const handleCreateWorktree = async (name: string, branch: string) => {
    // Force lowercase to avoid Docker Compose naming issues
    name = name.toLowerCase()
    branch = branch.toLowerCase()

    if (!effectiveWorktreesDir) {
      log('Worktrees directory not configured', 'error')
      throw new Error('Worktrees directory not configured')
    }

    log(`Creating worktree "${name}" from branch "${branch}"...`, 'step')
    log(`Project root: ${effectiveProjectRoot}`, 'info')
    log(`Worktrees dir: ${effectiveWorktreesDir}`, 'info')
    log(`Base branch: ${baseBranch || 'auto-detect from suffix'}`, 'info')

    try {
      const worktree = await tauri.createWorktreeWithWorkmux(effectiveProjectRoot, name, branch, baseBranch, true, undefined)
      log(`✓ Worktree created successfully`, 'success')
      log(`Path: ${worktree.path}`, 'info')
      log(`Branch: ${worktree.branch}`, 'info')
      return worktree
    } catch (err) {
      log(`Failed to create worktree: ${err}`, 'error')
      throw err
    }
  }

  const handleNewEnvLink = async (name: string, path: string) => {
    setShowNewEnvDialog(false)
    log(`Linking environment "${name}" to ${path}...`, 'step')

    try {
      // TODO: Implement link environment in Rust backend
      if (dryRunMode) {
        log(`[DRY RUN] Would link "${name}" to ${path}`, 'warning')
        await new Promise(r => setTimeout(r, 1000))
        log(`[DRY RUN] Environment "${name}" linked`, 'success')
      } else {
        log(`Link functionality not yet implemented`, 'warning')
      }
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to link environment`, 'error')
      log(String(err), 'error')
    }
  }

  const handleNewEnvWorktree = async (name: string, branch: string, baseBranch?: string) => {
    setShowNewEnvDialog(false)

    // Force lowercase to avoid Docker Compose naming issues
    name = name.toLowerCase()
    branch = branch.toLowerCase()
    baseBranch = baseBranch?.toLowerCase()

    if (!effectiveWorktreesDir) {
      log('Worktrees directory not configured', 'error')
      return
    }

    // Check for conflicts first
    try {
      const conflict = await tauri.checkEnvironmentConflict(effectiveProjectRoot, name)
      if (conflict) {
        // Check if the environment is actually running (from discovery data)
        const env = discovery?.environments.find(e => e.name === name)
        conflict.is_running = env?.running || false

        // Show conflict dialog
        setEnvironmentConflict(conflict)
        setPendingEnvCreation({ name, branch, baseBranch })
        return
      }
    } catch (err) {
      log(`Failed to check for conflicts: ${err}`, 'warning')
      // Continue anyway
    }

    const envPath = `${effectiveWorktreesDir}/${name}`

    // Add to creating environments list
    setCreatingEnvs(prev => [...prev, { name, status: 'cloning', path: envPath }])
    log(`Creating worktree "${name}" from branch "${branch || 'main'}"...`, 'step')

    try {
      if (dryRunMode) {
        log(`[DRY RUN] Would create worktree "${name}" for branch "${branch}"`, 'warning')
        setCreatingEnvs(prev => prev.map(e => e.name === name ? { ...e, status: 'starting' } : e))
        await new Promise(r => setTimeout(r, 2000))
        log(`[DRY RUN] Worktree environment "${name}" created`, 'success')
      } else {
        // Step 1: Create the git worktree with workmux (includes tmux integration)
        log(`Creating git worktree at ${envPath}...`, 'info')
        const worktree = await tauri.createWorktreeWithWorkmux(effectiveProjectRoot, name, branch || undefined, baseBranch, true, undefined)
        log(`✓ Worktree created at ${worktree.path}`, 'success')

        // Step 1.5: Write default admin credentials if configured
        try {
          const settings = await tauri.loadLauncherSettings()
          if (settings.default_admin_email && settings.default_admin_password) {
            log(`Writing admin credentials to secrets.yaml...`, 'info')
            await tauri.writeCredentialsToWorktree(
              worktree.path,
              settings.default_admin_email,
              settings.default_admin_password,
              settings.default_admin_name || undefined
            )
            log(`✓ Admin credentials configured`, 'success')
          } else {
            log(`⚠ No default credentials configured - you'll need to register a user`, 'warning')
          }
        } catch (err) {
          // Non-critical, user can still register manually
          log(`Could not write credentials: ${err}`, 'warning')
        }

        // Check if tmux window was created
        try {
          const tmuxStatus = await tauri.getEnvironmentTmuxStatus(name)
          if (tmuxStatus.exists) {
            log(`✓ Tmux window 'ushadow-${name}' created`, 'success')
          } else {
            log(`⚠ Tmux window not created (tmux may not be running)`, 'warning')
          }
        } catch (err) {
          // Non-critical, don't fail the operation
          log(`Could not check tmux status: ${err}`, 'info')
        }

        // Step 2: Update status
        setCreatingEnvs(prev => prev.map(e => e.name === name ? { ...e, status: 'starting', path: worktree.path } : e))

        // Step 3: Start the environment (run setup and start containers)
        log(`Starting environment "${name}"...`, 'step')
        await handleStartEnv(name, worktree.path)

        log(`✓ Worktree environment "${name}" created and started!`, 'success')
      }

      // Remove from creating list after success
      setTimeout(() => {
        setCreatingEnvs(prev => prev.filter(e => e.name !== name))
      }, 15000)

      await refreshDiscovery()
    } catch (err) {
      log(`Failed to create worktree: ${err}`, 'error')
      setCreatingEnvs(prev => prev.map(e => e.name === name ? { ...e, status: 'error', error: String(err) } : e))
    }
  }

  // Conflict resolution handlers
  const handleConflictStartExisting = async () => {
    if (!environmentConflict) return

    setEnvironmentConflict(null)
    setPendingEnvCreation(null)
    log(`Starting existing environment "${environmentConflict.name}"...`, 'step')

    // Start the existing environment
    await handleStartEnv(environmentConflict.name, environmentConflict.path)
  }

  const handleConflictSwitchBranch = async () => {
    if (!environmentConflict || !pendingEnvCreation) return

    const { name, branch, baseBranch } = pendingEnvCreation
    setEnvironmentConflict(null)
    setPendingEnvCreation(null)

    log(`Switching "${name}" to branch "${branch}"...`, 'step')

    try {
      // Stop if running
      if (environmentConflict.is_running) {
        log('Stopping environment before switching branch...', 'info')
        await tauri.stopEnvironment(name)
      }

      // Checkout the new branch
      log(`Checking out branch ${branch}...`, 'info')
      await tauri.checkoutBranch(environmentConflict.path, branch)
      log(`✓ Switched to ${branch}`, 'success')

      // Start the environment
      await handleStartEnv(name, environmentConflict.path)
    } catch (err) {
      log(`Failed to switch branch: ${err}`, 'error')
    }
  }

  const handleConflictDeleteAndRecreate = async () => {
    if (!environmentConflict || !pendingEnvCreation) return

    const { name, branch, baseBranch } = pendingEnvCreation
    setEnvironmentConflict(null)
    setPendingEnvCreation(null)

    log(`Deleting and recreating "${name}"...`, 'step')

    try {
      // Delete the old environment (stops containers, removes worktree, closes tmux)
      await tauri.deleteEnvironment(effectiveProjectRoot, name)
      log(`✓ Old environment deleted`, 'success')

      // Wait a moment for cleanup
      await new Promise(r => setTimeout(r, 1000))

      // Now create the new environment (reuse existing logic from handleNewEnvWorktree)
      const envPath = `${effectiveWorktreesDir}/${name}`
      setCreatingEnvs(prev => [...prev, { name, status: 'cloning', path: envPath }])
      log(`Creating worktree "${name}" from branch "${branch}"...`, 'step')

      if (dryRunMode) {
        log(`[DRY RUN] Would create worktree "${name}" for branch "${branch}"`, 'warning')
        setCreatingEnvs(prev => prev.map(e => e.name === name ? { ...e, status: 'starting' } : e))
        await new Promise(r => setTimeout(r, 2000))
        log(`[DRY RUN] Worktree environment "${name}" created`, 'success')
      } else {
        log(`Creating git worktree at ${envPath}...`, 'info')
        const worktree = await tauri.createWorktreeWithWorkmux(effectiveProjectRoot, name, branch || undefined, baseBranch, true, undefined)
        log(`✓ Worktree created at ${worktree.path}`, 'success')

        // Write credentials if configured
        try {
          const settings = await tauri.loadLauncherSettings()
          if (settings.default_admin_email && settings.default_admin_password) {
            log(`Writing admin credentials to secrets.yaml...`, 'info')
            await tauri.writeCredentialsToWorktree(
              worktree.path,
              settings.default_admin_email,
              settings.default_admin_password,
              settings.default_admin_name || undefined
            )
            log(`✓ Admin credentials configured`, 'success')
          }
        } catch (err) {
          log(`Could not write credentials: ${err}`, 'warning')
        }

        setCreatingEnvs(prev => prev.map(e => e.name === name ? { ...e, status: 'starting', path: worktree.path } : e))

        // Start the environment
        log(`Starting environment "${name}"...`, 'step')
        await handleStartEnv(name, worktree.path)

        log(`✓ Worktree environment "${name}" created and started!`, 'success')
      }

      setTimeout(() => {
        setCreatingEnvs(prev => prev.filter(e => e.name !== name))
      }, 15000)

      await refreshDiscovery()
    } catch (err) {
      log(`Failed to delete and recreate: ${err}`, 'error')
      setCreatingEnvs(prev => prev.map(e => e.name === name ? { ...e, status: 'error', error: String(err) } : e))
    }
  }

  const handleConflictCancel = () => {
    setEnvironmentConflict(null)
    setPendingEnvCreation(null)
  }

  // Project setup handler - saves paths, doesn't clone yet
  const handleProjectSetup = async (path: string, worktreesPath: string) => {
    setShowProjectDialog(false)

    try {
      log(`Project path set to ${path}`, 'success')
      log(`Worktrees directory set to ${worktreesPath}`, 'info')

      await tauri.setProjectRoot(path)
      setProjectRoot(path)
      setWorktreesDir(worktreesPath)

      // Check if repo already exists
      const status = await tauri.checkProjectDir(path)

      if (status.exists && status.is_valid_repo) {
        // Existing repo found - run discovery
        log('Found existing Ushadow repository', 'info')
        const disc = await refreshDiscovery()

        // Auto-switch to quick mode if no environments exist
        if (disc && disc.environments.length === 0) {
          setAppMode('install')
          log('Ready for quick launch', 'step')
        }
      } else {
        // Repo doesn't exist - will be cloned when user presses Launch
        setAppMode('install')
        log('Press Launch to install Ushadow', 'step')
      }
    } catch (err) {
      log(`Failed to set installation path`, 'error')
      log(String(err), 'error')
    }
  }

  const handleClone = async (path: string, branch?: string) => {
    try {
      // Check if repo already exists at this location
      const status = await tauri.checkProjectDir(path)

      if (status.exists && status.is_valid_repo) {
        // Repo exists - pull latest instead of cloning
        const branchMsg = branch ? ` (on ${branch} branch)` : ''
        log(`Repository found at ${path}${branchMsg}, pulling latest...`, 'step')
        if (dryRunMode) {
          log(`[DRY RUN] Would pull latest changes${branchMsg}`, 'warning')
          await new Promise(r => setTimeout(r, 1000))
        } else {
          const result = await tauri.updateUshadowRepo(path)
          log(result, 'success')
          if (branch) {
            log(`✓ Using ${branch} branch`, 'info')
          }
        }
      } else {
        // No repo - clone fresh
        const branchMsg = branch ? ` on ${branch} branch` : ''
        log(`Cloning Ushadow to ${path}${branchMsg}...`, 'step')
        if (dryRunMode) {
          log(`[DRY RUN] Would clone repository${branchMsg}`, 'warning')
          await new Promise(r => setTimeout(r, 2000))
          log('[DRY RUN] Clone simulated', 'success')
        } else {
          const result = await tauri.cloneUshadowRepo(path, branch)
          log(result, 'success')
        }
      }

      await tauri.setProjectRoot(path)
      setProjectRoot(path)
    } catch (err) {
      log(`Clone failed: ${err}`, 'error')
      throw err
    }
  }

  const handleLink = async (path: string) => {
    setShowProjectDialog(false)
    log(`Linking to ${path}...`, 'step')

    try {
      await tauri.setProjectRoot(path)
      setProjectRoot(path)
      log('Project linked', 'success')
      const disc = await refreshDiscovery()

      // Auto-switch to quick mode if no environments exist after link
      if (disc && disc.environments.length === 0) {
        setAppMode('install')
        log('No environments found - ready for quick launch', 'step')
      }
    } catch (err) {
      log(`Failed to link: ${err}`, 'error')
    }
  }

  // Quick launch (for quick mode)
  const handleQuickLaunch = async () => {
    setIsLaunching(true)
    setLogExpanded(true)
    log('🚀 Starting Ushadow quick launch...', 'step')

    // Always navigate to infra page so the user can see what's happening
    setAppMode('infra')

    // Give UI a brief moment to render
    await new Promise(r => setTimeout(r, 50))

    try {
      const failedInstalls: string[] = []

      // Step 1: On macOS, ensure Homebrew is installed first (required for other tools)
      if (platform === 'macos') {
        let prereqs = getEffectivePrereqs(await refreshPrerequisites())
        if (!prereqs?.homebrew_installed) {
          log('Homebrew not found - installing first (required for other tools)...', 'step')
          await handleInstall('homebrew')

          // Wait for state to propagate
          await new Promise(r => setTimeout(r, 100))

          // Verify installation
          prereqs = getEffectivePrereqs(await refreshPrerequisites())
          if (!prereqs?.homebrew_installed) {
            log('⚠️  Homebrew installation command completed, but detection failed', 'warning')
            log('You may need to restart your terminal or run the post-install steps', 'info')
            failedInstalls.push('Homebrew')
          } else {
            log('✓ Homebrew installed and detected successfully', 'success')
          }
        }
      }

      // Step 2: Use existing prerequisites (already checked on app load)
      log('Verifying prerequisites...', 'step')
      let prereqs = getEffectivePrereqs(prerequisites)
      if (!prereqs) {
        // Only refresh if we don't have cached data
        prereqs = getEffectivePrereqs(await refreshPrerequisites())
        if (!prereqs) throw new Error('Failed to check prerequisites')
      }
      log('✓ Prerequisites verified', 'success')

      // Step 3: Install missing prerequisites (don't stop on failure)
      if (!prereqs.git_installed) {
        await handleInstall('git')
        await new Promise(r => setTimeout(r, 100))
        prereqs = getEffectivePrereqs(await refreshPrerequisites())
        if (!prereqs?.git_installed) {
          log('⚠️  Git installation command completed, but detection failed', 'warning')
          failedInstalls.push('Git')
        } else {
          log('✓ Git installed and detected successfully', 'success')
        }
      }

      if (!prereqs?.python_installed) {
        await handleInstall('python')
        await new Promise(r => setTimeout(r, 100))
        prereqs = getEffectivePrereqs(await refreshPrerequisites())
        if (!prereqs?.python_installed) {
          log('⚠️  Python installation command completed, but detection failed', 'warning')
          failedInstalls.push('Python')
        } else {
          log('✓ Python installed and detected successfully', 'success')
        }
      }

      if (!prereqs?.docker_installed) {
        await handleInstall('docker')
        await new Promise(r => setTimeout(r, 100))
        prereqs = getEffectivePrereqs(await refreshPrerequisites())
        if (!prereqs?.docker_installed) {
          log('⚠️  Docker installation command completed, but detection failed', 'warning')
          failedInstalls.push('Docker')
        } else {
          log('✓ Docker installed and detected successfully', 'success')
        }
      }

      // Step 4: Start Docker if needed
      if (prereqs?.docker_installed && !prereqs.docker_running) {
        await handleStartDocker()
        if (dryRunMode) {
          // In dry run, just wait for state to propagate
          await new Promise(r => setTimeout(r, 100))
          prereqs = getEffectivePrereqs(await refreshPrerequisites())
        } else {
          // In real mode, wait for Docker to start (max 60 seconds)
          let dockerRunning = false
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000))
            const check = getEffectivePrereqs(await refreshPrerequisites())
            if (check?.docker_running) {
              dockerRunning = true
              break
            }
          }
          if (!dockerRunning) {
            log('⚠️  Docker failed to start - please start Docker Desktop manually', 'warning')
            failedInstalls.push('Docker (start)')
          }
          prereqs = getEffectivePrereqs(await refreshPrerequisites())
        }
      }

      // Report any failures
      if (failedInstalls.length > 0) {
        log(`Installation issues detected: ${failedInstalls.join(', ')}`, 'warning')
        log('You can manually install these and refresh, or continue if not critical', 'info')
      }

      // Step 5: Ensure main repo exists (always clone main branch, never dev)
      log('Checking project directory...', 'step')
      const status = await tauri.checkProjectDir(projectRoot)
      if (!status.is_valid_repo) {
        log('Cloning main branch to project root...', 'step')
        await handleClone(projectRoot, 'main')  // Always clone main
      } else {
        log('✓ Project directory ready', 'success')
      }

      // Step 6: Start infrastructure (postgres, redis, etc.) - only if needed
      log('Checking infrastructure...', 'step')
      // Use cached discovery first (fast), only refresh if needed
      let infraRunning = (discovery?.infrastructure.length ?? 0) > 0 &&
                         discovery?.infrastructure.every(svc => svc.running)

      if (infraRunning) {
        log('✓ Infrastructure already running', 'success')
      } else {
        // Re-check to be sure (in case cache is stale)
        const currentDiscovery = await tauri.discoverEnvironments()
        infraRunning = currentDiscovery.infrastructure.length > 0 &&
                       currentDiscovery.infrastructure.every(svc => svc.running)

        if (infraRunning) {
          log('✓ Infrastructure already running', 'success')
        } else {
          log('Starting infrastructure (pulling images if needed)...', 'step')
          setLoadingInfra(true)
          try {
            if (dryRunMode) {
              log('[DRY RUN] Would start infrastructure', 'warning')
              await new Promise(r => setTimeout(r, 1000))
              log('[DRY RUN] Infrastructure started', 'success')
            } else {
              const infraResult = await tauri.startInfrastructure()
              // Full compose output (including pull progress) goes to Detail tab
              log(infraResult, 'info', true)
              log('✓ Infrastructure started', 'success')
            }
          } finally {
            setLoadingInfra(false)
          }
        }
      }
      await refreshDiscovery()

      // Switch to environments page before starting env — user sees the "creating" card immediately
      setAppMode('environments')

      // Step 7: Start the ushadow environment
      log(`Starting ushadow environment...`, 'step')
      await handleStartEnv('ushadow', undefined)

      if (failedInstalls.length > 0) {
        log('Quick launch completed with warnings', 'warning')
      } else {
        log('Quick launch complete!', 'success')
      }
    } catch (err) {
      console.error('DEBUG: handleQuickLaunch caught error:', err)
      log(`Quick launch failed: ${err}`, 'error')
      setAppMode('environments')
    } finally {
      setIsLaunching(false)
    }
  }

  const effectivePrereqs = getEffectivePrereqs(prerequisites)

  return (
    <div
      className="h-screen bg-surface-900 text-text-primary flex flex-col overflow-hidden relative"
      data-testid="launcher-app"
      style={{ cursor: isResizing ? 'col-resize' : 'default' }}
    >
      {/* Embedded View Overlay */}
      {embeddedView && (
        <EmbeddedView
          url={embeddedView.url}
          envName={embeddedView.envName}
          envColor={embeddedView.envColor}
          envPath={embeddedView.envPath}
          backendPort={embeddedView.backendPort}
          onClose={() => setEmbeddedView(null)}
        />
      )}

      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-surface-700">
        <div className="flex items-center gap-3">
          <img src="/ushadow-logo.png" alt="Ushadow" className="w-8 h-8" />
          <h1 className="text-lg font-semibold bg-gradient-brand bg-clip-text text-transparent">
            Ushadow Launcher
          </h1>
          {dryRunMode && (
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
              DRY RUN
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Page Navigation */}
          <div className="flex rounded-lg bg-surface-700 p-0.5" data-testid="mode-toggle">
            <button
              onClick={() => setAppMode('install')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                appMode === 'install' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
              data-testid="nav-install"
            >
              <Zap className="w-3 h-3 inline mr-1" />
              Install
            </button>
            <button
              onClick={() => setAppMode('infra')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                appMode === 'infra' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
              data-testid="nav-infra"
            >
              <Package className="w-3 h-3 inline mr-1" />
              Infra
            </button>
            <button
              onClick={() => setAppMode('environments')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                appMode === 'environments' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
              data-testid="nav-environments"
            >
              <FolderGit2 className="w-3 h-3 inline mr-1" />
              Environments
            </button>
            {kanbanEnabled && (
              <button
                onClick={() => setAppMode('kanban')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  appMode === 'kanban' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'
                }`}
                data-testid="nav-kanban"
              >
                <Trello className="w-3 h-3 inline mr-1" />
                Kanban
              </button>
            )}
            {claudeEnabled && (
              <button
                onClick={() => setAppMode('claude')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  appMode === 'claude' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'
                }`}
                data-testid="nav-claude"
              >
                <Bot className="w-3 h-3" />
                Claude
                {claudeSessions.filter(s => s.status !== 'Ended').length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-yellow-500/30 text-yellow-400 text-[10px] font-bold leading-none">
                    {claudeSessions.filter(s => s.status !== 'Ended').length}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Tmux Manager */}
          <button
            onClick={() => setShowTmuxManager(true)}
            className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
            title="Manage tmux sessions"
            data-testid="tmux-manager-button"
          >
            <Terminal className="w-4 h-4" />
          </button>

          {/* Auth Button */}
          <AuthButton
            environment={selectedEnvironment}
            variant="header"
          />

          {/* Settings Button */}
          <button
            onClick={() => setShowSettingsDialog(true)}
            className="px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 transition-colors flex items-center gap-2 font-medium text-sm"
            title="Configure launcher settings"
            data-testid="open-settings-button"
          >
            <Sliders className="w-4 h-4" />
            Settings
          </button>

          {/* Refresh */}
          <button
            onClick={() => { refreshPrerequisites(); refreshDiscovery() }}
            className="p-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
            title="Refresh"
            data-testid="refresh-button"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-4 relative">
        {/* Install Page — always mounted for instant tab switch */}
        <div className={`h-full flex flex-col overflow-y-auto p-8 ${appMode === 'install' ? '' : 'hidden'}`}>
          {multiProjectMode ? (
            /* Multi-Project Mode - Project Manager */
            <>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">Project Management</h2>
                <p className="text-text-secondary">
                  Manage multiple projects with independent configurations
                </p>
              </div>
              <div className="max-w-4xl mx-auto w-full">
                <ProjectManager />
              </div>
            </>
          ) : (
            /* Single-Project Mode - One-Click Launch */
            <div className="flex flex-col items-center justify-center flex-1">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">One-Click Launch</h2>
                <p className="text-text-secondary">
                  Automatically install prerequisites and start Ushadow
                </p>
              </div>

              {/* Project Folder Display */}
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-800 rounded-lg mb-6 text-sm">
                <FolderOpen className="w-4 h-4 text-text-muted" />
                <span className="text-text-muted">Project folder:</span>
                <span className="text-text-secondary truncate max-w-md" title={projectRoot}>
                  {projectRoot || 'Not set'}
                </span>
                <button
                  onClick={() => setShowProjectDialog(true)}
                  className="p-1 rounded hover:bg-surface-700 transition-colors text-text-muted hover:text-text-primary ml-1"
                  title="Change folder locations"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={handleQuickLaunch}
                disabled={isLaunching}
                className={`px-12 py-4 rounded-xl transition-all font-semibold text-lg flex items-center justify-center gap-3 ${
                  isLaunching
                    ? 'bg-surface-600 cursor-not-allowed'
                    : 'bg-gradient-brand hover:opacity-90 hover:shadow-lg hover:shadow-primary-500/20 active:scale-95'
                }`}
                data-testid="quick-launch-button"
              >
                {isLaunching ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Launching...
                  </>
                ) : (
                  <>
                    <Zap className="w-6 h-6" />
                    Launch Ushadow
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Infra Page — always mounted for instant tab switch */}
        <div className={`h-full flex flex-col gap-4 overflow-y-auto ${appMode === 'infra' ? '' : 'hidden'}`}>
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold mb-2">Setup & Installation</h2>
            <p className="text-text-secondary">
              Install prerequisites and configure shared infrastructure
            </p>
          </div>

          {/* Prerequisites and Infrastructure Side-by-Side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-4">
              <PrerequisitesPanel
                prerequisites={effectivePrereqs}
                prerequisitesConfig={prerequisitesConfig}
                isInstalling={isInstalling}
                installingItem={installingItem}
                onInstall={handleInstall}
                onStartDocker={handleStartDocker}
                showDevTools={showDevTools}
                onToggleDevTools={() => setShowDevTools(!showDevTools)}
              />
              {showDevTools && <DevToolsPanel />}
            </div>

            <InfrastructurePanel
              services={discovery?.infrastructure ?? []}
              onStart={handleStartInfra}
              onStop={handleStopInfra}
              onRestart={handleRestartInfra}
              isLoading={loadingInfra}
              selectedServices={selectedInfraServices}
              onToggleService={handleToggleInfraService}
              projectRoot={effectiveProjectRoot}
            />
          </div>

          {multiProjectMode && effectiveProjectRoot && (
            <InfraConfigPanel
              projectRoot={effectiveProjectRoot}
              selectedInfraServices={selectedInfraServices}
              onSave={(_config) => {}}
            />
          )}
        </div>

        {/* Environments Page — always mounted for instant tab switch */}
        <div className={`h-full flex flex-col overflow-hidden p-4 ${appMode === 'environments' ? '' : 'hidden'}`}>
          <EnvironmentsPanel
            environments={discovery?.environments ?? []}
            creatingEnvs={creatingEnvs}
            onStart={handleStartEnv}
            onStop={handleStopEnv}
            onCreate={() => setShowNewEnvDialog(true)}
            onOpenInApp={handleOpenInApp}
            onMerge={handleMerge}
            onDelete={handleDelete}
            onAttachTmux={handleAttachTmux}
            onDismissError={(name) => setCreatingEnvs(prev => prev.filter(e => e.name !== name))}
            loadingEnv={loadingEnv}
            tmuxStatuses={tmuxStatuses}
            selectedEnvironment={selectedEnvironment}
            onSelectEnvironment={(env) => {
              setSelectedEnvironment(env)
            }}
          />
        </div>

        {appMode === 'kanban' && kanbanEnabled ? (
          /* Kanban Page - Ticket Management */
          (() => {
            // Use the first available backend (running or not)
            const backendUrl = discovery?.environments.find(e => e.running)?.localhost_url
                            || discovery?.environments[0]?.localhost_url
                            || 'http://localhost:8000'

            return (
              <KanbanBoard
                projectId={projectRoot}
                backendUrl={backendUrl}
                projectRoot={projectRoot || ''}
              />
            )
          })()
        ) : appMode === 'claude' && claudeEnabled ? (
          /* Claude Sessions Page */
          <ClaudeSessionsPanel
            sessions={claudeSessions}
            hooksInstalled={hooksInstalled}
            installing={installingHooks}
            error={hooksError}
            installSuccess={hooksInstallSuccess}
            onInstallHooks={installHooks}
            environments={environments}
            onOpenInApp={(env) => {
              if (env.localhost_url) {
                setEmbeddedView({ url: env.localhost_url, envName: env.name, envColor: env.color ?? env.name, envPath: env.path ?? null, backendPort: env.backend_port })
              }
            }}
          />
        ) : null}
      </main>

      {/* Log Panel - Bottom */}
      <div className="p-4 pt-0">
        <LogPanel
          logs={logs}
          onClear={clearLogs}
          expanded={logExpanded}
          onToggleExpand={() => setLogExpanded(!logExpanded)}
        />
      </div>

      {/* Project Setup Dialog */}
      <ProjectSetupDialog
        isOpen={showProjectDialog}
        defaultPath={projectRoot}
        defaultWorktreesPath={worktreesDir}
        onClose={() => {
          setShowProjectDialog(false)
        }}
        onSetup={handleProjectSetup}
      />

      {/* New Environment Dialog */}
      <NewEnvironmentDialog
        isOpen={showNewEnvDialog}
        projectRoot={effectiveProjectRoot}
        onClose={() => setShowNewEnvDialog(false)}
        onLink={handleNewEnvLink}
        onWorktree={handleNewEnvWorktree}
      />

      {/* Tmux Manager Dialog */}
      <TmuxManagerDialog
        isOpen={showTmuxManager}
        onClose={() => setShowTmuxManager(false)}
        onRefresh={() => refreshDiscovery(true)}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />

      {/* Environment Conflict Dialog */}
      <EnvironmentConflictDialog
        conflict={environmentConflict}
        newBranch={pendingEnvCreation?.branch || ''}
        onStartExisting={handleConflictStartExisting}
        onSwitchBranch={handleConflictSwitchBranch}
        onDeleteAndRecreate={handleConflictDeleteAndRecreate}
        onCancel={handleConflictCancel}
      />

      {/* Claude Session Notch Overlay */}
      {claudeEnabled && (
        <LauncherNotch
          sessions={claudeSessions}
          onOpenInApp={(env) => {
            if (env.localhost_url) {
              setEmbeddedView({ url: env.localhost_url, envName: env.name, envColor: env.color ?? env.name, envPath: env.path ?? null, backendPort: env.backend_port })
            }
          }}
        />
      )}
    </div>
  )
}

export default App
