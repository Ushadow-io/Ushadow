/**
 * Token Manager for Launcher
 *
 * Manages OAuth tokens (Keycloak) in the launcher's localStorage.
 * Tokens are shared across all environment iframes via postMessage API.
 */

const TOKEN_KEY = 'kc_access_token'
const REFRESH_TOKEN_KEY = 'kc_refresh_token'
const ID_TOKEN_KEY = 'kc_id_token'
const EXPIRES_AT_KEY = 'kc_expires_at'
const REFRESH_EXPIRES_AT_KEY = 'kc_refresh_expires_at'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  refresh_expires_in?: number
  token_type?: string
}

interface DecodedToken {
  exp: number
  iat: number
  sub: string
  preferred_username?: string
  email?: string
  name?: string
  [key: string]: any
}

export class TokenManager {
  /**
   * Store tokens in localStorage with expiry times
   */
  static storeTokens(tokens: TokenResponse): void {
    const now = Math.floor(Date.now() / 1000)

    if (tokens.access_token) {
      localStorage.setItem(TOKEN_KEY, tokens.access_token)
    }
    if (tokens.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token)
    }
    if (tokens.id_token) {
      localStorage.setItem(ID_TOKEN_KEY, tokens.id_token)
    }

    // Store expiry times
    if (tokens.expires_in) {
      const expiresAt = now + tokens.expires_in
      localStorage.setItem(EXPIRES_AT_KEY, expiresAt.toString())
      console.log('[TokenManager] Access token expires in:', tokens.expires_in, 'seconds')
    }

    if (tokens.refresh_expires_in) {
      const refreshExpiresAt = now + tokens.refresh_expires_in
      localStorage.setItem(REFRESH_EXPIRES_AT_KEY, refreshExpiresAt.toString())
      console.log('[TokenManager] Refresh token expires in:', tokens.refresh_expires_in, 'seconds')
    }
  }

  /**
   * Get access token from storage
   */
  static getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
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
   * Check if user is authenticated (has valid token)
   */
  static isAuthenticated(): boolean {
    const token = this.getAccessToken()
    if (!token) {
      console.log('[TokenManager] No access token found')
      return false
    }

    try {
      const decoded = this.decodeToken(token)
      const now = Math.floor(Date.now() / 1000)
      const isValid = decoded.exp > now
      const expiresIn = decoded.exp - now

      console.log('[TokenManager] Token check:', {
        isValid,
        expiresIn: `${Math.floor(expiresIn / 60)}m ${expiresIn % 60}s`,
        expiresAt: new Date(decoded.exp * 1000).toISOString(),
      })

      if (!isValid) {
        console.warn('[TokenManager] ⚠️ Token EXPIRED!')
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
      return this.decodeToken(token)
    } catch (error) {
      console.error('[TokenManager] Failed to decode token:', error)
      return null
    }
  }

  /**
   * Decode JWT token (simple base64 decode)
   */
  private static decodeToken(token: string): DecodedToken {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format')
    }

    const payload = parts[1]
    const decoded = JSON.parse(atob(payload))
    return decoded as DecodedToken
  }

  /**
   * Get all tokens as object (for sharing with iframes)
   */
  static getAllTokens(): { token: string | null; refreshToken: string | null; idToken: string | null } {
    return {
      token: this.getAccessToken(),
      refreshToken: this.getRefreshToken(),
      idToken: this.getIdToken(),
    }
  }
}
