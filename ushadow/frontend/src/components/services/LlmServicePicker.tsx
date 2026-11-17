/**
 * LlmServicePicker - find LLM servers running in a Kubernetes cluster and pick one.
 *
 * Saves the user from looking up `svc.namespace.svc.cluster.local:port` URLs by hand:
 * the backend lists cluster Services, asks each for /v1/models, and this modal shows
 * what answered. Clicking a model fills both URL and model; "Use" fills only the URL.
 */

import { useEffect, useState } from 'react'
import { Loader2, Search, Server } from 'lucide-react'
import Modal from '../Modal'
import { useClusterLlmServices, useKubernetesClusters } from '../../hooks/useClusterLlmServices'
import { llmServicePicker as tid } from '../../testing/ui-contract'
import type { ClusterLlmService } from '../../services/api'

interface LlmServicePickerProps {
  /** Stable id used in test ids, usually the provider id */
  id: string
  /** 'base' = http://host:port (Ollama native), 'openai' = http://host:port/v1 */
  urlStyle: 'base' | 'openai'
  onPick: (url: string, model?: string) => void
}

export default function LlmServicePicker({ id, urlStyle, onPick }: LlmServicePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [clusterId, setClusterId] = useState<string | null>(null)
  const clusters = useKubernetesClusters(isOpen)
  const services = useClusterLlmServices(isOpen ? clusterId : null)

  // Default to the first cluster once the list arrives.
  useEffect(() => {
    if (!clusterId && clusters.data?.length) setClusterId(clusters.data[0].cluster_id)
  }, [clusters.data, clusterId])

  const pick = (svc: ClusterLlmService, model?: string) => {
    onPick(urlStyle === 'base' ? svc.base_url : svc.openai_url, model)
    setIsOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-primary-300 text-primary-700 dark:text-primary-300 dark:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20"
        data-testid={tid.openButton(id)}
      >
        <Search className="h-3.5 w-3.5" />
        Find on cluster
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="LLM servers on cluster" maxWidth="lg" testId={tid.modal(id)}>
        {clusters.data && clusters.data.length > 1 && (
          <select
            value={clusterId ?? ''}
            onChange={(e) => setClusterId(e.target.value)}
            className="input w-full text-sm mb-3"
            data-testid={tid.clusterSelect(id)}
          >
            {clusters.data.map((c) => (
              <option key={c.cluster_id} value={c.cluster_id}>{c.name}</option>
            ))}
          </select>
        )}
        <PickerBody
          id={id}
          noClusters={clusters.isSuccess && clusters.data.length === 0}
          isLoading={clusters.isLoading || services.isLoading}
          error={services.error as Error | null}
          services={services.data}
          onPick={pick}
        />
      </Modal>
    </>
  )
}

interface PickerBodyProps {
  id: string
  noClusters: boolean
  isLoading: boolean
  error: Error | null
  services?: ClusterLlmService[]
  onPick: (svc: ClusterLlmService, model?: string) => void
}

function PickerBody({ id, noClusters, isLoading, error, services, onPick }: PickerBodyProps) {
  if (noClusters) return <p className="text-sm text-neutral-500">No Kubernetes cluster is connected to Ushadow.</p>
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-sm text-neutral-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Scanning cluster services…
      </div>
    )
  }
  if (error) return <p className="text-sm text-error-600">Scan failed: {error.message}</p>
  if (!services?.length) {
    return <p className="text-sm text-neutral-500">No OpenAI-compatible servers answered. Label a Service with <code>ushadow.io/capability=llm</code> to include other ports.</p>
  }
  return (
    <ul className="space-y-2 max-h-96 overflow-y-auto">
      {services.map((svc) => (
        <ServiceRow key={`${svc.namespace}/${svc.name}:${svc.port}`} id={id} svc={svc} onPick={onPick} />
      ))}
    </ul>
  )
}

function ServiceRow({ id, svc, onPick }: { id: string; svc: ClusterLlmService; onPick: PickerBodyProps['onPick'] }) {
  const { namespace: ns, name, port } = svc
  return (
    <li className="rounded border border-neutral-200 dark:border-neutral-700 p-2" data-testid={tid.service(id, ns, name, port)}>
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-purple-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{name} <span className="text-neutral-400">· {ns}</span></div>
          <div className="text-xs font-mono text-neutral-500 truncate">{svc.openai_url}</div>
        </div>
        <button
          type="button"
          onClick={() => onPick(svc)}
          className="px-2 py-1 text-xs rounded bg-primary-600 text-white hover:bg-primary-700"
          data-testid={tid.useService(id, ns, name, port)}
          title="Use this server's URL only; keep the current model"
        >
          Use URL only
        </button>
      </div>
      {svc.models.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mt-2">
          <span className="text-xs text-neutral-500 mr-1">Pick a model:</span>
          {svc.models.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onPick(svc, m)}
              className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-primary-100 dark:hover:bg-primary-900/30"
              data-testid={tid.model(id, ns, name, port, m)}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}
