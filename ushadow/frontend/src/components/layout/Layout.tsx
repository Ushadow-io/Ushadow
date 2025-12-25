import { Link, useLocation, Outlet } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { Layers, MessageSquare, Plug, Bot, Workflow, Server, Settings, LogOut, Sun, Moon, Users, Search, Bell, User, ChevronDown, LayoutDashboard, Network } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

export default function Layout() {
  const location = useLocation()
  const { user, logout, isAdmin } = useAuth()
  const { isDark, toggleTheme } = useTheme()
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
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-blue-50/30 to-neutral-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 flex flex-col relative overflow-hidden">
      {/* Decorative background blur circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -left-40 w-96 h-96 bg-blue-300/15 dark:bg-blue-600/8 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 right-1/4 w-96 h-96 bg-blue-200/15 dark:bg-blue-700/8 rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-sticky bg-white/80 dark:bg-neutral-800/80 backdrop-blur-lg border-b border-neutral-200 dark:border-neutral-700 shadow-sm relative">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Brand */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md">
                <Layers className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
                  ushadow
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
              {navigationItems.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path ||
                  (path !== '/' && location.pathname.startsWith(path))

                return (
                  <Link
                    key={path}
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
                )
              })}
            </div>
          </nav>

          {/* Main Content */}
          <main className="flex-1 min-w-0 relative">
            <div className="card p-6 animate-fade-in backdrop-blur-sm bg-white/90 dark:bg-neutral-800/90 shadow-xl">
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
            <span>ushadow v0.1.0</span>
            <span className="text-neutral-300 dark:text-neutral-600">•</span>
            <span>AI Orchestration Platform</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
