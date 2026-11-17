import { useQuery } from '@tanstack/react-query'
import { kubernetesApi } from '../services/api'

/** Kubernetes clusters Ushadow knows about (for choosing where to scan). */
export function useKubernetesClusters(enabled: boolean) {
  return useQuery({
    queryKey: ['kubernetes', 'clusters'],
    queryFn: async () => (await kubernetesApi.listClusters()).data,
    enabled,
    staleTime: 60_000,
  })
}

/**
 * OpenAI-compatible LLM servers running in a cluster.
 *
 * The scan probes every candidate Service, so it takes several seconds;
 * results are cached for a minute and only fetched when `clusterId` is set.
 */
export function useClusterLlmServices(clusterId: string | null) {
  return useQuery({
    queryKey: ['kubernetes', clusterId, 'llm-services'],
    queryFn: async () => (await kubernetesApi.discoverLlmServices(clusterId!)).data.services,
    enabled: !!clusterId,
    staleTime: 60_000,
    retry: false,
  })
}
