import { Wand2, Zap, Server, Settings, ArrowRight, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useWizard } from '../contexts/WizardContext'

export default function WizardStartPage() {
  const navigate = useNavigate()
  const { setMode, setCurrentPhase } = useWizard()

  const handleModeSelection = (mode: 'quickstart' | 'local' | 'custom') => {
    setMode(mode)
    setCurrentPhase('memory')
    // Navigate to the first phase (Memory setup)
    navigate('/wizard/memory')
  }

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
          className="group relative card p-8 text-left transition-all hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-primary-500 dark:hover:border-primary-400"
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
              <ArrowRight className="h-5 w-5 text-primary-600 dark:text-primary-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </button>

        {/* Completely Local Option */}
        <button
          onClick={() => handleModeSelection('local')}
          className="group relative card p-8 text-left transition-all hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-blue-500 dark:hover:border-blue-400"
        >
          <div className="flex flex-col h-full">
            {/* Icon */}
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
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
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                Self-Host
              </span>
              <ArrowRight className="h-5 w-5 text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </button>

        {/* Customise Option */}
        <button
          onClick={() => handleModeSelection('custom')}
          className="group relative card p-8 text-left transition-all hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-purple-500 dark:hover:border-purple-400"
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
              <ArrowRight className="h-5 w-5 text-purple-600 dark:text-purple-400 group-hover:translate-x-1 transition-transform" />
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
    </div>
  )
}
