import { Layers, Mail } from 'lucide-react'
import { getColorClasses } from './EnvironmentBanner'
import { useTheme } from '../../contexts/ThemeContext'

/**
 * Global environment footer that appears on all pages.
 * Shows the environment name (in development mode) with environment-specific colors,
 * plus version and product info.
 */
export default function EnvironmentFooter() {
  const { isDark } = useTheme()
  const envName = import.meta.env.VITE_ENV_NAME as string | undefined
  const nodeEnv = import.meta.env.MODE

  // Get environment-specific colors
  const { bg, text, border } = getColorClasses(envName)

  // Only show environment indicator in development mode
  const showEnvIndicator = nodeEnv === 'development' && envName

  // Check if we're running inside the launcher (via query parameter)
  const isInLauncher = new URLSearchParams(window.location.search).has('launcher')

  // Don't render footer when in launcher
  if (isInLauncher) {
    return null
  }

  return (
    <footer
      className={`mt-auto ${showEnvIndicator ? `${bg} border-t-2 ${border}` : ''}`}
      style={!showEnvIndicator ? {
        backgroundColor: isDark ? 'var(--surface-800)' : 'white',
        borderTop: isDark ? '1px solid var(--surface-500)' : '1px solid #e5e5e5',
      } : undefined}
      data-testid="environment-footer"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-center space-x-3 text-sm">
          {showEnvIndicator && (
            <>
              <span className={`font-semibold ${text}`}>
                <span className="font-bold uppercase">{envName}</span>
                <span className="ml-1.5 opacity-75">environment</span>
              </span>
              <span className={text} style={{ opacity: 0.4 }}>•</span>
            </>
          )}
          <div
            className="flex items-center space-x-2"
            style={{ color: showEnvIndicator ? undefined : (isDark ? 'var(--text-muted)' : '#737373') }}
          >
            <Layers className={`h-4 w-4 ${showEnvIndicator ? text : ''}`} />
            <span className={showEnvIndicator ? text : ''}>Ushadow v0.1.0</span>
          </div>
          <span className={showEnvIndicator ? text : ''} style={{ opacity: 0.4 }}>•</span>
          <a
            href="https://buttondown.com/thestumonkey"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition-all hover:opacity-80"
            style={{
              backgroundColor: isDark ? 'var(--primary-600)' : 'var(--primary-500)',
              color: 'white',
            }}
            data-testid="newsletter-signup-link"
          >
            <Mail className="h-3.5 w-3.5" />
            <span className="font-medium">Get Updates</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
