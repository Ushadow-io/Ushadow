/**
 * useRootServiceFilter - Hide "root" services (core platform + shared infra) in lists.
 *
 * Pattern 5: UI State Hook
 * A service is a root service when its compose x-ushadow tags include "root".
 * They stay hidden until the user turns on the toggle.
 */

import { useMemo, useState } from 'react'

export const ROOT_SERVICE_TAG = 'root'

export interface UseRootServiceFilterResult<T> {
  visible: T[]
  showRoot: boolean
  setShowRoot: (show: boolean) => void
  rootCount: number
}

export function isRootService(service: { tags?: string[] }): boolean {
  return (service.tags || []).includes(ROOT_SERVICE_TAG)
}

export function useRootServiceFilter<T extends { tags?: string[] }>(
  services: T[]
): UseRootServiceFilterResult<T> {
  const [showRoot, setShowRoot] = useState(false)

  const rootCount = useMemo(() => services.filter(isRootService).length, [services])
  const visible = useMemo(
    () => (showRoot ? services : services.filter((s) => !isRootService(s))),
    [services, showRoot]
  )

  return { visible, showRoot, setShowRoot, rootCount }
}
