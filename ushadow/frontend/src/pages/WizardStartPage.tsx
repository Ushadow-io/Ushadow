import { useState } from 'react'
import { Wand2, Zap, Server, Settings, ArrowRight, CheckCircle, Link, FlaskConical, Loader2 } from 'lucide-react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { useWizard } from '../contexts/WizardContext'

export default function WizardStartPage() {
  const navigate = useNavigate()
  const { setMode, setCurrentPhase, applyDefaultProviders } = useWizard()
  const [loadingMode, setLoadingMode] = useState<string | null>(null)

  const handleModeSelection = async (mode: 'quickstart' | 'local' | 'custom') => {
    setLoadingMode(mode)
    setMode(mode)
    setCurrentPhase('quickstart')

    try {
      // Apply default providers based on mode
      // Quickstart = cloud defaults, Local = local defaults, Custom = cloud defaults (user can change)
      const providerMode = mode === 'local' ? 'local' : 'cloud'
      await applyDefaultProviders(providerMode)
    } catch (error) {
      console.warn('Failed to apply default providers:', error)
      // Continue anyway - defaults will be used
    }

    // Navigate to quickstart wizard (asks for required API keys)
    navigate('/wizard/quickstart')
    setLoadingMode(null)
  }

  // All available wizards for testing
  const availableWizards = [
    { path: '/wizard/quickstart', label: 'Quickstart', description: 'Configure API keys' },
    { path: '/wizard/chronicle', label: 'Chronicle', description: 'Conversation engine setup' },
    { path: '/wizard/memory', label: 'Memory', description: 'OpenMemory setup' },
    { path: '/wizard/tailscale', label: 'Tailscale', description: 'Secure remote access' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center space-x-3 mb-4">
          <Wand2 className="h-12 w-12 text-primary-600 dark:text-primary-400" />
        </div>
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">
          Welcome to Ushadow
        </h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
          Let's get your AI orchestration platform set up. Choose the path that works best for you.
        </p>
      </div>

      {/* Mode Selection Cards */}
      <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {/* Quickstart Option */}
        <button
          onClick={() => handleModeSelection('quickstart')}
          disabled={loadingMode !== null}
          className="group relative card p-8 text-left transition-all hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-primary-500 dark:hover:border-primary-400 disabled:opacity-70 disabled:cursor-wait"
        >
          {/* Recommended Badge */}
          <div className="absolute top-3 right-3">
            <span className="badge badge-primary px-3 py-1 text-xs font-semibold shadow-lg whitespace-nowrap">
              Recommended
            </span>
          </div>

          <div className="flex flex-col h-full">
            {/* Icon */}
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Zap className="h-8 w-8 text-white" />
            </div>

            {/* Title & Description */}
            <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">
              Quickstart
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6 flex-1">
              Get up and running in minutes with cloud services. Perfect for beginners and trying out Ushadow.
            </p>

            {/* Features */}
            <div className="space-y-2 mb-6">
              <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400">
                <CheckCircle className="h-4 w-4 text-success-500 mr-2" />
                <span>Fastest setup (~5 minutes)</span>
              </div>
              <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400">
                <CheckCircle className="h-4 w-4 text-success-500 mr-2" />
                <span>Managed cloud services</span>
              </div>
              <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400">
                <CheckCircle className="h-4 w-4 text-success-500 mr-2" />
                <span>No infrastructure to manage</span>
              </div>
            </div>

            {/* CTA */}
            <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                Start Now
              </span>
              {loadingMode === 'quickstart' ? (
                <Loader2 className="h-5 w-5 text-primary-600 dark:text-primary-400 animate-spin" />
              ) : (
                <ArrowRight className="h-5 w-5 text-primary-600 dark:text-primary-400 group-hover:translate-x-1 transition-transform" />
              )}
            </div>
          </div>
        </button>

        {/* Completely Local Option */}
        <button
          onClick={() => handleModeSelection('local')}
          disabled={loadingMode !== null}
          className="group relative card p-8 text-left transition-all hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-primary-500 dark:hover:border-primary-400 disabled:opacity-70 disabled:cursor-wait"
        >
          <div className="flex flex-col h-full">
            {/* Icon */}
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Server className="h-8 w-8 text-white" />
            </div>

            {/* Title & Description */}
            <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">
              Completely Local
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6 flex-1">
              Self-hosted and private. All services run on your infrastructure with full control.
            </p>

            {/* Features */}
            <div className="space-y-2 mb-6">
              <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400">
                <CheckCircle className="h-4 w-4 text-success-500 mr-2" />
                <span>100% self-hosted</span>
              </div>
              <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400">
                <CheckCircle className="h-4 w-4 text-success-500 mr-2" />
                <span>Complete data privacy</span>
              </div>
              <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400">
                <CheckCircle className="h-4 w-4 text-success-500 mr-2" />
                <span>Docker-based setup</span>
              </div>
            </div>

            {/* CTA */}
            <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <span className="text-sm font-medium text-accent-600 dark:text-accent-400">
                Self-Host
              </span>
              {loadingMode === 'local' ? (
                <Loader2 className="h-5 w-5 text-accent-600 dark:text-accent-400 animate-spin" />
              ) : (
                <ArrowRight className="h-5 w-5 text-accent-600 dark:text-accent-400 group-hover:translate-x-1 transition-transform" />
              )}
            </div>
          </div>
        </button>

        {/* Customise Option */}
        <button
          onClick={() => handleModeSelection('custom')}
          disabled={loadingMode !== null}
          className="group relative card p-8 text-left transition-all hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-purple-500 dark:hover:border-purple-400 disabled:opacity-70 disabled:cursor-wait"
        >
          <div className="flex flex-col h-full">
            {/* Icon */}
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Settings className="h-8 w-8 text-white" />
            </div>

            {/* Title & Description */}
            <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">
              Customise
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6 flex-1">
              Mix and match cloud and local services. Fine-tune every aspect of your setup.
            </p>

            {/* Features */}
            <div className="space-y-2 mb-6">
              <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400">
                <CheckCircle className="h-4 w-4 text-success-500 mr-2" />
                <span>Full control over services</span>
              </div>
              <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400">
                <CheckCircle className="h-4 w-4 text-success-500 mr-2" />
                <span>Hybrid cloud/local options</span>
              </div>
              <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400">
                <CheckCircle className="h-4 w-4 text-success-500 mr-2" />
                <span>Advanced configuration</span>
              </div>
            </div>

            {/* CTA */}
            <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                Configure
              </span>
              {loadingMode === 'custom' ? (
                <Loader2 className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-spin" />
              ) : (
                <ArrowRight className="h-5 w-5 text-purple-600 dark:text-purple-400 group-hover:translate-x-1 transition-transform" />
              )}
            </div>
          </div>
        </button>
      </div>

      {/* Footer Help Text */}
      <div className="text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Don't worry - you can always change these settings later in your configuration
        </p>
      </div>

      {/* Wizard Links - Testing Section */}
      <div className="card p-6 bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800">
        <div className="flex items-center gap-2 mb-4">
          <FlaskConical className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">
            All Wizards (Testing)
          </h3>
        </div>
        <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
          Direct links to all available setup wizards for testing purposes.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {availableWizards.map((wizard) => (
            <RouterLink
              key={wizard.path}
              to={wizard.path}
              id={`wizard-link-${wizard.label.toLowerCase()}`}
              className="p-4 rounded-lg bg-white dark:bg-neutral-800 border border-purple-200 dark:border-purple-700 hover:border-purple-400 dark:hover:border-purple-500 transition-all hover:shadow-md group"
            >
              <div className="flex items-center gap-2 mb-1">
                <Link className="h-4 w-4 text-purple-500 group-hover:text-purple-600 dark:text-purple-400" />
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {wizard.label}
                </span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                {wizard.description}
              </p>
            </RouterLink>
          ))}
        </div>
      </div>
    </div>
  )
}
