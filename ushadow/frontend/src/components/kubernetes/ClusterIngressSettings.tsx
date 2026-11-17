import { useState } from 'react'
import { kubernetesApi, KubernetesCluster } from '../../services/api'
import { clusterIngress } from '../../testing/ui-contract'

/**
 * Cluster-wide ingress defaults. On deploy, the backend uses these to write an
 * Ingress for each service. With class "tailscale", the operator's ProxyGroup
 * then gives the service a <name>.<tailnet>.ts.net URL.
 */
interface ClusterIngressSettingsProps {
  cluster: KubernetesCluster
  onSaved: () => Promise<void> | void
}

const INGRESS_CLASSES = ['tailscale', 'nginx', 'traefik']
const DEFAULT_PROXY_GROUP = 'ushadow-proxies'

const inputClass =
  'w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
const labelClass = 'block text-xs text-neutral-600 dark:text-neutral-400 mb-1'

export default function ClusterIngressSettings({ cluster, onSaved }: ClusterIngressSettingsProps) {
  const id = cluster.cluster_id
  const [editing, setEditing] = useState(false)
  const [domain, setDomain] = useState('')
  const [ingressClass, setIngressClass] = useState('nginx')
  const [proxyGroup, setProxyGroup] = useState(DEFAULT_PROXY_GROUP)
  const [enabledByDefault, setEnabledByDefault] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTailscale = ingressClass === 'tailscale'

  const startEditing = () => {
    setDomain(cluster.ingress_domain || '')
    setIngressClass(cluster.ingress_class || 'nginx')
    setProxyGroup(cluster.tailscale_proxy_group || DEFAULT_PROXY_GROUP)
    setEnabledByDefault(cluster.ingress_enabled_by_default || false)
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    try {
      await kubernetesApi.updateCluster(id, {
        ingress_domain: domain || undefined,
        ingress_class: ingressClass,
        ingress_enabled_by_default: enabledByDefault,
        tailscale_magicdns_enabled: isTailscale && !!domain,
        tailscale_proxy_group: isTailscale ? proxyGroup || DEFAULT_PROXY_GROUP : undefined,
      })
      setEditing(false)
      await onSaved()
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(e.response?.data?.detail || e.message || 'Failed to update cluster')
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700" data-testid={clusterIngress.section(id)}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Ingress Configuration</h4>
        {!editing && (
          <button onClick={startEditing} className="text-xs text-primary-600 hover:underline" data-testid={clusterIngress.edit(id)}>
            Configure
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded">
          <div>
            <label className={labelClass}>Ingress Class</label>
            <select
              value={ingressClass}
              onChange={(e) => setIngressClass(e.target.value)}
              className={inputClass}
              data-testid={clusterIngress.classSelect(id)}
            >
              {INGRESS_CLASSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>
              {isTailscale ? 'Tailnet domain (e.g., "my-tailnet.ts.net")' : 'Ingress Domain (e.g., "shadow" for *.shadow)'}
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => {
                const value = e.target.value.toLowerCase()
                if (/^[a-z0-9.-]*$/.test(value)) setDomain(value)
              }}
              placeholder={isTailscale ? 'my-tailnet.ts.net' : 'shadow'}
              className={inputClass}
              data-testid={clusterIngress.domainInput(id)}
            />
          </div>

          {isTailscale && (
            <div>
              <label className={labelClass}>Tailscale ProxyGroup</label>
              <input
                type="text"
                value={proxyGroup}
                onChange={(e) => setProxyGroup(e.target.value.trim())}
                placeholder={DEFAULT_PROXY_GROUP}
                className={inputClass}
                data-testid={clusterIngress.proxyGroupInput(id)}
              />
            </div>
          )}

          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={enabledByDefault}
              onChange={(e) => setEnabledByDefault(e.target.checked)}
              className="rounded"
              data-testid={clusterIngress.defaultCheckbox(id)}
            />
            <span className="text-neutral-700 dark:text-neutral-300">Enable ingress by default for new deployments</span>
          </label>

          {error && (
            <p className="text-xs text-error-600" data-testid={clusterIngress.error(id)}>{error}</p>
          )}

          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1 text-sm text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              data-testid={clusterIngress.cancel(id)}
            >
              Cancel
            </button>
            <button onClick={save} className="btn-primary px-3 py-1 text-sm" data-testid={clusterIngress.save(id)}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="text-sm">
          {cluster.ingress_domain ? (
            <div className="space-y-1 text-neutral-600 dark:text-neutral-400">
              <div>
                Domain: <code className="px-1 bg-neutral-100 dark:bg-neutral-700 rounded">.{cluster.ingress_domain}</code>
              </div>
              <div>
                Class: <code className="px-1 bg-neutral-100 dark:bg-neutral-700 rounded">{cluster.ingress_class || 'nginx'}</code>
                {cluster.ingress_class === 'tailscale' && ` (ProxyGroup: ${cluster.tailscale_proxy_group || DEFAULT_PROXY_GROUP})`}
              </div>
              <div>Auto-enable: {cluster.ingress_enabled_by_default ? '✓ Yes' : '✗ No'}</div>
            </div>
          ) : (
            <div className="text-neutral-500 dark:text-neutral-400 text-xs">Not configured</div>
          )}
        </div>
      )}
    </div>
  )
}
