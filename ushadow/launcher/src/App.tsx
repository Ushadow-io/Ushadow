import { useState, useEffect, useCallback, useRef } from 'react'
import { tauri, type Prerequisites, type Discovery } from './hooks/useTauri'
import { useAppStore } from './store/appStore'
import { useWindowFocus } from './hooks/useWindowFocus'
import { DevToolsPanel } from './components/DevToolsPanel'
import { PrerequisitesPanel } from './components/PrerequisitesPanel'
import { InfrastructurePanel } from './components/InfrastructurePanel'
import { EnvironmentsPanel } from './components/EnvironmentsPanel'
import { LogPanel, type LogEntry, type LogLevel } from './components/LogPanel'
import { ProjectSetupDialog } from './components/ProjectSetupDialog'
import { NewEnvironmentDialog } from './components/NewEnvironmentDialog'
import { EmbeddedView } from './components/EmbeddedView'
import { RefreshCw, Settings, Zap, Loader2, FolderOpen, Pencil } from 'lucide-react'
import { getColors } from './utils/colors'

function App() {
  // Store
  const {
    dryRunMode,
    showDevTools,
    setShowDevTools,
    appMode,
    setAppMode,
    spoofedPrereqs,
    setSpoofedPrereq,
    projectRoot,
    setProjectRoot,
  } = useAppStore()

  // State
  const [platform, setPlatform] = useState<string>('')
  const [prerequisites, setPrerequisites] = useState<Prerequisites | null>(null)
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isInstalling, setIsInstalling] = useState(false)
  const [installingItem, setInstallingItem] = useState<string | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const [loadingInfra, setLoadingInfra] = useState(false)
  const [loadingEnv, setLoadingEnv] = useState<string | null>(null)
  const [showProjectDialog, setShowProjectDialog] = useState(false)
  const [showNewEnvDialog, setShowNewEnvDialog] = useState(false)
  const [logExpanded, setLogExpanded] = useState(true)
  const [embeddedView, setEmbeddedView] = useState<{ url: string; envName: string; envColor: string } | null>(null)
  const [creatingEnvs, setCreatingEnvs] = useState<{ name: string; status: 'cloning' | 'starting' | 'error'; path?: string; error?: string }[]>([])
  const [shouldAutoLaunch, setShouldAutoLaunch] = useState(false)

  // Window focus detection for smart polling
  const isWindowFocused = useWindowFocus()

  const logIdRef = useRef(0)
  const lastStateRef = useRef<string>('')

  // Logging functions
  const log = useCallback((message: string, level: LogLevel = 'info') => {
    setLogs(prev => [...prev, {
      id: logIdRef.current++,
      timestamp: new Date(),
      message,
      level,
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
      homebrew_version: real.homebrew_version,
      docker_version: real.docker_version,
      tailscale_version: real.tailscale_version,
      git_version: real.git_version,
      python_version: real.python_version,
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
      log('Initializing...', 'step')

      const os = await tauri.getOsType()
      setPlatform(os)
      log(`Platform: ${os}`)

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

  // Install handlers
  const handleInstall = async (item: 'git' | 'docker' | 'tailscale' | 'homebrew' | 'python') => {
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
        let result: string
        switch (item) {
          case 'homebrew':
            result = await tauri.installHomebrew()
            break
          case 'git':
            result = platform === 'macos'
              ? await tauri.installGitMacos()
              : await tauri.installGitWindows()
            break
          case 'python':
            if (platform === 'macos') {
              if (!prerequisites?.homebrew_installed) {
                log('Homebrew required first', 'warning')
                return
              }
              log('Installing Python 3 via Homebrew...', 'step')
              result = 'Python 3 can be installed via: brew install python3\nPlease run this command in your terminal.'
            } else if (platform === 'windows') {
              result = 'Please download Python 3 from https://www.python.org/downloads/'
            } else {
              result = 'Please install Python 3 using your system package manager (e.g., apt, yum)'
            }
            log(result, 'warning')
            return
          case 'docker':
            if (platform === 'macos') {
              if (!prerequisites?.homebrew_installed) {
                log('Homebrew required first', 'warning')
                return
              }
              result = await tauri.installDockerViaBrew()
            } else {
              result = await tauri.installDockerWindows()
            }
            break
          case 'tailscale':
            result = platform === 'macos'
              ? await tauri.installTailscaleMacos()
              : await tauri.installTailscaleWindows()
            break
          default:
            throw new Error(`Unknown item: ${item}`)
        }
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
        if (platform === 'macos') {
          await tauri.startDockerDesktopMacos()
        } else if (platform === 'windows') {
          await tauri.startDockerDesktopWindows()
        } else {
          await tauri.startDockerServiceLinux()
        }
        log('Docker started', 'success')
      }
      await refreshPrerequisites()
    } catch (err) {
      log(`Failed to start Docker`, 'error', false)
      log(String(err), 'error', true)
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
        log(result, 'success')
      }
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to start infrastructure`, 'error', false)
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
      log(`Failed to stop infrastructure`, 'error', false)
      log(String(err), 'error', true)
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
      log(`Failed to restart infrastructure`, 'error', false)
      log(String(err), 'error', true)
    } finally {
      setLoadingInfra(false)
    }
  }

  // Environment handlers
  const handleStartEnv = async (envName: string) => {
    console.log(`DEBUG: handleStartEnv called for ${envName}`)
    setLoadingEnv(envName)
    log(`Starting ${envName}...`, 'step')

    // Add to creating list to show starting feedback
    setCreatingEnvs(prev => [...prev, { name: envName, status: 'starting' }])

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
            const mockEnv = {
              name: envName,
              color: envName,
              localhost_url: `http://localhost:8000`,
              tailscale_url: null,
              backend_port: 8000,
              webui_port: 3000,
              running: true,
              tailscale_active: false,
              containers: ['backend', 'webui', 'postgres', 'redis'],
              path: projectRoot,
            }
            return {
              ...prev,
              environments: [...prev.environments, mockEnv]
            }
          }
        })
      } else {
        console.log(`DEBUG: Calling tauri.startEnvironment(${envName})`)
        const result = await tauri.startEnvironment(envName)
        console.log(`DEBUG: tauri.startEnvironment returned: ${result}`)
        log(result, 'success')

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
      log(`Failed to start ${envName}`, 'error', false)
      // Log detailed error for Detail view
      log(String(err), 'error', true)
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
    setLoadingEnv(envName)
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
      log(`Failed to stop ${envName}`, 'error', false)
      log(String(err), 'error', true)
    } finally {
      setLoadingEnv(null)
    }
  }

  const handleOpenInApp = (env: { name: string; color?: string; localhost_url: string | null; webui_port: number | null; backend_port: number | null }) => {
    const url = env.localhost_url || `http://localhost:${env.webui_port || env.backend_port}`
    const colors = getColors(env.color || env.name)
    log(`Opening ${env.name} in embedded view...`, 'info')
    setEmbeddedView({ url, envName: env.name, envColor: colors.primary })
  }

  // New environment handlers
  const handleNewEnvClone = async (name: string, serverMode: 'dev' | 'prod') => {
    setShowNewEnvDialog(false)
    const envPath = `${projectRoot}/../${name}` // Expected clone location
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
      log(`Failed to create environment`, 'error', false)
      log(String(err), 'error', true)
      setCreatingEnvs(prev => prev.map(e => e.name === name ? { ...e, status: 'error', error: String(err) } : e))
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
      log(`Failed to link environment`, 'error', false)
      log(String(err), 'error', true)
    }
  }

  const handleNewEnvWorktree = async (name: string, branch: string) => {
    setShowNewEnvDialog(false)
    setIsLaunching(true)
    log(`Creating worktree environment "${name}" on branch "${branch}"...`, 'step')

    try {
      // TODO: Implement worktree creation in Rust backend
      if (dryRunMode) {
        log(`[DRY RUN] Would create worktree "${name}" for branch "${branch}"`, 'warning')
        await new Promise(r => setTimeout(r, 2000))
        log(`[DRY RUN] Worktree environment "${name}" created`, 'success')
      } else {
        log(`Worktree functionality not yet implemented`, 'warning')
      }
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to create worktree`, 'error', false)
      log(String(err), 'error', true)
    } finally {
      setIsLaunching(false)
    }
  }

  // Project setup handler - just saves the path, doesn't clone yet
  const handleProjectSetup = async (path: string) => {
    setShowProjectDialog(false)

    try {
      // Save the project root
      await tauri.setProjectRoot(path)
      setProjectRoot(path)
      log(`Installation path set to ${path}`, 'success')

      // Check if repo already exists
      const status = await tauri.checkProjectDir(path)

      if (status.exists && status.is_valid_repo) {
        // Existing repo found - run discovery
        log('Found existing Ushadow repository', 'info')
        const disc = await refreshDiscovery()

        // Auto-switch to quick mode if no environments exist
        if (disc && disc.environments.length === 0) {
          setAppMode('quick')
          log('Ready for quick launch', 'step')
        }
      } else {
        // Repo doesn't exist - will be cloned when user presses Launch
        setAppMode('quick')
        log('Press Launch to install Ushadow', 'step')
      }
    } catch (err) {
      log(`Failed to set installation path`, 'error', false)
      log(String(err), 'error', true)
    }
  }

  const handleClone = async (path: string) => {
    try {
      console.log('DEBUG handleClone: Starting clone for path:', path)
      console.log('DEBUG handleClone: dryRunMode =', dryRunMode)
      
      // Check if repo already exists at this location
      const status = await tauri.checkProjectDir(path)
      console.log('DEBUG handleClone: checkProjectDir status =', status)

      if (status.exists && status.is_valid_repo) {
        // Repo exists - pull latest instead of cloning
        log(`Repository found at ${path}, pulling latest...`, 'step')
        if (dryRunMode) {
          log('[DRY RUN] Would pull latest changes', 'warning')
          await new Promise(r => setTimeout(r, 1000))
        } else {
          const result = await tauri.updateUshadowRepo(path)
          log(result, 'success')
        }
      } else {
        // No repo - clone fresh
        log(`Cloning Ushadow to ${path}...`, 'step')
        if (dryRunMode) {
          log('[DRY RUN] Would clone repository', 'warning')
          await new Promise(r => setTimeout(r, 2000))
          log('[DRY RUN] Clone simulated', 'success')
        } else {
          console.log('DEBUG handleClone: Calling tauri.cloneUshadowRepo with path:', path)
          const result = await tauri.cloneUshadowRepo(path)
          console.log('DEBUG handleClone: Clone result from Rust:', result)
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
        setAppMode('quick')
        log('No environments found - ready for quick launch', 'step')
      }
    } catch (err) {
      log(`Failed to link: ${err}`, 'error')
    }
  }

  // Quick launch (for quick mode)
  const handleQuickLaunch = async () => {
    console.log('DEBUG: handleQuickLaunch started')
    setIsLaunching(true)

    // Switch to dev mode immediately to show progress
    setAppMode('dev')
    setLogExpanded(true)
    log('🚀 Starting Ushadow quick launch...', 'step')

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

      if (!prereqs.python_installed) {
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

      if (!prereqs.docker_installed) {
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
      if (prereqs.docker_installed && !prereqs.docker_running) {
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

      // Step 5: Clone if needed
      log('Checking project directory...', 'step')
      const status = await tauri.checkProjectDir(projectRoot)
      if (!status.is_valid_repo) {
        await handleClone(projectRoot)
      } else {
        log('✓ Project directory ready', 'success')
      }

      // Step 6: Start infrastructure (postgres, redis, etc.) - only if needed
      log('Checking infrastructure...', 'step')
      // Use cached discovery first (fast), only refresh if needed
      let infraRunning = (discovery?.infrastructure.length ?? 0) > 0 &&
                         discovery.infrastructure.every(svc => svc.running)

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
          log('Starting infrastructure...', 'step')
          if (dryRunMode) {
            log('[DRY RUN] Would start infrastructure', 'warning')
            await new Promise(r => setTimeout(r, 1000))
            log('[DRY RUN] Infrastructure started', 'success')
          } else {
            const infraResult = await tauri.startInfrastructure()
            log(infraResult, 'success')
          }
        }
      }
      await refreshDiscovery()

      // Step 7: Start ushadow environment
      log('Starting Ushadow environment...', 'step')
      await handleStartEnv('ushadow')

      if (failedInstalls.length > 0) {
        log('Quick launch completed with warnings', 'warning')
      } else {
        log('Quick launch complete!', 'success')
      }
    } catch (err) {
      console.error('DEBUG: handleQuickLaunch caught error:', err)
      log(`Quick launch failed: ${err}`, 'error')
    } finally {
      setIsLaunching(false)
    }
  }

  const effectivePrereqs = getEffectivePrereqs(prerequisites)

  return (
    <div className="h-screen bg-surface-900 text-text-primary flex flex-col overflow-hidden" data-testid="launcher-app">
      {/* Embedded View Overlay */}
      {embeddedView && (
        <EmbeddedView
          url={embeddedView.url}
          envName={embeddedView.envName}
          envColor={embeddedView.envColor}
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
          {/* Mode Toggle */}
          <div className="flex rounded-lg bg-surface-700 p-0.5" data-testid="mode-toggle">
            <button
              onClick={() => setAppMode('dev')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                appMode === 'dev' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Settings className="w-3 h-3 inline mr-1" />
              Dev
            </button>
            <button
              onClick={() => setAppMode('quick')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                appMode === 'quick' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Zap className="w-3 h-3 inline mr-1" />
              Quick
            </button>
          </div>

          {/* Dev Tools Toggle */}
          <button
            onClick={() => setShowDevTools(!showDevTools)}
            className={`p-2 rounded-lg transition-colors ${
              showDevTools ? 'bg-yellow-500/20 text-yellow-400' : 'bg-surface-700 hover:bg-surface-600'
            }`}
            title="Toggle dev tools"
            data-testid="dev-tools-toggle"
          >
            <Settings className="w-4 h-4" />
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

      {/* Dev Tools Panel */}
      {showDevTools && (
        <div className="px-4 pt-4">
          <DevToolsPanel />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-4">
        {appMode === 'quick' ? (
          /* Quick Mode - Single button */
          <div className="h-full flex flex-col items-center justify-center">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">One-Click Launch</h2>
              <p className="text-text-secondary">
                Automatically install prerequisites and start Ushadow
              </p>
            </div>

            {/* Installation Path Display */}
            <div className="flex items-center gap-2 px-4 py-2 bg-surface-800 rounded-lg mb-6 text-sm">
              <FolderOpen className="w-4 h-4 text-text-muted" />
              <span className="text-text-muted">Installation:</span>
              <span className="text-text-secondary truncate max-w-md" title={projectRoot}>
                {projectRoot || 'Not set'}
              </span>
              <button
                onClick={() => setShowProjectDialog(true)}
                className="p-1 rounded hover:bg-surface-700 transition-colors text-text-muted hover:text-text-primary ml-1"
                title="Change installation location"
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
        ) : (
          /* Dev Mode - Two column layout */
          <div className="h-full flex flex-col gap-4">
            {/* Ushadow Installation Settings Bar */}
            <div className="flex items-center gap-3 px-3 py-2 bg-surface-800 rounded-lg" data-testid="repo-settings-bar">
              <FolderOpen className="w-4 h-4 text-text-muted flex-shrink-0" />
              <span className="text-xs text-text-muted">Ushadow installation:</span>
              <span className="text-sm text-text-secondary truncate flex-1" title={projectRoot}>
                {projectRoot || 'Not set'}
              </span>
              <button
                onClick={() => setShowProjectDialog(true)}
                className="p-1.5 rounded hover:bg-surface-700 transition-colors text-text-muted hover:text-text-primary"
                title="Change installation location"
                data-testid="edit-repo-button"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
              {/* Left Column - Prerequisites & Infrastructure */}
              <div className="flex flex-col gap-4 overflow-y-auto">
                <PrerequisitesPanel
                prerequisites={effectivePrereqs}
                platform={platform}
                isInstalling={isInstalling}
                installingItem={installingItem}
                onInstall={handleInstall}
                onStartDocker={handleStartDocker}
              />
              <InfrastructurePanel
                services={discovery?.infrastructure ?? []}
                onStart={handleStartInfra}
                onStop={handleStopInfra}
                onRestart={handleRestartInfra}
                isLoading={loadingInfra}
              />
            </div>

            {/* Right Column - Environments */}
              <div className="overflow-y-auto">
                <EnvironmentsPanel
                  environments={discovery?.environments ?? []}
                  creatingEnvs={creatingEnvs}
                  onStart={handleStartEnv}
                  onStop={handleStopEnv}
                  onCreate={() => setShowNewEnvDialog(true)}
                  onOpenInApp={handleOpenInApp}
                  onDismissError={(name) => setCreatingEnvs(prev => prev.filter(e => e.name !== name))}
                  loadingEnv={loadingEnv}
                />
              </div>
            </div>
          </div>
        )}
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
        onClose={() => setShowProjectDialog(false)}
        onSetup={handleProjectSetup}
      />

      {/* New Environment Dialog */}
      <NewEnvironmentDialog
        isOpen={showNewEnvDialog}
        projectRoot={projectRoot}
        onClose={() => setShowNewEnvDialog(false)}
        onClone={handleNewEnvClone}
        onLink={handleNewEnvLink}
        onWorktree={handleNewEnvWorktree}
      />
    </div>
  )
}

export default App
