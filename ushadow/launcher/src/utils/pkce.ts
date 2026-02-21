/**
 * PKCE (Proof Key for Code Exchange) Utilities
 *
 * Implements OAuth 2.0 PKCE flow for secure authorization without client secrets.
 * Used by the launcher's OAuth flow.
 */

/**
 * Generate a random code verifier for PKCE
 * @returns Base64 URL-encoded random string
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

/**
 * Generate code challenge from verifier using SHA-256
 * @param verifier - The code verifier
 * @returns Base64 URL-encoded SHA-256 hash of verifier
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}

/**
 * Generate a random state parameter for CSRF protection
 * @returns Random string
 */
export function generateState(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  )
}

/**
 * Base64 URL encode (for PKCE)
 * @param array - Byte array to encode
 * @returns Base64 URL-encoded string
 */
function base64UrlEncode(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(array)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
