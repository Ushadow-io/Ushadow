/**
 * Generic hook for managing QR code fetching and display
 *
 * Provides a reusable way to fetch and display any type of QR code
 * across the application (mobile connection, Tailscale auth, etc.)
 *
 * @example
 * // Mobile connection QR
 * const qr = useQrCode(() => tailscaleApi.getMobileConnectionQR())
 *
 * @example
 * // Tailscale auth QR
 * const qr = useQrCode(() => tailscaleApi.getAuthUrl(false))
 */

import { useState, useCallback } from 'react'
import { tailscaleApi } from '../services/api'

export interface QrCodeData {
  qr_code_data: string
  [key: string]: any // Allow additional fields
}

export interface UseQrCodeOptions<T extends QrCodeData> {
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
}

export function useQrCode<T extends QrCodeData = QrCodeData>(
  fetcher: () => Promise<{ data: T }>,
  options?: UseQrCodeOptions<T>
) {
  const [qrData, setQrData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchQrCode = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetcher()
      setQrData(response.data)
      setShowModal(true)
      options?.onSuccess?.(response.data)
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(err.message || 'Failed to generate QR code')
      setError(error)
      console.error('Error fetching QR code:', error)

      // Call custom error handler or show default alert
      if (options?.onError) {
        options.onError(error)
      } else {
        alert(`Failed to generate QR code: ${err.response?.data?.detail || error.message}`)
      }
    } finally {
      setLoading(false)
    }
  }, [fetcher, options])

  const closeModal = useCallback(() => {
    setShowModal(false)
  }, [])

  const reset = useCallback(() => {
    setQrData(null)
    setError(null)
    setShowModal(false)
  }, [])

  return {
    qrData,
    loading,
    showModal,
    error,
    fetchQrCode,
    closeModal,
    reset,
  }
}

// Convenience hook for mobile connection QR code
// Usage: const qr = useMobileQrCode()
export function useMobileQrCode(options?: UseQrCodeOptions<any>) {
  return useQrCode(() => tailscaleApi.getMobileConnectionQR(), options)
}
