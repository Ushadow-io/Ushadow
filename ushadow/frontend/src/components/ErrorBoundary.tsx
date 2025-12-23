import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Always log errors to console for debugging
    console.error('❌ ErrorBoundary caught an error:', error)
    console.error('📍 Component stack:', errorInfo.componentStack)
    console.error('📝 Error stack:', error.stack)

    this.setState({
      error,
      errorInfo
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full card p-6 text-center animate-fade-in">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-error-500" />
            </div>

            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Something went wrong
            </h2>

            <p className="text-neutral-600 dark:text-neutral-400 mb-6">
              An unexpected error occurred. You can try refreshing the page or go back to the dashboard.
            </p>

            {this.state.error && (
              <details className="mb-4 text-left">
                <summary className="cursor-pointer text-sm font-mono text-error-600 dark:text-error-400">
                  Error Details (Always Shown for Debugging)
                </summary>
                <pre className="mt-2 text-xs bg-neutral-100 dark:bg-neutral-700 p-2 rounded overflow-auto max-h-40">
                  <strong>Error:</strong> {this.state.error.toString()}
                  {this.state.error.stack && (
                    <>
                      {'\n\n'}<strong>Stack:</strong>
                      {'\n'}{this.state.error.stack}
                    </>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      {'\n\n'}<strong>Component Stack:</strong>
                      {'\n'}{this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}

            <div className="flex space-x-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="btn-primary flex items-center space-x-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Try Again</span>
              </button>

              <button
                onClick={this.handleGoHome}
                className="btn-secondary flex items-center space-x-2"
              >
                <Home className="h-4 w-4" />
                <span>Go Home</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Lightweight error boundary for individual components
export const PageErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallback={
      <div className="bg-error-50 dark:bg-error-900/10 border border-error-200 dark:border-error-800 rounded-lg p-6 m-4">
        <div className="flex items-center space-x-2 text-error-700 dark:text-error-400 mb-3">
          <AlertTriangle className="h-6 w-6" />
          <span className="font-medium text-lg">Page Loading Error</span>
        </div>
        <p className="text-error-600 dark:text-error-300 mb-4">
          This page encountered an error. Check the browser console for details.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-destructive"
        >
          Reload Page
        </button>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
)
