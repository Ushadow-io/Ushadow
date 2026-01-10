import { AlertCircle, RefreshCw } from 'lucide-react'

interface ErrorPageProps {
  error: string
  onRetry?: () => void
}

export default function ErrorPage({ error, onRetry }: ErrorPageProps) {
  return (
    <div
      className="flex-1 flex flex-col relative overflow-hidden"
      style={{ backgroundColor: 'var(--surface-900)' }}
      data-testid="error-page"
    >
      <div className="flex-1 flex items-center justify-center py-4 px-4 sm:px-6 lg:px-8">
        {/* Decorative background blur circles */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl"
            style={{ backgroundColor: 'rgba(248, 113, 113, 0.15)' }}
          ></div>
          <div
            className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl"
            style={{ backgroundColor: 'rgba(251, 146, 60, 0.15)' }}
          ></div>
        </div>

        <div className="max-w-md w-full space-y-3 relative z-10">
          {/* Error Icon and Header */}
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div
                className="rounded-full p-4"
                style={{
                  backgroundColor: 'rgba(248, 113, 113, 0.1)',
                  border: '2px solid rgba(248, 113, 113, 0.3)',
                }}
              >
                <AlertCircle
                  className="h-12 w-12"
                  style={{ color: 'var(--error-400)' }}
                />
              </div>
            </div>
            <h2
              className="text-2xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Backend Error
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              The application encountered a startup error
            </p>
          </div>

          {/* Error Message */}
          <div
            className="rounded-xl shadow-xl backdrop-blur-sm p-6 space-y-4"
            style={{
              backgroundColor: 'var(--surface-800)',
              border: '1px solid var(--surface-500)',
            }}
          >
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: 'rgba(248, 113, 113, 0.1)',
                border: '1px solid rgba(248, 113, 113, 0.3)',
              }}
            >
              <p
                className="text-sm whitespace-pre-wrap"
                style={{ color: 'var(--error-400)' }}
                data-testid="error-message"
              >
                {error}
              </p>
            </div>

            {/* Troubleshooting Steps */}
            <div className="space-y-2">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Troubleshooting steps:
              </p>
              <ul
                className="text-sm space-y-1 list-disc list-inside"
                style={{ color: 'var(--text-muted)' }}
              >
                <li>Check Docker container logs: <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-700)' }}>docker logs ushadow-backend</code></li>
                <li>Verify configuration files in <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-700)' }}>config/SECRETS/</code></li>
                <li>Try restarting with: <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-700)' }}>./go.sh</code></li>
                <li>Check backend health: <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--surface-700)' }}>curl http://localhost:8000/health</code></li>
              </ul>
            </div>

            {/* Retry Button */}
            {onRetry && (
              <div>
                <button
                  onClick={onRetry}
                  className="w-full py-3 px-4 text-base font-semibold rounded-lg shadow-md hover:shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2"
                  style={{
                    backgroundColor: 'var(--error-500)',
                    color: 'white',
                  }}
                  data-testid="error-retry-button"
                >
                  <RefreshCw className="h-5 w-5" />
                  <span>Retry Connection</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
