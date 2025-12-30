import { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ServiceInstance } from '../../contexts/ServicesContext'

// ============================================================================
// Types
// ============================================================================

export interface ServiceCategory {
  id: string
  name: string
  description: string
}

interface ServiceCategoryListProps {
  /** Service categories to display */
  categories: ServiceCategory[]
  /** Services grouped by category ID */
  servicesByCategory: Record<string, ServiceInstance[]>
  /** Set of expanded category IDs */
  expandedCategories: Set<string>
  /** Callback when category is toggled */
  onToggleCategory: (categoryId: string) => void
  /** Render function for each service card */
  renderServiceCard: (service: ServiceInstance) => ReactNode
}

// ============================================================================
// Default Categories
// ============================================================================

export const DEFAULT_CATEGORIES: ServiceCategory[] = [
  { id: 'memory', name: 'Memory', description: 'Knowledge storage and retrieval' },
  { id: 'llm', name: 'Language Models', description: 'AI language model providers' },
  { id: 'transcription', name: 'Transcription', description: 'Speech-to-text services' },
]

// ============================================================================
// Component
// ============================================================================

/**
 * Accordion list of service categories.
 *
 * Each category can be expanded/collapsed to show its services.
 * Uses render prop pattern for service card rendering.
 *
 * @example
 * <ServiceCategoryList
 *   categories={DEFAULT_CATEGORIES}
 *   servicesByCategory={servicesByCategory}
 *   expandedCategories={expandedCategories}
 *   onToggleCategory={toggleCategory}
 *   renderServiceCard={(service) => (
 *     <ServiceCard
 *       key={service.service_id}
 *       service={service}
 *       // ... other props
 *     />
 *   )}
 * />
 */
export function ServiceCategoryList({
  categories,
  servicesByCategory,
  expandedCategories,
  onToggleCategory,
  renderServiceCard,
}: ServiceCategoryListProps) {
  return (
    <div id="service-categories" className="space-y-4">
      {categories.map((category) => {
        const categoryServices = servicesByCategory[category.id] || []

        // Skip empty categories
        if (categoryServices.length === 0) return null

        const isExpanded = expandedCategories.has(category.id)

        return (
          <div
            key={category.id}
            id={`category-${category.id}`}
            className="card"
          >
            {/* Category Header */}
            <button
              id={`category-header-${category.id}`}
              onClick={() => onToggleCategory(category.id)}
              className="w-full p-6 flex items-center space-x-4 hover:opacity-70 transition-opacity text-left"
              aria-expanded={isExpanded}
              aria-controls={`category-${category.id}-content`}
            >
              {isExpanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                  {category.name}
                </h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {category.description}
                </p>
              </div>
            </button>

            {/* Category Services Grid */}
            {isExpanded && (
              <div
                id={`category-${category.id}-content`}
                className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {categoryServices.map(renderServiceCard)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ServiceCategoryList
