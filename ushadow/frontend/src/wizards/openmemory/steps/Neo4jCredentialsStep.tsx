import { useFormContext } from 'react-hook-form'
import type { OpenMemoryFormData } from '../schema'

export default function Neo4jCredentialsStep(_props: any) {
  const { register, formState: { errors } } = useFormContext<OpenMemoryFormData>()

  return (
    <div className="p-6 min-h-[300px]">
      <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Neo4j Credentials
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Set up credentials for your Neo4j database.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Username
          </label>
          <input
            type="text"
            {...register('neo4j_username')}
            placeholder="neo4j"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Default username is "neo4j"
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Password *
          </label>
          <input
            type="password"
            {...register('neo4j_password')}
            placeholder="Minimum 8 characters"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
          {errors.neo4j_password && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.neo4j_password.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Confirm Password *
          </label>
          <input
            type="password"
            {...register('neo4j_confirm_password')}
            placeholder="Re-enter password"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
          {errors.neo4j_confirm_password && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.neo4j_confirm_password.message}
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
