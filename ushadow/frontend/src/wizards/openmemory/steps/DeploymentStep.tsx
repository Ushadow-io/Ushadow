import { useFormContext } from 'react-hook-form'
import { Server } from 'lucide-react'
import type { OpenMemoryFormData } from '../schema'

export default function DeploymentStep(_props: any) {
  const { register, watch, formState: { errors } } = useFormContext<OpenMemoryFormData>()
  const deploymentType = watch('deployment_type')

  return (
    <div className="p-6 min-h-[300px]">
      <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          OpenMemory Deployment
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Use an existing OpenMemory server or create a new one.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label
          className={`p-6 rounded-lg border-2 transition-all text-left cursor-pointer ${
            deploymentType === 'new'
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <input
            type="radio"
            value="new"
            {...register('deployment_type')}
            className="sr-only"
          />
          <div className="flex items-center gap-3 mb-3">
            <Server className={`w-6 h-6 ${deploymentType === 'new' ? 'text-primary-600' : 'text-gray-500'}`} />
            <h4 className="font-semibold text-gray-900 dark:text-white">
              Create New
            </h4>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Set up OpenMemory automatically with Docker containers
          </p>
        </label>

        <label
          className={`p-6 rounded-lg border-2 transition-all text-left cursor-pointer ${
            deploymentType === 'existing'
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          <input
            type="radio"
            value="existing"
            {...register('deployment_type')}
            className="sr-only"
          />
          <div className="flex items-center gap-3 mb-3">
            <Server className={`w-6 h-6 ${deploymentType === 'existing' ? 'text-primary-600' : 'text-gray-500'}`} />
            <h4 className="font-semibold text-gray-900 dark:text-white">
              Use Existing
            </h4>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Connect to an existing OpenMemory server
          </p>
        </label>
      </div>

      {deploymentType === 'existing' && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            OpenMemory Server URL
          </label>
          <input
            type="text"
            {...register('server_url')}
            placeholder="http://openmemory:8765"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
          />
          {errors.server_url && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.server_url.message}
            </p>
          )}
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            URL of your existing OpenMemory MCP server
          </p>
        </div>
      )}
      </div>
    </div>
  )
}
