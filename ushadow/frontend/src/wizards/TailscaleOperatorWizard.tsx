import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircle,
  Loader2,
  Shield,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Play,
  Copy,
  Tag,
} from 'lucide-react'
import { kubernetesApi } from '../services/api'
import type { TailscaleOperatorStatus, TailscaleProxyGroup } from '../services/api'
import { useWizardSteps } from '../hooks/useWizardSteps'
import { WizardShell } from '../components/wizard'
import type { WizardMessage } from '../components/wizard'
import type { WizardStep } from '../types/wizard'

const STEPS: WizardStep[] = [
  { id: 'acl', label: 'ACL' },
  { id: 'oauth', label: 'OAuth' },
  { id: 'install', label: 'Install' },
  { id: 'configure', label: 'Configure' },
  { id: 'complete', label: 'Done' },
]

const ACL_TAG_SNIPPET = `"tagOwners": {
  "tag:k8s-operator": []
}`

const ACL_AUTOAPPROVERS_SNIPPET = `"autoApprovers": {
  "services": {
    "tag:k8s-operator": ["tag:k8s-operator"]
  }
}`

export default function TailscaleOperatorWizard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clusterId = searchParams.get('cluster') ?? ''

  const wizard = useWizardSteps(STEPS)
  const [clusterName, setClusterName] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [hostname, setHostname] = useState('ushadow-chakra')
  const [status, setStatus] = useState<TailscaleOperatorStatus | null>(null)
  const [message, setMessage] = useState<WizardMessage | null>(null)
  const [installing, setInstalling] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<'tag' | 'autoapprovers' | null>(null)
  const [detectedGroups, setDetectedGroups] = useState<TailscaleProxyGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>('') // '' = create new
  const [loadingGroups, setLoadingGroups] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!clusterId) return
    const load = async () => {
      try {
        const [clusterResp, credsResp] = await Promise.all([
          kubernetesApi.getCluster(clusterId),
          kubernetesApi.getTailscaleOperatorCredentials(),
        ])
        setClusterName(clusterResp.data.name)
        const defaultHostname = `ushadow-${clusterResp.data.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
        if (credsResp.data.client_id) setClientId(credsResp.data.client_id)
        if (credsResp.data.client_secret) setClientSecret(credsResp.data.client_secret)
        // Saved hostname wins; fall back to cluster-derived default
        setHostname(credsResp.data.hostname || defaultHostname)
      } catch { /* ignore */ }
    }
    load()
  }, [clusterId])

  useEffect(() => {
    const polledSteps = ['install', 'configure', 'complete']
    if (polledSteps.includes(wizard.currentStep.id)) {
      checkStatus()
      pollRef.current = setInterval(checkStatus, 5000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [wizard.currentStep.id])

  // Detect existing ProxyGroups when entering the install step
  useEffect(() => {
    if (wizard.currentStep.id !== 'install' || !clusterId) return
    setLoadingGroups(true)
    kubernetesApi.listTailscaleProxyGroups(clusterId)
      .then(r => {
        setDetectedGroups(r.data)
        // Auto-select the first found group (prefer the one already used by status)
        if (r.data.length > 0 && !selectedGroup) {
          setSelectedGroup(r.data[0].name)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingGroups(false))
  }, [wizard.currentStep.id, clusterId])

  const checkStatus = async () => {
    if (!clusterId) return
    try {
      const r = await kubernetesApi.getTailscaleOperatorStatus(clusterId)
      setStatus(r.data)
      if (r.data.install_error || (r.data.operator_ready && r.data.ingress_annotated)) {
        setInstalling(false)
      }
    } catch { /* ignore polling errors */ }
  }

  // Prefer the annotation-based hostname when ts_hostname is stale (e.g. after a
  // hostname change — the LoadBalancer status lags until the operator re-provisions).
  const annotationUrl = (status?.hostname && status?.tailnet_domain)
    ? `https://${status.hostname}.${status.tailnet_domain}`
    : null
  const tsHostnameMatchesAnnotation = status?.ts_hostname?.startsWith(`${status?.hostname}.`)
  const tsUrl = (status?.ts_hostname && tsHostnameMatchesAnnotation)
    ? `https://${status.ts_hostname}`
    : annotationUrl ?? (status?.ts_hostname ? `https://${status.ts_hostname}` : null)

  const handleInstall = async () => {
    if (!clusterId || !clientId || !clientSecret) return
    setInstalling(true)
    // Optimistically clear install completion so polling doesn't immediately
    // flip installing=false when the old ProxyGroup is still present.
    setStatus(prev => prev ? { ...prev, install_error: null, ingress_annotated: false, ts_hostname: null } : null)
    try {
      // Save credentials (including potentially-updated hostname) before installing
      await saveCredentials()
      await kubernetesApi.installTailscaleOperator(clusterId, {
        client_id: clientId,
        client_secret: clientSecret,
        hostname,
        proxygroup_name: selectedGroup, // '' = create new
      })
    } catch (e: unknown) {
      setInstalling(false)
      const msg = e instanceof Error ? e.message : 'Install request failed'
      setMessage({ type: 'error', text: msg })
    }
  }

  const handleConfigure = async () => {
    if (!clusterId || !tsUrl) return
    const effectiveHostname = status?.ts_hostname ?? (status?.hostname && status?.tailnet_domain ? `${status.hostname}.${status.tailnet_domain}` : null)
    if (!effectiveHostname) return
    setConfiguring(true)
    setMessage(null)
    try {
      await kubernetesApi.configureTailscaleIngress(clusterId, effectiveHostname)
      await checkStatus()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Configure failed'
      setMessage({ type: 'error', text: msg })
    } finally {
      setConfiguring(false)
    }
  }

  const saveCredentials = async () => {
    try {
      await kubernetesApi.saveTailscaleOperatorCredentials({ client_id: clientId, client_secret: clientSecret, hostname })
    } catch (e) {
      console.error('[TailscaleWizard] saveCredentials failed:', e)
      throw e
    }
  }

  const handleNext = async () => {
    setMessage(null)
    if (wizard.currentStep.id === 'oauth') {
      setSaving(true)
      try {
        await saveCredentials()
      } catch (e: unknown) {
        setSaving(false)
        const msg = e instanceof Error ? e.message : 'Failed to save credentials'
        setMessage({ type: 'error', text: `Save failed: ${msg}` })
        return
      }
      setSaving(false)
    }
    wizard.next()
  }

  const copySnippet = async (which: 'tag' | 'autoapprovers') => {
    const text = which === 'tag' ? ACL_TAG_SNIPPET : ACL_AUTOAPPROVERS_SNIPPET
    await navigator.clipboard.writeText(text)
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  const isInstallComplete = !!status?.operator_ready && !!status?.ingress_annotated
  const hasCredentials = !!(clientId && clientSecret)

  return (
    <WizardShell
      wizardId="tailscale-operator"
      title="Tailscale Kubernetes Operator"
      subtitle="Trusted HTTPS for your Kubernetes cluster"
      icon={Shield}
      progress={wizard.progress}
      steps={STEPS}
      currentStepId={wizard.currentStep.id}
      onStepClick={(id) => {
        const idx = STEPS.findIndex(s => s.id === id)
        if (idx <= wizard.currentIndex) { setMessage(null); wizard.goTo(id) }
      }}
      isFirstStep={wizard.isFirst}
      onBack={() => { setMessage(null); wizard.back() }}
      onNext={wizard.currentStep.id === 'complete' ? undefined : handleNext}
      nextDisabled={
        saving ||
        (wizard.currentStep.id === 'oauth' && !hasCredentials) ||
        (wizard.currentStep.id === 'install' && !isInstallComplete) ||
        (wizard.currentStep.id === 'configure' && !(status?.ingress_configured && status?.deployment_configured))
      }
      nextLoading={saving}
      message={message}
      headerActions={
        <button
          onClick={() => navigate(-1)}
          className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          data-testid="tailscale-operator-skip"
        >
          Skip
        </button>
      }
    >

      {/* ── Step 1: ACL Policy ── */}
      {wizard.currentStep.id === 'acl' && (
        <div id="ts-operator-step-acl" className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
              Update your tailnet ACL policy
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Two entries are required in your Tailscale ACL before the operator can work.
              Add both, then click <strong>Next</strong>.
            </p>
          </div>

          {/* Snippet 1: tagOwners */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                1. Declare the <code className="px-1 bg-neutral-100 dark:bg-neutral-700 rounded">tag:k8s-operator</code> tag
              </p>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Every proxy device the operator creates is tagged with this label.
              An empty <code className="px-1 bg-neutral-100 dark:bg-neutral-700 rounded">tagOwners</code> array means
              no individual user owns it — it's machine-owned.
            </p>
            <div className="relative">
              <pre className="p-3 pr-10 bg-neutral-900 dark:bg-neutral-950 rounded-lg text-xs text-green-400 font-mono whitespace-pre overflow-x-auto">
                {ACL_TAG_SNIPPET}
              </pre>
              <button
                onClick={() => copySnippet('tag')}
                className="absolute top-2 right-2 p-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
                data-testid="ts-operator-copy-acl-tag"
                title="Copy to clipboard"
              >
                {copied === 'tag'
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Snippet 2: autoApprovers */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                2. Allow the operator to advertise VIP services
              </p>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Without this, proxy pods send service registrations to the control plane but they're
              silently ignored — services won't get Tailscale hostnames even if everything else is working.
            </p>
            <div className="relative">
              <pre className="p-3 pr-10 bg-neutral-900 dark:bg-neutral-950 rounded-lg text-xs text-green-400 font-mono whitespace-pre overflow-x-auto">
                {ACL_AUTOAPPROVERS_SNIPPET}
              </pre>
              <button
                onClick={() => copySnippet('autoapprovers')}
                className="absolute top-2 right-2 p-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
                data-testid="ts-operator-copy-acl-autoapprovers"
                title="Copy to clipboard"
              >
                {copied === 'autoapprovers'
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              If you already have an <code className="px-1 bg-neutral-100 dark:bg-neutral-700 rounded">autoApprovers</code> block,
              add the <code className="px-1 bg-neutral-100 dark:bg-neutral-700 rounded">services</code> key inside it.
            </p>
          </div>

          <a
            href="https://login.tailscale.com/admin/acls/visual/tags"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
            data-testid="ts-operator-open-acl"
          >
            Open Tailscale ACL editor
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Save the ACL policy with both changes, then click <strong>Next</strong>.
          </p>
        </div>
      )}

      {/* ── Step 2: OAuth Client ── */}
      {wizard.currentStep.id === 'oauth' && (
        <div id="ts-operator-step-oauth" className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
              Create a Tailscale OAuth client
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              The operator needs long-lived OAuth credentials to create auth keys for each proxy
              it manages. A one-time auth key won't work here.
            </p>
          </div>

          <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800 space-y-3">
            <p className="text-sm font-medium text-primary-900 dark:text-primary-100">
              When creating the OAuth client, enable:
            </p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-sm font-medium text-primary-900 dark:text-primary-100">Core — Devices</span>
                  <span className="text-xs text-primary-600 dark:text-primary-400 ml-2">read &amp; write</span>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-sm font-medium text-primary-900 dark:text-primary-100">Keys — Auth Keys</span>
                  <span className="text-xs text-primary-600 dark:text-primary-400 ml-2">write — needed to create device auth keys</span>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Tag className="w-4 h-4 text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-sm font-medium text-primary-900 dark:text-primary-100">Tags</span>
                  <span className="text-xs text-primary-600 dark:text-primary-400 ml-2">
                    add <code className="px-1 bg-primary-100 dark:bg-primary-800 rounded">tag:k8s-operator</code>
                  </span>
                </div>
              </li>
            </ul>
            <a
              href="https://login.tailscale.com/admin/settings/oauth"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 dark:text-primary-300 hover:underline"
              data-testid="ts-operator-oauth-link"
            >
              Open Tailscale OAuth settings
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {hasCredentials && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                You have saved credentials. If the operator previously crashed with a{' '}
                <strong>403 error</strong>, your OAuth client is missing the <strong>Keys</strong> scope.
                Scopes can't be added after creation — create a new client with both Core + Keys.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  onBlur={saveCredentials}
                  placeholder="tskey-client-..."
                  className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono text-xs"
                  data-testid="ts-operator-client-id"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={e => setClientSecret(e.target.value)}
                  onBlur={saveCredentials}
                  placeholder="tskey-client-secret-..."
                  className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono text-xs"
                  data-testid="ts-operator-client-secret"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Hostname prefix
              </label>
              <input
                type="text"
                value={hostname}
                onChange={e => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                onBlur={saveCredentials}
                placeholder="ushadow-chakra"
                className="w-full px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono text-xs"
                data-testid="ts-operator-hostname"
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Your cluster will be reachable at{' '}
                <span className="font-mono">{`${hostname || 'ushadow-chakra'}.<tailnet>.ts.net`}</span>
              </p>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Credentials are saved to{' '}
              <code className="px-1 bg-neutral-100 dark:bg-neutral-700 rounded">secrets.yaml</code> as you type.
            </p>
          </div>
        </div>
      )}

      {/* ── Step 3: Install ── */}
      {wizard.currentStep.id === 'install' && (
        <div id="ts-operator-step-install" className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
              Install the operator
            </h2>
            {clusterName && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Target cluster: <strong className="text-neutral-700 dark:text-neutral-300">{clusterName}</strong>
              </p>
            )}
          </div>

          {/* ProxyGroup picker */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              ProxyGroup {loadingGroups ? '(detecting…)' : ''}
            </p>
            {detectedGroups.length > 0 ? (
              <div className="space-y-1">
                {detectedGroups.map(pg => (
                  <label
                    key={pg.name}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                    data-testid={`ts-operator-pg-${pg.name}`}
                  >
                    <input
                      type="radio"
                      name="proxygroup"
                      value={pg.name}
                      checked={selectedGroup === pg.name}
                      onChange={() => setSelectedGroup(pg.name)}
                      className="text-primary-600"
                    />
                    <span className="flex-1 text-sm font-mono text-neutral-900 dark:text-neutral-100">{pg.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${pg.ready ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                      {pg.ready ? `${pg.pod_count} pods` : 'needs refresh'}
                    </span>
                  </label>
                ))}
                <label
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                  data-testid="ts-operator-pg-create-new"
                >
                  <input
                    type="radio"
                    name="proxygroup"
                    value=""
                    checked={selectedGroup === ''}
                    onChange={() => setSelectedGroup('')}
                    className="text-primary-600"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">Create new (ushadow-proxies)</span>
                </label>
              </div>
            ) : !loadingGroups ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                No existing ProxyGroup found — a new one will be created.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            {status?.install_error ? (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 space-y-2">
                <p className="text-xs font-medium text-red-800 dark:text-red-200">Install failed:</p>
                <pre className="text-xs text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap overflow-x-auto">
                  {status.install_error}
                </pre>
                <button
                  onClick={handleInstall}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                  data-testid="ts-operator-retry"
                >
                  Retry
                </button>
              </div>
            ) : installing ? (
              <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin text-primary-500 flex-shrink-0" />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  Installing… this may take up to 2 minutes
                </span>
              </div>
            ) : isInstallComplete ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <span className="text-sm text-green-800 dark:text-green-200">Already installed — click Next to continue</span>
                </div>
                <button
                  onClick={handleInstall}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 border border-neutral-300 dark:border-neutral-600 rounded-lg transition-colors"
                  data-testid="ts-operator-reinstall-btn"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reinstall / update hostname
                </button>
              </div>
            ) : (
              <button
                onClick={handleInstall}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
                data-testid="ts-operator-install-btn"
              >
                <Play className="w-4 h-4" />
                Install Operator
              </button>
            )}
          </div>

          <div className="space-y-2">
            <StatusRow label="tailscale-system namespace exists" done={!!status?.installed} />
            <StatusRow label="Operator deployment ready" done={!!status?.operator_ready} />
            <StatusRow
              label={status?.proxygroup_name ? `ProxyGroup: ${status.proxygroup_name}` : 'ProxyGroup provisioned'}
              done={!!status?.ingress_annotated}
            />
            {status?.ts_hostname && (
              <StatusRow label={`Tailscale hostname: ${status.ts_hostname}`} done={true} />
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            {isInstallComplete ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span>Ready — click Next</span>
              </>
            ) : (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                <span>Polling every 5 seconds...</span>
                <button
                  onClick={checkStatus}
                  className="ml-2 text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                  data-testid="ts-operator-refresh-status"
                >
                  <RefreshCw className="w-3 h-3" />
                  Check now
                </button>
              </>
            )}
          </div>

          {!clusterId && (
            <div className="p-3 bg-warning-50 dark:bg-warning-900/20 rounded border border-warning-200 dark:border-warning-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-600 flex-shrink-0" />
              <p className="text-xs text-warning-800 dark:text-warning-200">
                No cluster selected — open this wizard from a cluster card.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Configure ── */}
      {wizard.currentStep.id === 'configure' && (
        <div id="ts-operator-step-configure" className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
              Configure ushadow for Tailscale
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Update the backend URL — routing and TLS are handled automatically by the ProxyGroup.
            </p>
          </div>

          {tsUrl && (
            <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
              <p className="text-xs text-primary-700 dark:text-primary-300">
                Will configure ushadow to use:{' '}
                <span className="font-mono font-medium">{tsUrl}</span>
              </p>
            </div>
          )}

          <div className="space-y-2">
            <StatusRow label="Tailscale Ingress created (ProxyGroup)" done={!!status?.ingress_configured} />
            <StatusRow label="Set USHADOW_PUBLIC_URL in backend deployment" done={!!status?.deployment_configured} />
          </div>

          {status?.ingress_configured && status?.deployment_configured ? (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
              <span className="text-sm text-green-800 dark:text-green-200">Configured — click Next to finish</span>
            </div>
          ) : (
            <button
              onClick={handleConfigure}
              disabled={configuring || !tsUrl}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              data-testid="ts-operator-configure-btn"
            >
              {configuring
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Play className="w-4 h-4" />}
              Apply Configuration
            </button>
          )}

          {!tsUrl && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Tailscale hostname not yet assigned. Go back to the Install step and wait for provisioning.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Step 5: Complete ── */}
      {wizard.currentStep.id === 'complete' && (
        <div id="ts-operator-step-complete" className="space-y-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
            <div className="text-left">
              <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                Operator Installed!
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Your cluster now has a Tailscale-backed trusted HTTPS certificate
              </p>
            </div>
          </div>

          {tsUrl && (
            <div className="p-4 bg-gradient-to-r from-primary-50 to-fuchsia-50 dark:from-primary-900/30 dark:to-fuchsia-900/30 rounded-lg border border-primary-200 dark:border-primary-800">
              <a
                href={tsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-lg font-mono font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                data-testid="ts-operator-ts-url"
              >
                {tsUrl}
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}

          <div className="p-4 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg text-left space-y-2">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">What was done:</p>
            <ul className="text-sm text-neutral-700 dark:text-neutral-300 space-y-1 ml-4 list-disc">
              <li>Tailscale operator installed in <code className="px-1 bg-neutral-100 dark:bg-neutral-700 rounded">tailscale-system</code></li>
              <li>ProxyGroup + Tailscale Ingress created (HA, routes /api and / directly to services)</li>
              <li>TLS certificates managed automatically by the operator</li>
              <li><code className="px-1 bg-neutral-100 dark:bg-neutral-700 rounded">USHADOW_PUBLIC_URL</code> updated in the backend deployment</li>
            </ul>
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 pt-2">Remaining step:</p>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              The backend pod will restart automatically to pick up the new URL.
              Once it's running, scan a fresh QR code from the mobile app.
            </p>
          </div>

          <button
            onClick={() => navigate('/kubernetes')}
            className="btn-primary"
            data-testid="ts-operator-go-to-clusters"
          >
            Go to Kubernetes Clusters
          </button>
        </div>
      )}
    </WizardShell>
  )
}

function StatusRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg">
      {done
        ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
        : <div className="w-5 h-5 rounded-full border-2 border-neutral-300 dark:border-neutral-600 flex-shrink-0" />}
      <span className="text-sm text-neutral-900 dark:text-neutral-100">{label}</span>
    </div>
  )
}
