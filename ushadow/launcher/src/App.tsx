import { useState, useEffect, useCallback, useRef } from 'react'
import { tauri, type Prerequisites, type Discovery } from './hooks/useTauri'
import { useAppStore } from './store/appStore'
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
  const [isLaunching, setIsLaunching] = useState(false)
  const [showProjectDialog, setShowProjectDialog] = useState(false)
  const [showNewEnvDialog, setShowNewEnvDialog] = useState(false)
  const [brewInstalled, setBrewInstalled] = useState<boolean | null>(null)
  const [logExpanded, setLogExpanded] = useState(true)
  const [embeddedView, setEmbeddedView] = useState<{ url: string; envName: string; envColor: string } | null>(null)
  const [creatingEnvs, setCreatingEnvs] = useState<{ name: string; status: 'cloning' | 'starting' | 'error'; path?: string; error?: string }[]>([])
  const [shouldAutoLaunch, setShouldAutoLaunch] = useState(false)

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
      git_installed: spoofedPrereqs.git_installed ?? real.git_installed,
      docker_installed: spoofedPrereqs.docker_installed ?? real.docker_installed,
      docker_running: spoofedPrereqs.docker_running ?? real.docker_running,
      tailscale_installed: spoofedPrereqs.tailscale_installed ?? real.tailscale_installed,
    }
  }, [spoofedPrereqs])

  // Refresh functions
  const refreshPrerequisites = useCallback(async (silent = false) => {
    try {
      const prereqs = await tauri.checkPrerequisites()
      setPrerequisites(prereqs)

      if (!silent) {
        // Log actual command results
        log(`$ docker --version → ${prereqs.docker_version || 'not found'}`)
        log(`$ docker info → ${prereqs.docker_running ? 'running' : 'not running'}`)
        log(`$ git --version → ${prereqs.git_version || 'not found'}`)
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

  const checkBrew = useCallback(async (silent = false, osOverride?: string) => {
    const currentPlatform = osOverride || platform
    if (currentPlatform !== 'macos') return true
    try {
      const installed = await tauri.checkBrew()
      setBrewInstalled(installed)
      if (!silent) {
        log(`$ brew --version → ${installed ? 'installed' : 'not found'}`)
      }
      return installed
    } catch (err) {
      if (!silent) {
        log(`Failed to check Homebrew: ${err}`, 'error')
      }
      return false
    }
  }, [platform, log])

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

      await checkBrew(false, os)
      await refreshPrerequisites()
      const disc = await refreshDiscovery()

      // Auto-start quick launch if project root was already configured but no environments exist
      if (!isFirstTimeSetup && disc && disc.environments.length === 0) {
        log('No environments found - starting quick launch...', 'step')
        setShouldAutoLaunch(true)
      } else {
        log('Ready', 'success')
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

  // Polling (less frequent, only logs on change)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshPrerequisites(true)
      refreshDiscovery(true)
    }, 30000) // 30 seconds
    return () => clearInterval(interval)
  }, [refreshPrerequisites, refreshDiscovery])

  // Install handlers
  const handleInstall = async (item: 'git' | 'docker' | 'tailscale' | 'homebrew') => {
    setIsInstalling(true)
    log(`Installing ${item}...`, 'step')

    try {
      if (dryRunMode) {
        log(`[DRY RUN] Would install ${item}`, 'warning')
        await new Promise(r => setTimeout(r, 1500)) // Simulate
        log(`[DRY RUN] ${item} installation simulated`, 'success')
        // Auto-spoof success so UI updates
        const spoofKey = item === 'homebrew' ? 'homebrew_installed'
          : item === 'git' ? 'git_installed'
          : item === 'docker' ? 'docker_installed'
          : 'tailscale_installed'
        setSpoofedPrereq(spoofKey, true)
        if (item === 'docker') {
          setSpoofedPrereq('docker_running', true)
        }
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
          case 'docker':
            if (platform === 'macos') {
              if (!brewInstalled) {
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
    }
  }

  const handleStartDocker = async () => {
    setIsInstalling(true)
    log('Starting Docker...', 'step')

    try {
      if (dryRunMode) {
        log('[DRY RUN] Would start Docker', 'warning')
        await new Promise(r => setTimeout(r, 1500))
        log('[DRY RUN] Docker start simulated', 'success')
        // Auto-spoof success so UI updates
        setSpoofedPrereq('docker_running', true)
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
      log(`Failed to start Docker: ${err}`, 'error')
    } finally {
      setIsInstalling(false)
    }
  }

  // Infrastructure handlers
  const handleStartInfra = async () => {
    setIsInstalling(true)
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
      log(`Failed to start infrastructure: ${err}`, 'error')
    } finally {
      setIsInstalling(false)
    }
  }

  const handleStopInfra = async () => {
    setIsInstalling(true)
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
      log(`Failed to stop infrastructure: ${err}`, 'error')
    } finally {
      setIsInstalling(false)
    }
  }

  const handleRestartInfra = async () => {
    setIsInstalling(true)
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
      log(`Failed to restart infrastructure: ${err}`, 'error')
    } finally {
      setIsInstalling(false)
    }
  }

  // Environment handlers
  const handleStartEnv = async (envName: string) => {
    setIsInstalling(true)
    log(`Starting ${envName}...`, 'step')

    try {
      if (dryRunMode) {
        log(`[DRY RUN] Would start ${envName}`, 'warning')
        await new Promise(r => setTimeout(r, 2000))
        log(`[DRY RUN] ${envName} start simulated`, 'success')
      } else {
        const result = await tauri.startEnvironment(envName)
        log(result, 'success')
      }
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to start ${envName}: ${err}`, 'error')
    } finally {
      setIsInstalling(false)
    }
  }

  const handleStopEnv = async (envName: string) => {
    setIsInstalling(true)
    log(`Stopping ${envName}...`, 'step')

    try {
      if (dryRunMode) {
        log(`[DRY RUN] Would stop ${envName}`, 'warning')
        await new Promise(r => setTimeout(r, 1000))
        log(`[DRY RUN] ${envName} stop simulated`, 'success')
      } else {
        const result = await tauri.stopEnvironment(envName)
        log(result, 'success')
      }
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to stop ${envName}: ${err}`, 'error')
    } finally {
      setIsInstalling(false)
    }
  }

  const handleOpenInApp = (env: { name: string; color?: string; localhost_url: string; webui_port: number | null; backend_port: number }) => {
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
      log(`Failed to create environment: ${err}`, 'error')
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
      log(`Failed to link environment: ${err}`, 'error')
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
      log(`Failed to create worktree: ${err}`, 'error')
    } finally {
      setIsLaunching(false)
    }
  }

  // Project setup handlers
  const handleClone = async (path: string) => {
    setShowProjectDialog(false)
    setIsLaunching(true)

    try {
      // Check if repo already exists at this location
      const status = await tauri.checkProjectDir(path)

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
          const result = await tauri.cloneUshadowRepo(path)
          log(result, 'success')
        }
      }

      await tauri.setProjectRoot(path)
      setProjectRoot(path)
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to setup project: ${err}`, 'error')
    } finally {
      setIsLaunching(false)
    }
  }

  const handleLink = async (path: string) => {
    setShowProjectDialog(false)
    log(`Linking to ${path}...`, 'step')

    try {
      await tauri.setProjectRoot(path)
      setProjectRoot(path)
      log('Project linked', 'success')
      await refreshDiscovery()
    } catch (err) {
      log(`Failed to link: ${err}`, 'error')
    }
  }

  // Quick launch (for quick mode)
  const handleQuickLaunch = async () => {
    setIsLaunching(true)
    // Switch to dev mode to show install progress
    setAppMode('dev')
    setLogExpanded(true)
    log('Starting quick launch...', 'step')

    try {
      // Check prerequisites
      const prereqs = getEffectivePrereqs(await refreshPrerequisites())
      if (!prereqs) throw new Error('Failed to check prerequisites')

      // Install missing items
      if (!prereqs.git_installed) {
        await handleInstall('git')
      }
      if (!prereqs.docker_installed) {
        await handleInstall('docker')
      }
      if (!prereqs.docker_running) {
        await handleStartDocker()
        // Wait for Docker
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000))
          const check = getEffectivePrereqs(await refreshPrerequisites())
          if (check?.docker_running) break
        }
      }

      // Clone if needed
      const status = await tauri.checkProjectDir(projectRoot)
      if (!status.is_valid_repo) {
        await handleClone(projectRoot)
      }

      // Start default environment
      await handleStartEnv('default')

      log('Quick launch complete!', 'success')
    } catch (err) {
      log(`Quick launch failed: ${err}`, 'error')
    } finally {
      setIsLaunching(false)
    }
  }

  const effectivePrereqs = getEffectivePrereqs(prerequisites)
  const effectiveBrewInstalled = spoofedPrereqs.homebrew_installed ?? brewInstalled

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
            <button
              onClick={handleQuickLaunch}
              disabled={isLaunching}
              className="px-12 py-4 rounded-xl bg-gradient-brand hover:opacity-90 disabled:opacity-50 transition-all font-semibold text-lg flex items-center gap-3"
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
            {/* Repository Settings Bar */}
            <div className="flex items-center gap-3 px-3 py-2 bg-surface-800 rounded-lg" data-testid="repo-settings-bar">
              <FolderOpen className="w-4 h-4 text-text-muted flex-shrink-0" />
              <span className="text-xs text-text-muted">Repository:</span>
              <span className="text-sm text-text-secondary truncate flex-1" title={projectRoot}>
                {projectRoot || 'Not set'}
              </span>
              <button
                onClick={() => setShowProjectDialog(true)}
                className="p-1.5 rounded hover:bg-surface-700 transition-colors text-text-muted hover:text-text-primary"
                title="Change repository location"
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
                brewInstalled={effectiveBrewInstalled}
                onInstall={handleInstall}
                onStartDocker={handleStartDocker}
              />
              <InfrastructurePanel
                services={discovery?.infrastructure ?? []}
                onStart={handleStartInfra}
                onStop={handleStopInfra}
                onRestart={handleRestartInfra}
                isLoading={isInstalling}
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
                  isLoading={isInstalling}
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
        onClone={handleClone}
        onLink={handleLink}
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
