import { useFormContext } from 'react-hook-form'
import { Database, Server } from 'lucide-react'
import type { OpenMemoryFormData } from '../schema'

export default function GraphConfigStep(_props: any) {
  const { register, watch } = useFormContext<OpenMemoryFormData>()
  const enableGraph = watch('enable_graph_memory')

  return (
    <div className="p-6 min-h-[300px]">
      <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Graph Memory Configuration
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Enable graph-based memory for enhanced relationship tracking.
        </p>
      </div>

      <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
        <h4 className="font-semibold text-primary-900 dark:text-primary-200 mb-2">
          What is Graph Memory?
        </h4>
        <p className="text-sm text-primary-800 dark:text-primary-300">
          Graph memory uses Neo4j to store relationships between memories, enabling more complex queries and connections. This requires additional resources.
        </p>
      </div>

      <div className="space-y-4">
        <label
          className={`w-full p-4 rounded-lg border-2 transition-all text-left cursor-pointer flex items-start ${
            enableGraph
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <input
            type="radio"
            value="true"
            {...register('enable_graph_memory', {
              setValueAs: (v) => v === 'true'
            })}
            className="sr-only"
          />
          <div className="flex items-center gap-3">
            <Database className={`w-6 h-6 flex-shrink-0 ${enableGraph ? 'text-primary-600' : 'text-gray-500'}`} />
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Enable Graph Memory
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Use Neo4j for advanced memory relationships
              </p>
            </div>
          </div>
        </label>

        <label
          className={`w-full p-4 rounded-lg border-2 transition-all text-left cursor-pointer flex items-start ${
            !enableGraph
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <input
            type="radio"
            value="false"
            {...register('enable_graph_memory', {
              setValueAs: (v) => v === 'true'
            })}
            className="sr-only"
          />
          <div className="flex items-center gap-3">
            <Server className={`w-6 h-6 flex-shrink-0 ${!enableGraph ? 'text-primary-600' : 'text-gray-500'}`} />
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Standard Memory Only
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Use vector-based memory without graph relationships
              </p>
            </div>
          </div>
        </label>
      </div>
      </div>
    </div>
  )
}
