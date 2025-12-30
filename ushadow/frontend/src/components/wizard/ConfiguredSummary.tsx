import { CheckCircle, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { ConfigSummaryItem } from '../../types/wizard';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * ConfiguredSummary - Shows "already configured" state for a service.
 *
 * Displayed when a user opens a wizard for an already-configured service.
 * Shows current configuration values and optionally allows reconfiguration.
 *
 * @example
 * <ConfiguredSummary
 *   title="OpenMemory"
 *   items={[
 *     { label: 'Server URL', value: 'http://localhost:8765' },
 *     { label: 'API Key', value: 'sk-abc...xyz', masked: true },
 *     { label: 'Graph DB', value: true },
 *   ]}
 *   onReconfigure={() => setShowWizard(true)}
 * />
 */

export interface ConfiguredSummaryProps {
  /** Service/wizard title */
  title: string;
  /** Optional description */
  description?: string;
  /** Configuration items to display */
  items: ConfigSummaryItem[];
  /** Optional callback to reconfigure (show this button only if provided) */
  onReconfigure?: () => void;
  /** Optional callback to go back to dashboard/previous page */
  onBack?: () => void;
}

export function ConfiguredSummary({
  title,
  description,
  items,
  onReconfigure,
  onBack,
}: ConfiguredSummaryProps) {
  const { isDark } = useTheme();
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const toggleReveal = (label: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const formatValue = (item: ConfigSummaryItem): string => {
    const { value, masked, label } = item;

    // Boolean values
    if (typeof value === 'boolean') {
      return value ? 'Enabled' : 'Disabled';
    }

    // Masked values (like API keys)
    if (masked && !revealedKeys.has(label)) {
      const strValue = String(value);
      if (strValue.length > 8) {
        return `${strValue.slice(0, 4)}${'•'.repeat(8)}${strValue.slice(-4)}`;
      }
      return '•'.repeat(12);
    }

    return String(value);
  };

  return (
    <div id="configured-summary" className="max-w-2xl mx-auto">
      <div
        className="rounded-xl text-center py-8 px-6"
        style={{
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
          border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          boxShadow: isDark ? '0 4px 6px rgba(0, 0, 0, 0.4)' : '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Success Icon */}
        <CheckCircle
          id="configured-success-icon"
          className="w-16 h-16 mx-auto mb-4"
          style={{ color: '#4ade80' }}
        />

        {/* Title */}
        <h2
          id="configured-title"
          className="text-2xl font-bold mb-2"
          style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
        >
          {title} is configured
        </h2>

        {/* Description */}
        {description && (
          <p
            id="configured-description"
            className="mb-6"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            {description}
          </p>
        )}

        {/* Configuration Details */}
        <div
          id="configured-details"
          className="rounded-lg p-4 mb-6 text-left"
          style={{
            backgroundColor: isDark ? 'var(--surface-700)' : '#f4f4f5',
          }}
        >
          {items.map((item) => (
            <div
              key={item.label}
              id={`config-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className="flex justify-between items-center py-3 last:border-0"
              style={{
                borderBottom: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
              }}
            >
              <span style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}>
                {item.label}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-sm"
                  style={{
                    color:
                      typeof item.value === 'boolean'
                        ? item.value
                          ? '#4ade80'
                          : isDark
                          ? 'var(--text-muted)'
                          : '#a1a1aa'
                        : isDark
                        ? 'var(--text-primary)'
                        : '#0f0f13',
                  }}
                >
                  {formatValue(item)}
                </span>
                {item.masked && (
                  <button
                    onClick={() => toggleReveal(item.label)}
                    className="p-1 transition-colors"
                    style={{ color: isDark ? 'var(--surface-400)' : '#a1a1aa' }}
                    aria-label={revealedKeys.has(item.label) ? 'Hide value' : 'Reveal value'}
                  >
                    {revealedKeys.has(item.label) ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-4">
          {onBack && (
            <button
              id="configured-back-button"
              onClick={onBack}
              className="px-4 py-2 rounded-lg font-medium transition-colors"
              style={{
                backgroundColor: isDark ? 'var(--surface-600)' : '#e4e4e7',
                color: isDark ? 'var(--text-primary)' : '#0f0f13',
              }}
            >
              Back to Dashboard
            </button>
          )}
          {onReconfigure && (
            <button
              id="configured-reconfigure-button"
              onClick={onReconfigure}
              className="inline-flex items-center gap-2 text-sm transition-colors"
              style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
            >
              <RotateCcw className="w-4 h-4" />
              Reconfigure
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConfiguredSummary;
