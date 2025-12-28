/**
 * Shared wizard utilities
 */

/**
 * Extract error message from API error response
 */
export function getErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  if (error instanceof Error) {
    const err = error as Error & { response?: { data?: { detail?: string } } }
    return err.response?.data?.detail || err.message || fallback
  }
  return fallback
}

/**
 * Common Zod refinements
 */
export const zodPatterns = {
  // API key patterns
  openaiKey: /^sk-[a-zA-Z0-9]{20,}$/,
  anthropicKey: /^sk-ant-[a-zA-Z0-9-]+$/,

  // Validate that passwords match
  passwordsMatch: (data: { password?: string; confirmPassword?: string }) => {
    if (!data.password || !data.confirmPassword) return true
    return data.password === data.confirmPassword
  },
}

/**
 * Common field configurations for wizards
 */
export const fieldConfig = {
  openai: {
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    link: 'https://platform.openai.com/api-keys',
    linkText: 'Get API Key',
  },
  anthropic: {
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-...',
    link: 'https://console.anthropic.com/settings/keys',
    linkText: 'Get API Key',
  },
  deepgram: {
    label: 'Deepgram API Key',
    placeholder: 'Enter Deepgram API key',
    link: 'https://console.deepgram.com/project/default/keys',
    linkText: 'Get API Key',
  },
  mistral: {
    label: 'Mistral API Key',
    placeholder: 'Enter Mistral API key',
    link: 'https://console.mistral.ai/api-keys',
    linkText: 'Get API Key',
  },
}
