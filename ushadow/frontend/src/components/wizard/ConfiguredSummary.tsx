import { CheckCircle, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { ConfigSummaryItem } from '../../types/wizard';

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
      <div className="card text-center py-8">
        {/* Success Icon */}
        <CheckCircle
          id="configured-success-icon"
          className="w-16 h-16 text-green-500 mx-auto mb-4"
        />

        {/* Title */}
        <h2 id="configured-title" className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {title} is configured
        </h2>

        {/* Description */}
        {description && (
          <p id="configured-description" className="text-gray-600 dark:text-gray-400 mb-6">
            {description}
          </p>
        )}

        {/* Configuration Details */}
        <div
          id="configured-details"
          className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6 text-left"
        >
          {items.map((item) => (
            <div
              key={item.label}
              id={`config-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700 last:border-0"
            >
              <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-sm ${
                    typeof item.value === 'boolean'
                      ? item.value
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-500'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {formatValue(item)}
                </span>
                {item.masked && (
                  <button
                    onClick={() => toggleReveal(item.label)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
              className="btn-ghost"
            >
              Back to Dashboard
            </button>
          )}
          {onReconfigure && (
            <button
              id="configured-reconfigure-button"
              onClick={onReconfigure}
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
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
