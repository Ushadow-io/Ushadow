import { MessageSquare, ExternalLink } from 'lucide-react'

export default function ChroniclePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Chronicle</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            AI-powered conversation and memory system
          </p>
        </div>
        <span className="badge badge-neutral">Offline</span>
      </div>

      {/* Status Card */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Connection Status
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Chronicle Backend</span>
            <span className="badge badge-error">Not Connected</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">API Endpoint</span>
            <code className="text-sm text-neutral-600 dark:text-neutral-400">http://localhost:8000</code>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Conversations</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Browse and search your AI conversations
          </p>
          <button className="btn-secondary w-full" disabled>
            View Conversations
          </button>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Memories</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Explore extracted memories and insights
          </p>
          <button className="btn-secondary w-full" disabled>
            Browse Memories
          </button>
        </div>
      </div>

      {/* Setup Instructions */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Getting Started
        </h2>
        <ol className="space-y-3 text-neutral-600 dark:text-neutral-400">
          <li className="flex items-start space-x-2">
            <span className="font-semibold text-primary-600 dark:text-primary-400">1.</span>
            <span>Configure Chronicle URL in Settings</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="font-semibold text-primary-600 dark:text-primary-400">2.</span>
            <span>Ensure Chronicle backend is running</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="font-semibold text-primary-600 dark:text-primary-400">3.</span>
            <span>Verify connection and start using features</span>
          </li>
        </ol>
        <div className="mt-6">
          <a
            href="https://github.com/chronicler-ai/chronicle"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center space-x-2"
          >
            <span>Chronicle Documentation</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  )
}
