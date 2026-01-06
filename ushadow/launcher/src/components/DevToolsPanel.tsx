import { useAppStore } from '../store/appStore'
import { Bug, RotateCcw } from 'lucide-react'

export function DevToolsPanel() {
  const {
    dryRunMode,
    setDryRunMode,
    spoofedPrereqs,
    setSpoofedPrereq,
    resetSpoofedPrereqs,
  } = useAppStore()

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4" data-testid="dev-tools-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-medium text-yellow-400">Dev Tools</span>
        </div>
        <button
          onClick={resetSpoofedPrereqs}
          className="text-xs px-2 py-1 rounded bg-surface-700 hover:bg-surface-600 transition-colors flex items-center gap-1"
          title="Reset to real values"
          data-testid="reset-spoof-button"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      {/* Dry Run Toggle */}
      <div className="flex items-center justify-between py-2 border-b border-surface-600">
        <span className="text-sm">Dry Run Mode</span>
        <ToggleSwitch
          checked={dryRunMode}
          onChange={setDryRunMode}
          testId="dry-run-toggle"
        />
      </div>
      {dryRunMode && (
        <p className="text-xs text-yellow-400/70 mt-1 mb-2">
          Install commands will be simulated (not executed)
        </p>
      )}

      {/* Spoof Controls */}
      <div className="mt-3 space-y-2">
        <p className="text-xs text-text-muted">Spoof Prerequisites:</p>
        <SpoofControl
          label="Git"
          value={spoofedPrereqs.git_installed}
          onChange={(v) => setSpoofedPrereq('git_installed', v)}
        />
        <SpoofControl
          label="Docker Installed"
          value={spoofedPrereqs.docker_installed}
          onChange={(v) => setSpoofedPrereq('docker_installed', v)}
        />
        <SpoofControl
          label="Docker Running"
          value={spoofedPrereqs.docker_running}
          onChange={(v) => setSpoofedPrereq('docker_running', v)}
        />
        <SpoofControl
          label="Tailscale"
          value={spoofedPrereqs.tailscale_installed}
          onChange={(v) => setSpoofedPrereq('tailscale_installed', v)}
        />
        <SpoofControl
          label="Homebrew"
          value={spoofedPrereqs.homebrew_installed}
          onChange={(v) => setSpoofedPrereq('homebrew_installed', v)}
        />
      </div>
    </div>
  )
}

function ToggleSwitch({ checked, onChange, testId }: {
  checked: boolean
  onChange: (value: boolean) => void
  testId?: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? 'bg-primary-500' : 'bg-surface-600'
      }`}
      data-testid={testId}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function SpoofControl({ label, value, onChange }: {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">{label}</span>
      <div className="flex gap-1">
        <SpoofButton
          active={value === null}
          onClick={() => onChange(null)}
          label="Real"
        />
        <SpoofButton
          active={value === true}
          onClick={() => onChange(true)}
          label="Yes"
          color="green"
        />
        <SpoofButton
          active={value === false}
          onClick={() => onChange(false)}
          label="No"
          color="red"
        />
      </div>
    </div>
  )
}

function SpoofButton({ active, onClick, label, color }: {
  active: boolean
  onClick: () => void
  label: string
  color?: 'green' | 'red'
}) {
  const baseClass = 'text-xs px-2 py-0.5 rounded transition-colors'
  const colorClass = active
    ? color === 'green'
      ? 'bg-success-500/30 text-success-400'
      : color === 'red'
        ? 'bg-error-500/30 text-error-400'
        : 'bg-surface-500 text-text-primary'
    : 'bg-surface-700 text-text-muted hover:bg-surface-600'

  return (
    <button onClick={onClick} className={`${baseClass} ${colorClass}`}>
      {label}
    </button>
  )
}
