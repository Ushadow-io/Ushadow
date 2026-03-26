/**
 * Service Token Manager
 *
 * Manages Chronicle-compatible JWT tokens generated from Casdoor tokens.
 * This bridges Casdoor OIDC authentication with legacy JWT-based services.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

export interface ServiceTokenResponse {
  service_token: string
  token_type: string
  expires_in: number
}

/**
 * Exchange a Casdoor token for a Chronicle-compatible service token.
 *
 * @param accessToken - The Casdoor access token from localStorage
 * @param audiences - Services this token should be valid for (default: ["ushadow", "chronicle"])
 * @returns Service token that Chronicle and other services can validate
 */
export async function getServiceToken(
  accessToken: string,
  audiences?: string[]
): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/api/auth/token/service-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ audiences })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(`Failed to get service token: ${error.detail}`)
  }

  const data: ServiceTokenResponse = await response.json()
  return data.service_token
}

/**
 * Get a Chronicle-compatible token for the current user.
 * Automatically retrieves the Casdoor token from local storage.
 *
 * @returns Service token ready to use with Chronicle WebSocket
 */
export async function getChronicleToken(): Promise<string> {
  const accessToken = localStorage.getItem('kc_access_token')

  if (!accessToken) {
    throw new Error('No access token found. Please log in first.')
  }

  return getServiceToken(accessToken, ['ushadow', 'chronicle'])
}
