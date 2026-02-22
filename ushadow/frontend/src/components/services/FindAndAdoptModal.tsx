/**
 * FindAndAdoptModal - Search Docker/K8s for instances of a service and adopt them.
 *
 * Opened from the ServiceCard "Find" button. Shows discovered workloads with
 * backend badges (Docker / K8s cluster+namespace). User can adopt any result.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Cloud, Server, CheckCircle, Loader2 } from 'lucide-react'
import Modal from '../Modal'
import { deploymentsApi } from '../../services/api'
import type { DiscoveredWorkload, AdoptRequest } from '../../services/api'

interface FindAndAdoptModalProps {
  isOpen: boolean
  onClose: () => void
  serviceId: string
  serviceName: string
}

export function FindAndAdoptModal({
  isOpen,
  onClose,
  serviceId,
  serviceName,
}: FindAndAdoptModalProps) {
  const queryClient = useQueryClient()
  const [adoptingName, setAdoptingName] = useState<string | null>(null)

  const { data: workloads = [], isLoading } = useQuery({
    queryKey: ['find-workloads', serviceId],
    queryFn: () => deploymentsApi.findWorkloads(serviceId).then((r) => r.data),
    enabled: isOpen,
  })

  const adopt = useMutation({
    mutationFn: (workload: DiscoveredWorkload) => {
      const req: AdoptRequest = {
        backend_type: workload.backend_type,
        container_name: workload.name,
        image: workload.image,
        ports: workload.ports,
        status: workload.status,
        node_hostname: workload.node_hostname,
        container_id: workload.container_id,
        compose_project: workload.compose_project,
        cluster_id: workload.cluster_id,
        namespace: workload.namespace,
        k8s_deployment_name: workload.k8s_deployment_name,
      }
      return deploymentsApi.adoptWorkload(serviceId, req)
    },
    onSuccess: () => {
      // Deployments are fetched as part of the 'service-configs' bundle in useServiceConfigData
      queryClient.invalidateQueries({ queryKey: ['service-configs'] })
      queryClient.invalidateQueries({ queryKey: ['find-workloads', serviceId] })
      setAdoptingName(null)
    },
  })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Find instances of "${serviceName}"`}
      maxWidth="lg"
      testId="find-adopt-modal"
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Searching Docker containers and Kubernetes clusters for workloads
          matching <span className="font-medium text-neutral-700 dark:text-neutral-200">{serviceName}</span>.
          Adopting a workload lets Ushadow proxy, restart, and configure it without
          redeploying.
        </p>

        {isLoading && (
          <div
            className="flex items-center gap-2 py-6 justify-center text-sm text-neutral-500"
            data-testid="find-adopt-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning Docker and Kubernetes…
          </div>
        )}

        {!isLoading && workloads.length === 0 && (
          <div
            className="text-sm text-neutral-500 text-center py-8"
            data-testid="find-adopt-empty"
          >
            No matching workloads found in Docker or any registered K8s cluster.
          </div>
        )}

        {!isLoading && workloads.length > 0 && (
          <div className="space-y-2" data-testid="find-adopt-results">
            {workloads.map((w) => (
              <WorkloadRow
                key={`${w.backend_type}-${w.name}`}
                workload={w}
                isAdopting={adopt.isPending && adoptingName === w.name}
                onAdopt={() => {
                  setAdoptingName(w.name)
                  adopt.mutate(w)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── WorkloadRow ──────────────────────────────────────────────────────────────

interface WorkloadRowProps {
  workload: DiscoveredWorkload
  isAdopting: boolean
  onAdopt: () => void
}

function WorkloadRow({ workload: w, isAdopting, onAdopt }: WorkloadRowProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
      data-testid={`find-result-${w.name}`}
    >
      {/* Left: badge + name + image */}
      <div className="flex items-start gap-3 min-w-0">
        <BackendBadge workload={w} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {w.name}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {w.image}
          </p>
          {w.ports.length > 0 && (
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
              ports: {w.ports.join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* Right: status + action */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            w.status === 'running' ? 'bg-success-500' : 'bg-neutral-400'
          }`}
          title={w.status}
        />

        {w.already_adopted ? (
          <span
            className="inline-flex items-center gap-1 text-xs text-success-600 dark:text-success-400"
            data-testid={`find-result-${w.name}-adopted`}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Adopted
          </span>
        ) : (
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50"
            disabled={isAdopting}
            onClick={onAdopt}
            data-testid={`find-adopt-btn-${w.name}`}
          >
            {isAdopting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Adopt'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── BackendBadge ─────────────────────────────────────────────────────────────

function BackendBadge({ workload: w }: { workload: DiscoveredWorkload }) {
  if (w.backend_type === 'kubernetes') {
    const label = [w.cluster_name, w.namespace].filter(Boolean).join(' · ')
    return (
      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 whitespace-nowrap">
        <Cloud className="h-3 w-3" />
        K8s{label ? ` · ${label}` : ''}
      </span>
    )
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 whitespace-nowrap">
      <Server className="h-3 w-3" />
      Docker{w.compose_project ? ` · ${w.compose_project}` : ''}
    </span>
  )
}
