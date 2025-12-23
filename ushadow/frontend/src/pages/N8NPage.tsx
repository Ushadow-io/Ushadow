import { Workflow, Plus, GitBranch } from 'lucide-react'

export default function N8NPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Workflow className="h-8 w-8 text-info-600 dark:text-info-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">n8n Workflows</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Visual workflow automation and orchestration
          </p>
        </div>
        <button className="btn-primary flex items-center space-x-2">
          <Plus className="h-5 w-5" />
          <span>New Workflow</span>
        </button>
      </div>

      {/* Status Card */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Connection Status
        </h2>
        <div className="flex items-center justify-between">
          <span className="text-neutral-600 dark:text-neutral-400">n8n Instance</span>
          <span className="badge badge-error">Not Connected</span>
        </div>
      </div>

      {/* Empty State */}
      <div className="card p-12 text-center">
        <GitBranch className="h-16 w-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          No Workflows Yet
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Create powerful automation workflows by connecting different services and APIs.
        </p>
        <button className="btn-primary inline-flex items-center space-x-2">
          <Plus className="h-5 w-5" />
          <span>Create First Workflow</span>
        </button>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Visual Editor</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Design workflows with drag-and-drop interface
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">400+ Integrations</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Connect with popular services and APIs
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Custom Nodes</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Build your own workflow nodes
          </p>
        </div>
      </div>

      {/* Setup Instructions */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Getting Started
        </h2>
        <ol className="space-y-3 text-neutral-600 dark:text-neutral-400">
          <li className="flex items-start space-x-2">
            <span className="font-semibold text-info-600 dark:text-info-400">1.</span>
            <span>Configure n8n URL and credentials in Settings</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="font-semibold text-info-600 dark:text-info-400">2.</span>
            <span>Ensure n8n instance is running and accessible</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="font-semibold text-info-600 dark:text-info-400">3.</span>
            <span>Start creating automated workflows</span>
          </li>
        </ol>
      </div>
    </div>
  )
}
