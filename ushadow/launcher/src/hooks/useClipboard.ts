import { writeText, readText } from '@tauri-apps/api/clipboard'

/**
 * Hook for clipboard operations using Tauri's native clipboard API.
 *
 * Uses Tauri's clipboard API which provides:
 * - No browser permission prompts
 * - Consistent behavior across platforms
 * - Same code path as native keyboard shortcuts (Cmd+C, Ctrl+V, etc.)
 */
export function useClipboard() {
  /**
   * Write text to the clipboard
   * @param text - The text to copy to clipboard
   * @returns Promise that resolves when text is copied, or rejects on error
   */
  const copyToClipboard = async (text: string): Promise<void> => {
    try {
      await writeText(text)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      throw err
    }
  }

  /**
   * Read text from the clipboard
   * @returns Promise that resolves with clipboard text, or rejects on error
   */
  const readFromClipboard = async (): Promise<string | null> => {
    try {
      return await readText()
    } catch (err) {
      console.error('Failed to read from clipboard:', err)
      throw err
    }
  }

  return {
    copyToClipboard,
    readFromClipboard,
  }
}
