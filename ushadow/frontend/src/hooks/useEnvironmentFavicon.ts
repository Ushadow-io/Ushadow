import { useEffect } from 'react'
import { VALID_COLORS } from '../components/layout/EnvironmentBanner'

/**
 * Color values for favicon generation.
 * Using the 500 shade for good visibility in browser tabs.
 */
const COLOR_HEX_MAP: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  pink: '#ec4899',
  orange: '#f97316',
  amber: '#f59e0b',
  lime: '#84cc16',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  fuchsia: '#d946ef',
  rose: '#f43f5e',
  gray: '#6b7280',
}

/**
 * Generates an SVG favicon with the environment color.
 * Creates a simple "U" shape to represent Ushadow.
 */
function generateFaviconSvg(color: string): string {
  // Simple circular favicon with U for Ushadow
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="16" fill="${color}"/>
    <text x="16" y="22" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="18" fill="white">U</text>
  </svg>`
}

/**
 * Hook that sets a dynamic favicon based on the current environment.
 * Only activates in development mode when VITE_ENV_NAME is set.
 */
export function useEnvironmentFavicon() {
  const envName = import.meta.env.VITE_ENV_NAME as string | undefined
  const nodeEnv = import.meta.env.MODE

  useEffect(() => {
    // Only set dynamic favicon in development with env name
    if (nodeEnv !== 'development' || !envName) {
      return
    }

    const normalizedEnv = envName.toLowerCase()
    const color = VALID_COLORS.includes(normalizedEnv)
      ? COLOR_HEX_MAP[normalizedEnv]
      : COLOR_HEX_MAP.gray

    // Generate SVG and convert to data URL
    const svg = generateFaviconSvg(color)
    const encodedSvg = encodeURIComponent(svg)
    const dataUrl = `data:image/svg+xml,${encodedSvg}`

    // Find or create favicon link element
    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }

    // Set the dynamic favicon
    link.type = 'image/svg+xml'
    link.href = dataUrl

    // Also update the page title to include environment
    const baseTitle = 'ushadow - AI Orchestration Platform'
    document.title = `[${envName.toUpperCase()}] ${baseTitle}`
  }, [envName, nodeEnv])
}
