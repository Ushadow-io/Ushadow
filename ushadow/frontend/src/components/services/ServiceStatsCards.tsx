// ============================================================================
// Types
// ============================================================================

interface ServiceStatsCardsProps {
  /** Total number of services installed */
  totalServices: number
  /** Number of services that have configuration */
  configuredServices: number
  /** Number of service categories */
  categoryCount: number
}

// ============================================================================
// Component
// ============================================================================

/**
 * Stats grid showing service counts.
 *
 * Displays three metric cards: total services, configured services, and categories.
 *
 * @example
 * <ServiceStatsCards
 *   totalServices={serviceInstances.length}
 *   configuredServices={Object.keys(serviceConfigs).length}
 *   categoryCount={categories.length}
 * />
 */
export function ServiceStatsCards({
  totalServices,
  configuredServices,
  categoryCount,
}: ServiceStatsCardsProps) {
  return (
    <div id="service-stats" className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="card-hover p-4">
        <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Available Services
        </p>
        <p
          id="stat-total-services"
          className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100"
        >
          {totalServices}
        </p>
      </div>

      <div className="card-hover p-4">
        <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Configured
        </p>
        <p
          id="stat-configured-services"
          className="mt-2 text-2xl font-bold text-success-600 dark:text-success-400"
        >
          {configuredServices}
        </p>
      </div>

      <div className="card-hover p-4">
        <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Categories
        </p>
        <p
          id="stat-category-count"
          className="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400"
        >
          {categoryCount}
        </p>
      </div>
    </div>
  )
}

export default ServiceStatsCards
