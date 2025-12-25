import { z } from 'zod'

/**
 * OpenMemory wizard form schema with validation
 */
export const openMemorySchema = z.object({
  // Step 1: Deployment
  deployment_type: z.enum(['new', 'existing']),
  server_url: z.string().url().optional(),

  // Step 2: Graph memory
  enable_graph_memory: z.boolean(),

  // Step 3: Neo4j credentials (conditional on graph memory)
  neo4j_username: z.string().min(1).optional(),
  neo4j_password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  neo4j_confirm_password: z.string().optional(),
}).refine(
  (data) => {
    // Only validate passwords if graph memory is enabled
    if (!data.enable_graph_memory) return true
    return data.neo4j_password === data.neo4j_confirm_password
  },
  {
    message: "Passwords do not match",
    path: ["neo4j_confirm_password"],
  }
).refine(
  (data) => {
    // Server URL required for existing deployment
    if (data.deployment_type === 'existing') {
      return !!data.server_url && data.server_url.length > 0
    }
    return true
  },
  {
    message: "Server URL is required for existing deployment",
    path: ["server_url"],
  }
)

export type OpenMemoryFormData = z.infer<typeof openMemorySchema>

export const defaultValues: OpenMemoryFormData = {
  deployment_type: 'new',
  server_url: 'http://openmemory:8765',
  enable_graph_memory: false,
  neo4j_username: 'neo4j',
  neo4j_password: '',
  neo4j_confirm_password: '',
}
