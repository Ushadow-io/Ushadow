/**
 * Token Manager
 *
 * Handles OIDC token storage, retrieval, and validation.
 * Uses sessionStorage for security (tokens cleared when tab closes).
 */

import { jwtDecode } from 'jwt-decode'

const TOKEN_KEY = 'kc_access_token'
const REFRESH_TOKEN_KEY = 'kc_refresh_token'
const ID_TOKEN_KEY = 'kc_id_token'
const EXPIRES_AT_KEY = 'kc_expires_at' // Timestamp when access_token expires
const REFRESH_EXPIRES_AT_KEY = 'kc_refresh_expires_at' // Timestamp when refresh_token expires

interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in?: number // Access token lifetime in seconds
  refresh_expires_in?: number // Refresh token lifetime in seconds
  token_type?: string
}

interface LoginUrlParams {
  keycloakUrl: string
  realm: string
  clientId: string
  redirectUri: string
  state: string
}

interface LogoutUrlParams {
  keycloakUrl: string
  realm: string
  redirectUri: string
}

interface DecodedToken {
  exp: number
  iat: number
  sub: string
  preferred_username?: string
  email?: string
  name?: string
  given_name?: string
  family_name?: string
  [key: string]: any
}

export class TokenManager {
  /**
   * Store tokens in sessionStorage with expiry times
   */
  static storeTokens(tokens: TokenResponse): void {
    const now = Math.floor(Date.now() / 1000)

    if (tokens.access_token) {
      sessionStorage.setItem(TOKEN_KEY, tokens.access_token)
    }
    if (tokens.refresh_token) {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
    }
    if (tokens.id_token) {
      sessionStorage.setItem(ID_TOKEN_KEY, tokens.id_token)
    }

    // Store expiry times (OAuth2 standard: use expires_in from token response)
    if (tokens.expires_in) {
      const expiresAt = now + tokens.expires_in
      sessionStorage.setItem(EXPIRES_AT_KEY, expiresAt.toString())
      console.log('[TokenManager] Access token expires in:', tokens.expires_in, 'seconds')
    }

    // Store refresh token expiry if provided
    if (tokens.refresh_expires_in) {
      const refreshExpiresAt = now + tokens.refresh_expires_in
      sessionStorage.setItem(REFRESH_EXPIRES_AT_KEY, refreshExpiresAt.toString())
      console.log('[TokenManager] Refresh token expires in:', tokens.refresh_expires_in, 'seconds')
    }
  }

  /**
   * Get access token from storage
   */
  static getAccessToken(): string | null {
    return sessionStorage.getItem(TOKEN_KEY)
  }

