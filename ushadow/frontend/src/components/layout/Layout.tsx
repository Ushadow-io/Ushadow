import { Link, useLocation, Outlet } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { Layers, MessageSquare, Plug, Bot, Workflow, Server, Settings, LogOut, Sun, Moon, Users, Search, Bell, User, ChevronDown, LayoutDashboard, Network, Flag, Wand2, FlaskConical, Cloud, Sparkles, Shield, Mic, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext'
import { useWizard } from '../../contexts/WizardContext'

export default function Layout() {
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const { isEnabled, flags } = useFeatureFlags()
  const { isConnected: isChronicleConnected, recording } = useChronicle()
  const { setupLevel, getSetupLabel } = useWizard()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Helper to check if recording is in a processing state
  const isRecordingProcessing = ['mic', 'websocket', 'audio-start', 'streaming', 'stopping'].includes(recording.currentStep)
  // Get dynamic wizard label based on setup level
  const wizardLabel = getSetupLabel()

  // Icon mapping for setup levels
  const getSetupIcon = () => {
    switch (setupLevel) {
      case 0: return Sparkles
      case 1: return Shield
      case 2: return Mic
      case 3: return CheckCircle2
      default: return Wand2
    }
  }
  const SetupIcon = getSetupIcon()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const navigationItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/chronicle', label: 'Chronicle', icon: MessageSquare },
    { path: '/mcp', label: 'MCP Hub', icon: Plug },
    { path: '/agent-zero', label: 'Agent Zero', icon: Bot },
    { path: '/n8n', label: 'n8n Workflows', icon: Workflow },
    { path: '/services', label: 'Services', icon: Server },
    { path: '/cluster', label: 'Cluster', icon: Network },
    { path: '/kubernetes', label: 'Kubernetes', icon: Cloud },
    { path: '/settings', label: 'Settings', icon: Settings },
    ...(isAdmin ? [
      { path: '/users', label: 'User Management', icon: Users },
    ] : []),
    // Dynamic wizard button based on setup level
    {
      path: wizardLabel.path,
      label: wizardLabel.label,
      icon: SetupIcon,
      separator: true,
      badge: setupLevel < 3 ? `Level ${setupLevel}` : undefined,
    },
  ]

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        backgroundColor: isDark ? 'var(--surface-900)' : '#fafafa',
      }}
      data-testid="layout-container"
    >
      {/* Decorative background blur circles - green and purple from logo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl"
          style={{ backgroundColor: isDark ? 'rgba(168, 85, 247, 0.08)' : 'rgba(168, 85, 247, 0.1)' }}
        />
        <div
          className="absolute top-1/3 -left-40 w-96 h-96 rounded-full blur-3xl"
          style={{ backgroundColor: isDark ? 'rgba(74, 222, 128, 0.06)' : 'rgba(74, 222, 128, 0.08)' }}
        />
        <div
          className="absolute -bottom-40 right-1/4 w-96 h-96 rounded-full blur-3xl"
          style={{ backgroundColor: isDark ? 'rgba(74, 222, 128, 0.05)' : 'rgba(74, 222, 128, 0.08)' }}
        />
      </div>

      {/* Header */}
      <header
        className="sticky top-0 z-sticky backdrop-blur-lg shadow-sm relative"
        style={{
          backgroundColor: isDark ? 'rgba(26, 26, 33, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          borderBottom: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5',
        }}
        data-testid="header"
      >
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Brand */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 flex items-center justify-center">
                <img
                  src="/logo.png"
                  alt="uShadow Logo"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div
                  className="hidden w-10 h-10 rounded-xl items-center justify-center shadow-md"
                  style={{ backgroundImage: 'linear-gradient(135deg, var(--primary-400) 0%, var(--accent-500) 100%)' }}
                >
                  <Layers className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h1
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: isDark ? 'var(--text-primary)' : '#171717' }}
                >
                  Ushadow
                </h1>
                <p
                  className="text-xs"
                  style={{ color: isDark ? 'var(--text-muted)' : '#737373' }}
                >
                  AI Orchestration
                </p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-xl mx-8 hidden md:block">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  placeholder="Search services, workflows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg text-sm transition-all focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: isDark ? 'var(--surface-700)' : '#f5f5f5',
                    border: isDark ? '1px solid var(--surface-500)' : '1px solid transparent',
                    color: isDark ? 'var(--text-primary)' : '#171717',
                    '--tw-ring-color': 'var(--primary-400)',
                  } as React.CSSProperties}
                  data-testid="search-input"
                />
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center space-x-1">
              {/* Chronicle Record Button - only show when connected */}
              {isChronicleConnected && (
                <button
                  onClick={recording.isRecording ? recording.stopRecording : recording.startRecording}
                  disabled={!recording.canAccessMicrophone || (isRecordingProcessing && !recording.isRecording)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg font-medium transition-all ${
                    recording.isRecording
                      ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                      : isRecordingProcessing
                        ? 'bg-amber-500 text-white'
                        : 'bg-primary-600 hover:bg-primary-700 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={recording.isRecording ? 'Stop Recording' : 'Start Recording'}
                  data-testid="chronicle-record-button"
                >
                  {isRecordingProcessing && !recording.isRecording ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : recording.isRecording ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline text-sm">
                    {recording.isRecording
                      ? recording.formatDuration(recording.recordingDuration)
                      : isRecordingProcessing
                        ? 'Starting...'
                        : 'Record'}
                  </span>
                </button>
              )}

              {/* Test Feature Flag Indicator */}
              {isEnabled('example_feature') && (
                <div
                  className="mr-2 flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{
                    backgroundColor: isDark ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.1)',
                    border: isDark ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(168, 85, 247, 0.3)',
                  }}
                >
                  <Flag className="h-4 w-4" style={{ color: 'var(--accent-400)' }} />
                  <span
                    className="text-xs font-medium"
                    style={{ color: isDark ? 'var(--accent-300)' : 'var(--accent-600)' }}
                  >
                    Feature Flag Active
                  </span>
                </div>
              )}

              {/* Search Icon (Mobile) */}
              <button
                className="p-2.5 rounded-lg md:hidden transition-colors"
                style={{
                  color: isDark ? 'var(--text-secondary)' : '#525252',
                }}
                aria-label="Search"
                data-testid="mobile-search-btn"
              >
                <Search className="h-5 w-5" />
              </button>

              {/* Notifications */}
              <button
                className="p-2.5 rounded-lg relative transition-colors"
                style={{
                  color: isDark ? 'var(--text-secondary)' : '#525252',
                }}
                aria-label="Notifications"
                data-testid="notifications-btn"
              >
                <Bell className="h-5 w-5" />
                <span
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'var(--primary-400)' }}
                />
              </button>

              {/* Feature Flags */}
              <Link
                to="/feature-flags"
                className="p-2.5 rounded-lg transition-all relative"
                style={{
                  backgroundColor: location.pathname === '/feature-flags'
                    ? (isDark ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.1)')
                    : 'transparent',
                  color: location.pathname === '/feature-flags'
                    ? 'var(--accent-400)'
                    : (isDark ? 'var(--text-secondary)' : '#525252'),
                }}
                aria-label="Feature Flags"
                data-testid="feature-flags-link"
              >
                <FlaskConical className="h-5 w-5" />
                {(() => {
                  const enabledCount = flags ? Object.values(flags).filter(f => f.enabled).length : 0
                  if (enabledCount > 0) {
                    return (
                      <span
                        className="absolute -top-1 -right-1 min-w-[18px] h-[18px] text-[10px] font-bold rounded-full flex items-center justify-center shadow-md"
                        style={{
                          backgroundColor: 'var(--accent-500)',
                          color: 'white',
                          border: isDark ? '2px solid var(--surface-800)' : '2px solid white',
                        }}
                      >
                        {enabledCount}
                      </span>
                    )
                  }
                  return null
                })()}
              </Link>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2.5 rounded-lg transition-colors"
                style={{
                  color: isDark ? 'var(--text-secondary)' : '#525252',
                }}
                aria-label="Toggle theme"
                data-testid="theme-toggle"
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {/* User Menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 px-2 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: userMenuOpen
                      ? (isDark ? 'var(--surface-700)' : '#f5f5f5')
                      : 'transparent',
                  }}
                  aria-label="User menu"
                  data-testid="user-menu-btn"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundImage: 'linear-gradient(135deg, var(--primary-400) 0%, var(--accent-500) 100%)' }}
                  >
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                    style={{ color: isDark ? 'var(--text-muted)' : '#737373' }}
                  />
                </button>

                {/* Dropdown Menu */}
                {userMenuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-64 rounded-lg shadow-xl py-2 z-dropdown animate-slide-down"
                    style={{
                      backgroundColor: isDark ? 'var(--surface-800)' : 'white',
                      border: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5',
                    }}
                    data-testid="user-dropdown"
                  >
                    {/* User Info */}
                    <div
                      className="px-4 py-3"
                      style={{ borderBottom: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5' }}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center"
                          style={{ backgroundImage: 'linear-gradient(135deg, var(--primary-400) 0%, var(--accent-500) 100%)' }}
                        >
                          <User className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: isDark ? 'var(--text-primary)' : '#171717' }}
                          >
                            {user?.name || 'User'}
                          </p>
                          <p
                            className="text-xs truncate"
                            style={{ color: isDark ? 'var(--text-muted)' : '#737373' }}
                          >
                            {user?.email}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <span
                          className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: isDark ? 'rgba(74, 222, 128, 0.15)' : '#dcfce7',
                            color: isDark ? 'var(--primary-300)' : '#166534',
                          }}
                        >
                          Admin
                        </span>
                      )}
                    </div>

                    {/* Menu Items */}
                    <div className="py-1">
                      <Link
                        to="/settings"
                        className="flex items-center space-x-3 px-4 py-2 text-sm transition-colors"
                        style={{
                          color: isDark ? 'var(--text-secondary)' : '#525252',
                        }}
                        onClick={() => setUserMenuOpen(false)}
                        data-testid="settings-link"
                      >
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </div>

                    {/* Logout */}
                    <div style={{ borderTop: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5', paddingTop: '4px' }}>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false)
                          logout()
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-sm transition-colors"
                        style={{ color: 'var(--error-400)' }}
                        data-testid="logout-btn"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex">
        <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <nav className="lg:w-64 flex-shrink-0" data-testid="sidebar-nav">
            <div
              className="sticky top-24 p-3 space-y-1 backdrop-blur-sm rounded-xl shadow-xl"
              style={{
                backgroundColor: isDark ? 'rgba(26, 26, 33, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                border: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5',
              }}
            >
              {navigationItems.map(({ path, label, icon: Icon, separator, badge }) => {
                const isActive = location.pathname === path ||
                  (path !== '/' && location.pathname.startsWith(path))

                return (
                  <div key={path}>
                    {/* Separator */}
                    {separator && (
                      <div
                        className="my-2"
                        style={{ borderTop: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5' }}
                      />
                    )}

                    <Link
                      to={path}
                      className="group relative flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ease-out overflow-hidden"
                      style={{
                        backgroundColor: isActive
                          ? (isDark ? 'rgba(74, 222, 128, 0.1)' : 'rgba(74, 222, 128, 0.1)')
                          : 'transparent',
                        color: isActive
                          ? 'var(--primary-400)'
                          : (isDark ? 'var(--text-secondary)' : '#525252'),
                      }}
                      data-testid={`nav-${path.replace('/', '') || 'dashboard'}`}
                    >
                      {/* Active indicator bar */}
                      {isActive && (
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full"
                          style={{ backgroundColor: 'var(--primary-400)' }}
                        />
                      )}

                      {/* Icon */}
                      <div
                        className="flex-shrink-0 transition-all duration-200"
                        style={{
                          color: isActive ? 'var(--primary-400)' : 'inherit',
                          transform: isActive ? 'scale(1.1)' : 'scale(1)',
                        }}
                      >
                        <Icon className="h-5 w-5" />
                      </div>

                      {/* Label */}
                      <span className={`ml-3 transition-all duration-200 ${isActive ? 'font-semibold' : ''}`}>
                        {label}
                      </span>

                      {/* Badge for setup level */}
                      {badge && (
                        <span
                          className="ml-auto px-2 py-0.5 text-xs font-medium rounded-full"
                          style={{
                            backgroundColor: isDark ? 'rgba(74, 222, 128, 0.15)' : 'rgba(74, 222, 128, 0.15)',
                            color: 'var(--primary-400)',
                          }}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  </div>
                )
              })}
            </div>
          </nav>

          {/* Main Content */}
          <main className="flex-1 min-w-0 relative" data-testid="main-content">
            <div
              className="p-6 animate-fade-in backdrop-blur-sm rounded-xl shadow-xl overflow-hidden"
              style={{
                backgroundColor: isDark ? 'rgba(26, 26, 33, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                border: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5',
              }}
            >
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer
        className="mt-auto"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : 'white',
          borderTop: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5',
        }}
        data-testid="footer"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div
            className="flex items-center justify-center space-x-2 text-sm"
            style={{ color: isDark ? 'var(--text-muted)' : '#737373' }}
          >
            <Layers className="h-4 w-4" />
            <span>Ushadow v0.1.0</span>
            <span style={{ color: isDark ? 'var(--surface-500)' : '#d4d4d4' }}>•</span>
            <span>AI Orchestration Platform</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
