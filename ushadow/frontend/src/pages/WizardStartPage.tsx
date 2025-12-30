import { Wand2, Zap, Server, Settings, ArrowRight, CheckCircle, Link, FlaskConical } from 'lucide-react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { useWizard } from '../contexts/WizardContext'
import { useTheme } from '../contexts/ThemeContext'

export default function WizardStartPage() {
  const navigate = useNavigate()
  const { setMode, setCurrentPhase } = useWizard()
  const { isDark } = useTheme()

  const handleModeSelection = (mode: 'quickstart' | 'local' | 'custom') => {
    setMode(mode)
    setCurrentPhase('quickstart')
    // Navigate to appropriate wizard based on mode
    if (mode === 'local') {
      navigate('/wizard/local')
    } else {
      navigate('/wizard/quickstart')
    }
  }

  // All available wizards for testing
  const availableWizards = [
    { path: '/wizard/quickstart', label: 'Quickstart', description: 'Configure API keys' },
    { path: '/wizard/local', label: 'Local Services', description: 'Local LLM & transcription' },
    { path: '/wizard/chronicle', label: 'Chronicle', description: 'Conversation engine setup' },
    { path: '/wizard/memory', label: 'Memory', description: 'OpenMemory setup' },
    { path: '/wizard/tailscale', label: 'Tailscale', description: 'Secure remote access' },
  ]

  return (
    <div className="space-y-8" data-testid="wizard-start-page">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center space-x-3 mb-4">
          <Wand2 className="h-12 w-12" style={{ color: '#4ade80' }} />
        </div>
        <h1
          className="text-4xl font-bold mb-3"
          style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
        >
          Welcome to Ushadow
        </h1>
        <p
          className="text-lg max-w-2xl mx-auto"
          style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
        >
          Let's get your AI orchestration platform set up. Choose the path that works best for you.
        </p>
      </div>

      {/* Mode Selection Cards */}
      <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {/* Quickstart Option */}
        <button
          onClick={() => handleModeSelection('quickstart')}
          data-testid="wizard-option-quickstart"
          className="group relative p-8 text-left transition-all hover:scale-105 rounded-xl"
          style={{
            backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
            border: `2px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
            boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#4ade80';
            e.currentTarget.style.boxShadow = isDark
              ? '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(74, 222, 128, 0.2)'
              : '0 10px 25px rgba(0, 0, 0, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDark ? 'var(--surface-500)' : '#e4e4e7';
            e.currentTarget.style.boxShadow = isDark
              ? '0 4px 6px rgba(0, 0, 0, 0.4)'
              : '0 4px 6px rgba(0, 0, 0, 0.1)';
          }}
        >
          {/* Recommended Badge */}
          <div className="absolute top-3 right-3">
            <span
              className="px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap"
              style={{
                backgroundColor: 'rgba(74, 222, 128, 0.2)',
                color: '#4ade80',
              }}
            >
              Recommended
            </span>
          </div>

          <div className="flex flex-col h-full">
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"
              style={{ background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)' }}
            >
              <Zap className="h-8 w-8 text-white" />
            </div>

            {/* Title & Description */}
            <h3
              className="text-2xl font-bold mb-3"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Quickstart
            </h3>
            <p
              className="mb-6 flex-1"
              style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
            >
              Get up and running in minutes with cloud services. Perfect for beginners and trying out Ushadow.
            </p>

            {/* Features */}
            <div className="space-y-2 mb-6">
              {['Fastest setup (~5 minutes)', 'Managed cloud services', 'No infrastructure to manage'].map((feature) => (
                <div key={feature} className="flex items-center text-sm" style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
                  <CheckCircle className="h-4 w-4 mr-2" style={{ color: '#4ade80' }} />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div
              className="flex items-center justify-between pt-4"
              style={{ borderTop: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}` }}
            >
              <span className="text-sm font-medium" style={{ color: '#4ade80' }}>
                Start Now
              </span>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" style={{ color: '#4ade80' }} />
            </div>
          </div>
        </button>

        {/* Completely Local Option */}
        <button
          onClick={() => handleModeSelection('local')}
          data-testid="wizard-option-local"
          className="group relative p-8 text-left transition-all hover:scale-105 rounded-xl"
          style={{
            backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
            border: `2px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
            boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#22c55e';
            e.currentTarget.style.boxShadow = isDark
              ? '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(34, 197, 94, 0.2)'
              : '0 10px 25px rgba(0, 0, 0, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDark ? 'var(--surface-500)' : '#e4e4e7';
            e.currentTarget.style.boxShadow = isDark
              ? '0 4px 6px rgba(0, 0, 0, 0.4)'
              : '0 4px 6px rgba(0, 0, 0, 0.1)';
          }}
        >
          <div className="flex flex-col h-full">
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"
              style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
            >
              <Server className="h-8 w-8 text-white" />
            </div>

            {/* Title & Description */}
            <h3
              className="text-2xl font-bold mb-3"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Completely Local
            </h3>
            <p
              className="mb-6 flex-1"
              style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
            >
              Self-hosted and private. All services run on your infrastructure with full control.
            </p>

            {/* Features */}
            <div className="space-y-2 mb-6">
              {['100% self-hosted', 'Complete data privacy', 'Docker-based setup'].map((feature) => (
                <div key={feature} className="flex items-center text-sm" style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
                  <CheckCircle className="h-4 w-4 mr-2" style={{ color: '#4ade80' }} />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div
              className="flex items-center justify-between pt-4"
              style={{ borderTop: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}` }}
            >
              <span className="text-sm font-medium" style={{ color: '#22c55e' }}>
                Self-Host
              </span>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" style={{ color: '#22c55e' }} />
            </div>
          </div>
        </button>

        {/* Customise Option */}
        <button
          onClick={() => handleModeSelection('custom')}
          data-testid="wizard-option-custom"
          className="group relative p-8 text-left transition-all hover:scale-105 rounded-xl"
          style={{
            backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
            border: `2px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
            boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#a855f7';
            e.currentTarget.style.boxShadow = isDark
              ? '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(168, 85, 247, 0.2)'
              : '0 10px 25px rgba(0, 0, 0, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isDark ? 'var(--surface-500)' : '#e4e4e7';
            e.currentTarget.style.boxShadow = isDark
              ? '0 4px 6px rgba(0, 0, 0, 0.4)'
              : '0 4px 6px rgba(0, 0, 0, 0.1)';
          }}
        >
          <div className="flex flex-col h-full">
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"
              style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)' }}
            >
              <Settings className="h-8 w-8 text-white" />
            </div>

            {/* Title & Description */}
            <h3
              className="text-2xl font-bold mb-3"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Customise
            </h3>
            <p
              className="mb-6 flex-1"
              style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
            >
              Mix and match cloud and local services. Fine-tune every aspect of your setup.
            </p>

            {/* Features */}
            <div className="space-y-2 mb-6">
              {['Full control over services', 'Hybrid cloud/local options', 'Advanced configuration'].map((feature) => (
                <div key={feature} className="flex items-center text-sm" style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
                  <CheckCircle className="h-4 w-4 mr-2" style={{ color: '#4ade80' }} />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div
              className="flex items-center justify-between pt-4"
              style={{ borderTop: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}` }}
            >
              <span className="text-sm font-medium" style={{ color: '#a855f7' }}>
                Configure
              </span>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" style={{ color: '#a855f7' }} />
            </div>
          </div>
        </button>
      </div>

      {/* Footer Help Text */}
      <div className="text-center">
        <p className="text-sm" style={{ color: isDark ? 'var(--text-muted)' : '#a1a1aa' }}>
          Don't worry - you can always change these settings later in your configuration
        </p>
      </div>

      {/* Wizard Links - Testing Section */}
      <div
        className="rounded-xl p-6"
        style={{
          backgroundColor: isDark ? 'rgba(168, 85, 247, 0.1)' : 'rgba(168, 85, 247, 0.05)',
          border: `1px solid ${isDark ? 'rgba(168, 85, 247, 0.3)' : 'rgba(168, 85, 247, 0.2)'}`,
        }}
        data-testid="wizard-testing-section"
      >
        <div className="flex items-center gap-2 mb-4">
          <FlaskConical className="h-5 w-5" style={{ color: '#a855f7' }} />
          <h3
            className="text-lg font-semibold"
            style={{ color: isDark ? '#c084fc' : '#7e22ce' }}
          >
            All Wizards (Testing)
          </h3>
        </div>
        <p
          className="text-sm mb-4"
          style={{ color: isDark ? '#c084fc' : '#9333ea' }}
        >
          Direct links to all available setup wizards for testing purposes.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {availableWizards.map((wizard) => (
            <RouterLink
              key={wizard.path}
              to={wizard.path}
              id={`wizard-link-${wizard.label.toLowerCase()}`}
              className="p-4 rounded-lg transition-all hover:shadow-md group"
              style={{
                backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
                border: `1px solid ${isDark ? 'rgba(168, 85, 247, 0.3)' : 'rgba(168, 85, 247, 0.2)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Link className="h-4 w-4" style={{ color: '#a855f7' }} />
                <span
                  className="font-medium"
                  style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
                >
                  {wizard.label}
                </span>
              </div>
              <p
                className="text-xs"
                style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
              >
                {wizard.description}
              </p>
            </RouterLink>
          ))}
        </div>
      </div>
    </div>
  )
}
