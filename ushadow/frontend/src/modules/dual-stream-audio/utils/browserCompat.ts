/**
 * Browser Capability Detection
 *
 * Pure utility functions to detect browser support for audio APIs.
 * No dependencies - works in any React/vanilla JS project.
 */

import type { BrowserCapabilities } from '../core/types'

/**
 * Check if we're in a secure context (HTTPS or localhost)
 */
export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false

  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]'

  const isHttps = window.location.protocol === 'https:'

  return isLocalhost || isHttps
}

/**
 * Check if getUserMedia is available
 */
export function hasGetUserMedia(): boolean {
  return !!(
    navigator?.mediaDevices?.getUserMedia ||
    // @ts-ignore - legacy API
    navigator?.getUserMedia ||
    // @ts-ignore - legacy API
    navigator?.webkitGetUserMedia ||
    // @ts-ignore - legacy API
    navigator?.mozGetUserMedia
  )
}

/**
 * Check if getDisplayMedia is available
 */
export function hasGetDisplayMedia(): boolean {
  return !!navigator?.mediaDevices?.getDisplayMedia
}

/**
 * Check if AudioContext is available
 */
export function hasAudioContext(): boolean {
  return !!(
    // @ts-ignore - vendor prefixes
    window.AudioContext || window.webkitAudioContext
  )
}

/**
 * Check if ScriptProcessorNode is available
 */
export function hasScriptProcessor(): boolean {
  if (!hasAudioContext()) return false

  try {
    // @ts-ignore - vendor prefixes
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioContextConstructor()
    const hasMethod = typeof ctx.createScriptProcessor === 'function'
    ctx.close()
    return hasMethod
  } catch {
    return false
  }
}

/**
 * Detect browser name and version
 */
export function getBrowserInfo(): { name: string; version: string } {
  const ua = navigator.userAgent
  let name = 'Unknown'
  let version = 'Unknown'

  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    name = 'Chrome'
    const match = ua.match(/Chrome\/(\d+)/)
    version = match ? match[1] : 'Unknown'
  } else if (ua.includes('Edg')) {
    name = 'Edge'
    const match = ua.match(/Edg\/(\d+)/)
    version = match ? match[1] : 'Unknown'
  } else if (ua.includes('Firefox')) {
    name = 'Firefox'
    const match = ua.match(/Firefox\/(\d+)/)
    version = match ? match[1] : 'Unknown'
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    name = 'Safari'
    const match = ua.match(/Version\/(\d+)/)
    version = match ? match[1] : 'Unknown'
  }

  return { name, version }
}

/**
 * Check if browser can capture tab audio
 * (Chrome/Edge/Firefox support this well, Safari limited)
 */
export function canCaptureTabAudio(): boolean {
  const { name } = getBrowserInfo()
  return ['Chrome', 'Edge', 'Firefox'].includes(name)
}

/**
 * Check if browser can capture window audio
 * (Chrome/Edge support this, Firefox limited, Safari no)
 */
export function canCaptureWindowAudio(): boolean {
  const { name } = getBrowserInfo()
  return ['Chrome', 'Edge'].includes(name)
}

/**
 * Get complete browser capabilities
 */
export function getBrowserCapabilities(): BrowserCapabilities {
  const capabilities = {
    hasGetUserMedia: hasGetUserMedia(),
    hasGetDisplayMedia: hasGetDisplayMedia(),
    hasAudioContext: hasAudioContext(),
    hasScriptProcessor: hasScriptProcessor(),
    canCaptureTabAudio: canCaptureTabAudio(),
    canCaptureWindowAudio: canCaptureWindowAudio(),
    requiresHttps: !isSecureContext(),
    isSupported: false
  }

  // Overall support check
  capabilities.isSupported =
    capabilities.hasGetUserMedia &&
    capabilities.hasAudioContext &&
    capabilities.hasScriptProcessor &&
    isSecureContext()

  return capabilities
}

/**
 * Get user-friendly error message for unsupported browsers
 */
export function getUnsupportedMessage(capabilities: BrowserCapabilities): string {
  if (!isSecureContext()) {
    return 'Microphone access requires HTTPS or localhost. Please use a secure connection.'
  }

  if (!capabilities.hasGetUserMedia) {
    return 'Your browser does not support microphone access. Please update to a modern browser.'
  }

  if (!capabilities.hasAudioContext) {
    return 'Your browser does not support Web Audio API. Please update your browser.'
  }

  if (!capabilities.hasScriptProcessor) {
    return 'Your browser does not support audio processing. Please update your browser.'
  }

  if (!capabilities.hasGetDisplayMedia) {
    return 'Screen/tab audio capture is not supported in your browser. Dual-stream mode unavailable.'
  }

  return 'Unknown compatibility issue. Please try a different browser.'
}

/**
 * Check if dual-stream mode is supported
 */
export function isDualStreamSupported(): boolean {
  const capabilities = getBrowserCapabilities()
  return capabilities.isSupported && capabilities.hasGetDisplayMedia
}

/**
 * Log browser capabilities (useful for debugging)
 */
export function logBrowserCapabilities(): void {
  const capabilities = getBrowserCapabilities()
  const browserInfo = getBrowserInfo()

  console.log('🔍 Browser Capabilities:', {
    browser: `${browserInfo.name} ${browserInfo.version}`,
    secureContext: isSecureContext(),
    ...capabilities
  })
}
