import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'

interface StartupConfigPanelProps {
  projectRoot: string
  onSave?: (config: StartupConfig) => void
}

export interface StartupConfig {
  command: string
}

export function StartupConfigPanel({ projectRoot, onSave }: StartupConfigPanelProps) {
  const [command, setCommand] = useState('')
  const [isSaved, setIsSaved] = useState(false)

  // Load existing config if available
  useEffect(() => {
    // TODO: Load from backend
    setCommand('./go.sh')
  }, [projectRoot])

  const handleSave = () => {
    const config: StartupConfig = { command }

    console.log('Saving startup config:', config)
    if (onSave) onSave(config)

    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  return (
    <div className="bg-surface-800 rounded-lg p-6" data-testid="startup-config-panel">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Environment Startup</h3>
        <button
          onClick={handleSave}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all
            ${isSaved
              ? 'bg-green-500/20 text-green-400'
              : 'bg-primary-500 hover:bg-primary-600 text-white'
            }
          `}
          data-testid="save-startup-config"
        >
          <Save className="w-4 h-4" />
          {isSaved ? 'Saved!' : 'Save'}
        </button>
      </div>

      <div>
        <label className="block text-sm text-text-secondary mb-2">
          Command or script to start the environment
        </label>
        <textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={`./go.sh

or paste bash code:

#!/bin/bash
OFFSET=\${PORT_OFFSET:-0}
export BACKEND_PORT=$((8000 + OFFSET))
docker compose up -d`}
          className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500/50 font-mono text-sm h-48 resize-y"
          data-testid="startup-command-input"
        />
        <p className="text-xs text-text-muted mt-2">
          Available environment variables: PROJECT_ROOT, WORKTREE_PATH, PORT_OFFSET, ENV_NAME
        </p>
      </div>
    </div>
  )
}
