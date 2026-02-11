/**
 * Service Token Manager
 * 
 * Manages Chronicle-compatible JWT tokens generated from Keycloak tokens.
 * This bridges Keycloak OIDC authentication with legacy JWT-based services.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

export interface ServiceTokenResponse {
  service_token: string
  token_type: string
  expires_in: number
}

/**
 * Exchange a Keycloak token for a Chronicle-compatible service token.
 * 
 * @param keycloakToken - The Keycloak access token from sessionStorage
 * @param audiences - Services this token should be valid for (default: ["ushadow", "chronicle"])
 * @returns Service token that Chronicle and other services can validate
 */
export async function getServiceToken(
  keycloakToken: string,
  audiences?: string[]
): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/api/auth/token/service-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${keycloakToken}`
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
 * Automatically retrieves the Keycloak token from local storage.
 *
 * @returns Service token ready to use with Chronicle WebSocket
 */
export async function getChronicleToken(): Promise<string> {
  const keycloakToken = localStorage.getItem('kc_access_token')

  if (!keycloakToken) {
    throw new Error('No Keycloak token found. Please log in first.')
  }

  return getServiceToken(keycloakToken, ['ushadow', 'chronicle'])
}
