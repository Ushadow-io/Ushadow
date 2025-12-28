import { Link, useLocation, Outlet } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { Layers, MessageSquare, Plug, Bot, Workflow, Server, Settings, LogOut, Sun, Moon, Users, Search, Bell, User, ChevronDown, LayoutDashboard, Network, Flag, Wand2, FlaskConical } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext'

export default function Layout() {
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const { isEnabled, flags } = useFeatureFlags()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const userMenuRef = useRef<HTMLDivElement>(null)

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
    { path: '/settings', label: 'Settings', icon: Settings },
    ...(isAdmin ? [
      { path: '/users', label: 'User Management', icon: Users },
    ] : []),
    { path: '/wizard/start', label: 'Setup Wizard', icon: Wand2, separator: true },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-emerald-50/20 to-neutral-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 flex flex-col relative overflow-hidden">
      {/* Decorative background blur circles - emerald green and fuchsia from logo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-fuchsia-400/20 dark:bg-fuchsia-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -left-40 w-96 h-96 bg-emerald-400/15 dark:bg-emerald-500/8 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 right-1/4 w-96 h-96 bg-emerald-300/15 dark:bg-emerald-600/8 rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-sticky bg-white/80 dark:bg-neutral-800/80 backdrop-blur-lg border-b border-neutral-200 dark:border-neutral-700 shadow-sm relative">
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
                    // Fallback to icon if logo doesn't load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div className="hidden w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl items-center justify-center shadow-md">
                  <Layers className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
                  Ushadow
                </h1>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">AI Orchestration</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-xl mx-8 hidden md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search services, workflows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-neutral-100 dark:bg-neutral-700/50 border border-transparent rounded-lg text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center space-x-1">
              {/* Test Feature Flag Indicator */}
              {isEnabled('example_feature') && (
                <div className="mr-2 flex items-center gap-2 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 rounded-lg">
                  <Flag className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                    Feature Flag Active
                  </span>
                </div>
              )}

              {/* Search Icon (Mobile) */}
              <button
                className="btn-ghost p-2.5 rounded-lg md:hidden"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </button>

              {/* Notifications */}
              <button
                className="btn-ghost p-2.5 rounded-lg relative"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {/* Notification badge */}
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary-500 rounded-full"></span>
              </button>

              {/* Feature Flags */}
              <Link
                to="/feature-flags"
                className={`btn-ghost p-2.5 rounded-lg transition-all relative ${
                  location.pathname === '/feature-flags'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                    : 'hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600 dark:hover:text-purple-400'
                }`}
                aria-label="Feature Flags"
              >
                <FlaskConical className="h-5 w-5" />
                {/* Triangular badge with count */}
                {(() => {
                  const enabledCount = flags ? Object.values(flags).filter(f => f.enabled).length : 0
                  if (enabledCount > 0) {
                    return (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-purple-500 dark:bg-purple-400 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-neutral-800">
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
                className="btn-ghost p-2.5 rounded-lg"
                aria-label="Toggle theme"
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {/* User Menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 px-2 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                  aria-label="User menu"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <ChevronDown className={`h-4 w-4 text-neutral-600 dark:text-neutral-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 py-2 z-dropdown animate-slide-down">
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {user?.name || 'User'}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                            {user?.email}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <span className="badge badge-primary mt-2 inline-block">Admin</span>
                      )}
                    </div>

                    {/* Menu Items */}
                    <div className="py-1">
                      <Link
                        to="/settings"
                        className="flex items-center space-x-3 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </div>

                    {/* Logout */}
                    <div className="border-t border-neutral-200 dark:border-neutral-700 pt-1">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false)
                          logout()
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20 transition-colors"
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
          <nav className="lg:w-64 flex-shrink-0">
            <div className="card sticky top-24 p-3 space-y-1 backdrop-blur-sm bg-white/90 dark:bg-neutral-800/90 shadow-xl">
              {navigationItems.map(({ path, label, icon: Icon, separator }) => {
                const isActive = location.pathname === path ||
                  (path !== '/' && location.pathname.startsWith(path))

                return (
                  <div key={path}>
                    {/* Separator */}
                    {separator && (
                      <div className="my-2 border-t border-neutral-200 dark:border-neutral-700"></div>
                    )}

                    <Link
                      to={path}
                      className={`
                        group relative flex items-center px-3 py-2.5 rounded-lg text-sm font-medium
                        transition-all duration-200 ease-out overflow-hidden
                        ${isActive
                          ? 'bg-gradient-to-r from-primary-100 to-primary-50 dark:from-primary-900/30 dark:to-primary-900/10 text-primary-700 dark:text-primary-300 shadow-sm'
                          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 hover:text-neutral-900 dark:hover:text-neutral-100'
                        }
                      `}
                    >
                      {/* Active indicator bar */}
                      {isActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-600 dark:bg-primary-500 rounded-r-full"></div>
                      )}

                      {/* Icon with scale effect */}
                      <div className={`
                        flex-shrink-0 transition-all duration-200
                        ${isActive
                          ? 'scale-110 text-primary-600 dark:text-primary-400'
                          : 'group-hover:scale-110 group-hover:text-primary-600 dark:group-hover:text-primary-400'
                        }
                      `}>
                        <Icon className="h-5 w-5" />
                      </div>

                      {/* Label */}
                      <span className={`
                        ml-3 transition-all duration-200
                        ${isActive ? 'font-semibold' : ''}
                      `}>
                        {label}
                      </span>

                      {/* Shine effect on hover - clipped by overflow-hidden */}
                      {!isActive && (
                        <div className="absolute inset-0 translate-x-full group-hover:-translate-x-full bg-gradient-to-r from-transparent via-white/10 dark:via-white/5 to-transparent transition-transform duration-300 pointer-events-none"></div>
                      )}
                    </Link>
                  </div>
                )
              })}
            </div>
          </nav>

          {/* Main Content */}
          <main className="flex-1 min-w-0 relative">
            <div className="card p-6 animate-fade-in backdrop-blur-sm bg-white/90 dark:bg-neutral-800/90 shadow-xl overflow-hidden">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center space-x-2 text-sm text-neutral-500 dark:text-neutral-400">
            <Layers className="h-4 w-4" />
            <span>Ushadow v0.1.0</span>
            <span className="text-neutral-300 dark:text-neutral-600">•</span>
            <span>AI Orchestration Platform</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
