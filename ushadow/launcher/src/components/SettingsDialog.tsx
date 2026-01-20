import { useState, useEffect } from 'react'
import { X, Settings, Eye, EyeOff, Save } from 'lucide-react'
import { tauri, type LauncherSettings } from '../hooks/useTauri'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [settings, setSettings] = useState<LauncherSettings>({
    default_admin_email: null,
    default_admin_password: null,
    default_admin_name: null,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Load settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true)
      setSaveSuccess(false)
      tauri.loadLauncherSettings()
        .then(loaded => {
          setSettings(loaded)
        })
        .catch(err => {
          console.error('Failed to load settings:', err)
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSave = async () => {
    setIsSaving(true)
    setSaveSuccess(false)

    try {
      await tauri.saveLauncherSettings(settings)
      setSaveSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert(`Failed to save settings: ${error}`)
    } finally {
      setIsSaving(false)
    }
  }

  const isValid = settings.default_admin_email && settings.default_admin_password

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="settings-dialog"
    >
      <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary-400" />
            Launcher Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-700 transition-colors"
            data-testid="close-settings-dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-text-muted">
            Loading settings...
          </div>
        ) : (
          <>
            {/* Description */}
            <p className="text-sm text-text-secondary mb-6">
              Configure default admin credentials that will be used for all new environments.
              These credentials are stored locally and used to auto-create users.
            </p>

            {/* Admin Name */}
            <div className="mb-4">
              <label className="block text-sm text-text-secondary mb-2">
                Admin Name <span className="text-text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={settings.default_admin_name || ''}
                onChange={(e) => setSettings({ ...settings, default_admin_name: e.target.value || null })}
                className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
                placeholder="Administrator"
                data-testid="settings-admin-name"
              />
            </div>

            {/* Admin Email */}
            <div className="mb-4">
              <label className="block text-sm text-text-secondary mb-2">
                Admin Email
              </label>
              <input
                type="email"
                value={settings.default_admin_email || ''}
                onChange={(e) => setSettings({ ...settings, default_admin_email: e.target.value || null })}
                className="w-full bg-surface-700 rounded-lg px-3 py-2 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
                placeholder="admin@example.com"
                autoFocus
                data-testid="settings-admin-email"
              />
            </div>

            {/* Admin Password */}
            <div className="mb-6">
              <label className="block text-sm text-text-secondary mb-2">
                Admin Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={settings.default_admin_password || ''}
                  onChange={(e) => setSettings({ ...settings, default_admin_password: e.target.value || null })}
                  className="w-full bg-surface-700 rounded-lg px-3 py-2 pr-10 outline-none text-sm focus:ring-2 focus:ring-primary-500/50"
                  placeholder="••••••••"
                  data-testid="settings-admin-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  data-testid="toggle-password-visibility"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Success Message */}
            {saveSuccess && (
              <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm">
                Settings saved successfully!
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!isValid || isSaving}
                className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
                data-testid="save-settings"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Settings
                  </>
                )}
              </button>
            </div>

            {/* Helper text */}
            <p className="text-xs text-text-muted mt-4">
              💡 These credentials will be used to automatically create an admin user when you create a new environment.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
