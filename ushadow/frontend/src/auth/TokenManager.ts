/**
 * Token Manager
 *
 * Handles OIDC token storage, retrieval, and validation.
 * Uses localStorage for persistence across browser sessions.
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
   * Check if running inside launcher iframe
   *
   * Simple check: if we're in an iframe, assume it's the launcher.
   * Will attempt to request tokens via postMessage (worst case: 5s timeout if wrong).
   */
  private static isInLauncher(): boolean {
    return window.parent !== window
  }

  /**
   * Store tokens in localStorage with expiry times
   */
  static storeTokens(tokens: TokenResponse): void {
    const now = Math.floor(Date.now() / 1000)

    // Store tokens (or remove if not provided)
    if (tokens.access_token) {
      localStorage.setItem(TOKEN_KEY, tokens.access_token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }

    if (tokens.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY)
    }

    if (tokens.id_token) {
      localStorage.setItem(ID_TOKEN_KEY, tokens.id_token)
    } else {
      localStorage.removeItem(ID_TOKEN_KEY)
    }

    // Store expiry times (OAuth2 standard: use expires_in from token response)
    if (tokens.expires_in) {
      const expiresAt = now + tokens.expires_in
      localStorage.setItem(EXPIRES_AT_KEY, expiresAt.toString())
      console.log('[TokenManager] Access token expires in:', tokens.expires_in, 'seconds')
    } else {
      localStorage.removeItem(EXPIRES_AT_KEY)
    }

    // Store refresh token expiry if provided
    if (tokens.refresh_expires_in) {
      const refreshExpiresAt = now + tokens.refresh_expires_in
      localStorage.setItem(REFRESH_EXPIRES_AT_KEY, refreshExpiresAt.toString())
      console.log('[TokenManager] Refresh token expires in:', tokens.refresh_expires_in, 'seconds')
    } else {
      localStorage.removeItem(REFRESH_EXPIRES_AT_KEY)
    }
  }

  /**
   * Get access token from storage (or from launcher if in iframe)
   */
  static async getAccessToken(): Promise<string | null> {
    // If in launcher iframe, request token from parent
    if (this.isInLauncher()) {
      return this.getTokenFromLauncher()
    }

    // Otherwise use localStorage
    return localStorage.getItem(TOKEN_KEY)
  }

  /**
   * Get access token synchronously (for backwards compatibility)
   */
  static getAccessTokenSync(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  }

  /**
   * Request token from launcher via postMessage
   * Caches tokens in localStorage for synchronous access
   */
  private static async getTokenFromLauncher(): Promise<string | null> {
    return new Promise((resolve) => {
      console.log('[TokenManager] Requesting token from launcher...')

      // Send request to launcher
      window.parent.postMessage({ type: 'GET_KC_TOKEN' }, '*')

      // Listen for response
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'KC_TOKEN_RESPONSE') {
          window.removeEventListener('message', handler)

          const tokens = event.data.tokens
          console.log('[TokenManager] Received tokens from launcher:', {
            hasToken: !!tokens.token,
            hasRefresh: !!tokens.refreshToken,
            hasId: !!tokens.idToken
          })

          // Cache tokens in iframe localStorage for synchronous access
          if (tokens.token) {
            localStorage.setItem(TOKEN_KEY, tokens.token)
          }
          if (tokens.refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
          }
          if (tokens.idToken) {
            localStorage.setItem(ID_TOKEN_KEY, tokens.idToken)
          }

          console.log('[TokenManager] ✓ Tokens cached in iframe localStorage')
          resolve(tokens.token)
        }
      }

      window.addEventListener('message', handler)

      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler)
        console.warn('[TokenManager] ⚠️ Timeout requesting token from launcher')
        resolve(null)
      }, 5000)
    })
  }

  /**
   * Get refresh token from storage
   */
  static getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  }

  /**
   * Get ID token from storage
   */
  static getIdToken(): string | null {
    return localStorage.getItem(ID_TOKEN_KEY)
  }

  /**
   * Clear all tokens from storage
   */
  static clearTokens(): void {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(ID_TOKEN_KEY)
    localStorage.removeItem(EXPIRES_AT_KEY)
    localStorage.removeItem(REFRESH_EXPIRES_AT_KEY)
  }

  /**
   * Clean up stale token values (removes "null" or "undefined" strings)
   *
   * This handles cases where tokens were accidentally set to the string "null"
   * instead of being removed. Should be called on app initialization.
   */
  static cleanupStaleTokens(): void {
    const keys = [TOKEN_KEY, REFRESH_TOKEN_KEY, ID_TOKEN_KEY, EXPIRES_AT_KEY, REFRESH_EXPIRES_AT_KEY]

    for (const key of keys) {
      const value = sessionStorage.getItem(key)
      if (value === 'null' || value === 'undefined' || value === '') {
        sessionStorage.removeItem(key)
        console.log(`[TokenManager] Cleaned up stale value for ${key}`)
      }
    }
  }

  /**
   * Get access token expiry info from storage (OAuth2 standard)
   */
  static getTokenExpiry(): { expiresAt: number; expiresIn: number } | null {
    const expiresAtStr = localStorage.getItem(EXPIRES_AT_KEY)
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
    const expiresAtStr = localStorage.getItem(REFRESH_EXPIRES_AT_KEY)
    if (!expiresAtStr) return null

    const expiresAt = parseInt(expiresAtStr, 10)
    const now = Math.floor(Date.now() / 1000)
    const expiresIn = expiresAt - now

    return { expiresAt, expiresIn }
  }

  /**
   * Check if user is authenticated (has valid token)
   *
   * If running in launcher, attempts to get token from parent first.
   * This is an async operation that will resolve quickly (cached or from launcher).
   */
  static async isAuthenticatedAsync(): Promise<boolean> {
    // If in launcher, request token from parent first
    if (this.isInLauncher()) {
      const token = await this.getTokenFromLauncher()
      if (!token) {
        console.log('[TokenManager] No token from launcher')
        return false
      }
      // Token is now cached in localStorage, continue with validation below
    }

    // Check for Keycloak token (localStorage)
    let token = localStorage.getItem(TOKEN_KEY)

    // Check for native token (localStorage - persists)
    if (!token) {
      token = localStorage.getItem('ushadow_access_token')
    }

    if (!token) {
      console.log('[TokenManager] No access token found in localStorage')
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
        // CRITICAL: Clear expired token to prevent 401 errors
        console.log('[TokenManager] Clearing expired token from storage')
        this.clearTokens()
      }

      return isValid
    } catch (error) {
      console.error('[TokenManager] Invalid token:', error)
      return false
    }
  }

  /**
   * Check if user is authenticated (synchronous version)
   *
   * Note: This only checks localStorage and won't request from launcher.
   * Use isAuthenticatedAsync() for launcher-aware check.
   */
  static isAuthenticated(): boolean {
    // Check for Keycloak token first (localStorage)
    let token = localStorage.getItem(TOKEN_KEY)

    // Check for native token (localStorage - persists)
    if (!token) {
      token = localStorage.getItem('ushadow_access_token')
    }

    if (!token) {
      console.log('[TokenManager] No access token found in localStorage')
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
        // CRITICAL: Clear expired token to prevent 401 errors
        console.log('[TokenManager] Clearing expired token from storage')
        this.clearTokens()
      }

      return isValid
    } catch (error) {
      console.error('[TokenManager] Invalid token:', error)
      return false
    }
  }

  /**
   * Get user info from decoded token (synchronous - uses localStorage)
   */
  static getUserInfo(): any | null {
    const token = localStorage.getItem(TOKEN_KEY)
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
      scope: 'openid profile email offline_access',
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