  /**
   * Get refresh token from storage
   */
  static getRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY)
  }

  /**
   * Get ID token from storage
   */
  static getIdToken(): string | null {
    return sessionStorage.getItem(ID_TOKEN_KEY)
  }

  /**
   * Clear all tokens from storage
   */
  static clearTokens(): void {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    sessionStorage.removeItem(ID_TOKEN_KEY)
    sessionStorage.removeItem(EXPIRES_AT_KEY)
    sessionStorage.removeItem(REFRESH_EXPIRES_AT_KEY)
  }

  /**
   * Get access token expiry info from storage (OAuth2 standard)
   */
  static getTokenExpiry(): { expiresAt: number; expiresIn: number } | null {
    const expiresAtStr = sessionStorage.getItem(EXPIRES_AT_KEY)
    if (!expiresAtStr) return null

    const expiresAt = parseInt(expiresAtStr, 10)
    const now = Math.floor(Date.now() / 1000)
    const expiresIn = expiresAt - now

    return { expiresAt, expiresIn }
  }

  /**
   * Get refresh token expiry info from storage (OAuth2 standard)
   */
  static getRefreshTokenExpiry(): { expiresAt: number; expiresIn: number } | null {
    const expiresAtStr = sessionStorage.getItem(REFRESH_EXPIRES_AT_KEY)
    if (!expiresAtStr) return null

    const expiresAt = parseInt(expiresAtStr, 10)
    const now = Math.floor(Date.now() / 1000)
    const expiresIn = expiresAt - now

    return { expiresAt, expiresIn }
  }

  /**
   * Check if user is authenticated (has valid token)
   */
  static isAuthenticated(): boolean {
    const token = this.getAccessToken()
    if (!token) {
      console.log('[TokenManager] No access token found')
      return false
    }

    try {
      const decoded = jwtDecode<DecodedToken>(token)
      const now = Math.floor(Date.now() / 1000)
      const isValid = decoded.exp > now
      const expiresIn = decoded.exp - now

      console.log('[TokenManager] Token check:', {
        isValid,
        expiresIn: `${Math.floor(expiresIn / 60)}m ${expiresIn % 60}s`,
        expiresAt: new Date(decoded.exp * 1000).toISOString(),
        now: new Date(now * 1000).toISOString()
      })

      if (!isValid) {
        console.warn('[TokenManager] ⚠️ Token EXPIRED!', {
          expiredAgo: `${Math.floor(Math.abs(expiresIn) / 60)}m ${Math.abs(expiresIn) % 60}s ago`
        })
      }

      return isValid
    } catch (error) {
      console.error('[TokenManager] Invalid token:', error)
      return false
    }
  }

  /**
   * Get user info from decoded token
   */
  static getUserInfo(): any | null {
    const token = this.getAccessToken()
    if (!token) return null

    try {
      const decoded = jwtDecode<DecodedToken>(token)
      return {
        sub: decoded.sub,
        username: decoded.preferred_username,
        email: decoded.email,
        name: decoded.name,
        given_name: decoded.given_name,
        family_name: decoded.family_name,
        // Include all other claims
        ...decoded,
      }
    } catch (error) {
      console.error('Failed to decode token:', error)
      return null
    }
  }

  /**
   * Build Keycloak login URL with PKCE
   */
  static async buildLoginUrl(params: LoginUrlParams): Promise<string> {
    const { keycloakUrl, realm, clientId, redirectUri, state } = params

    // Generate PKCE code verifier and challenge
    const codeVerifier = this.generateCodeVerifier()
    const codeChallenge = await this.generateCodeChallenge(codeVerifier)

    // Store code verifier for token exchange
    sessionStorage.setItem('pkce_code_verifier', codeVerifier)

    const authUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth`
    const queryParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    return `${authUrl}?${queryParams.toString()}`
  }

  /**
   * Build Keycloak logout URL
   */
  static buildLogoutUrl(params: LogoutUrlParams): string {
    const { keycloakUrl, realm, redirectUri } = params
    const logoutUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/logout`

    // Get id_token from storage for proper logout
    const idToken = this.getIdToken()

    const queryParams = new URLSearchParams({
      post_logout_redirect_uri: redirectUri,
    })

    // Add id_token_hint if available (recommended by OIDC spec)
    if (idToken) {
      queryParams.set('id_token_hint', idToken)
    }

    return `${logoutUrl}?${queryParams.toString()}`
  }

  /**
   * Exchange authorization code for tokens via backend
   */
  static async exchangeCodeForTokens(
    code: string,
    backendUrl: string
  ): Promise<TokenResponse> {
    const codeVerifier = sessionStorage.getItem('pkce_code_verifier')
    if (!codeVerifier) {
      throw new Error('Missing PKCE code verifier')
    }

    const response = await fetch(`${backendUrl}/api/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: `${window.location.origin}/oauth/callback`,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${error}`)
    }

    const tokens = await response.json()

    // Clean up code verifier
    sessionStorage.removeItem('pkce_code_verifier')

    return tokens
  }

  /**
   * Extract tokens from callback URL
   */
  static extractTokensFromCallback(url: string): {
    code?: string
    state?: string
    error?: string
    error_description?: string
  } {
    const urlObj = new URL(url)
    const params = new URLSearchParams(urlObj.search)

    return {
      code: params.get('code') || undefined,
      state: params.get('state') || undefined,
      error: params.get('error') || undefined,
      error_description: params.get('error_description') || undefined,
    }
  }

  /**
   * Refresh access token using refresh token directly with Keycloak.
   *
   * @deprecated Use backend /api/auth/refresh endpoint instead.
   * Direct Keycloak calls can fail with "token not active" errors if the
   * SSO session has expired or refresh token was rotated.
   *
   * This is the standard OAuth2/OIDC approach:
   * - Frontend manages its own token lifecycle
   * - No issuer mismatch issues (uses same Keycloak URL as login)
   * - Works from any domain (localhost, Tailscale, etc.)
   */
  static async refreshAccessToken(
    keycloakUrl: string,
    realm: string,
    clientId: string
  ): Promise<TokenResponse> {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    console.log('[TokenManager] Refreshing access token with Keycloak...')

    const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[TokenManager] Token refresh failed:', error)
      throw new Error(`Token refresh failed: ${error}`)
    }

    const tokens = await response.json()
    console.log('[TokenManager] ✅ Token refreshed successfully')

    return tokens
  }

  // PKCE helpers

  /**
   * Generate PKCE code verifier (random string)
   */
  private static generateCodeVerifier(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return this.base64UrlEncode(array)
  }

  /**
   * Generate PKCE code challenge (SHA-256 hash of verifier)
   */
  private static async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return this.base64UrlEncode(new Uint8Array(hash))
  }

  /**
   * Base64 URL encode (for PKCE)
   */
  private static base64UrlEncode(array: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...Array.from(array)))
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }
}
