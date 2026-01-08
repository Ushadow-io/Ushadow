import { useEffect, useState } from 'react'

/**
 * Hook to detect if the window is currently focused
 * Useful for pausing expensive operations when app is in background
 */
export function useWindowFocus(): boolean {
  const [isFocused, setIsFocused] = useState(true)

  useEffect(() => {
    // Set initial state
    setIsFocused(document.hasFocus())

    const handleFocus = () => setIsFocused(true)
    const handleBlur = () => setIsFocused(false)

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  return isFocused
}
