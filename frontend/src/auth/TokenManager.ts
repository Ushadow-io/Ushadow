/**
 * Token Management with Simple Re-login Strategy
 *
 * Strategy: When tokens expire, redirect user back to Keycloak login.
 * - Simpler than auto-refresh
 * - More secure (forces re-authentication)
 * - Good UX for short sessions (voice message sharing)
 */

import { jwtDecode } from 'jwt-decode';

interface TokenData {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_at: number; // Unix timestamp
}

interface DecodedToken {
  exp: number;
  iat: number;
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

export class TokenManager {
  private static readonly STORAGE_KEY = 'keycloak_tokens';
  private static readonly EXPIRY_BUFFER_SECONDS = 60; // Refresh 60s before expiry

  /**
   * Store tokens after successful login
   */
  static storeTokens(tokenData: TokenData): void {
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(tokenData));
  }

  /**
   * Get current access token if valid, null if expired
   */
  static getAccessToken(): string | null {
    const tokens = this.getTokens();
    if (!tokens) return null;

    if (this.isExpired(tokens.expires_at)) {
      this.clearTokens();
      return null;
    }

    return tokens.access_token;
  }

  /**
   * Get all stored tokens
   */
  static getTokens(): TokenData | null {
    const stored = sessionStorage.getItem(this.STORAGE_KEY);
    if (!stored) return null;

    try {
      return JSON.parse(stored) as TokenData;
    } catch {
      this.clearTokens();
      return null;
    }
  }

  /**
   * Clear all tokens (logout)
   */
  static clearTokens(): void {
    sessionStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    return this.getAccessToken() !== null;
  }

  /**
   * Check if token is expired (with buffer)
   */
  private static isExpired(expiresAt: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now >= (expiresAt - this.EXPIRY_BUFFER_SECONDS);
  }

  /**
   * Decode access token to get user info
   */
  static getUserInfo(): DecodedToken | null {
    const token = this.getAccessToken();
    if (!token) return null;

    try {
      return jwtDecode<DecodedToken>(token);
    } catch {
      return null;
    }
  }

  /**
   * Get time until token expires (in seconds)
   */
  static getTimeUntilExpiry(): number {
    const tokens = this.getTokens();
    if (!tokens) return 0;

    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, tokens.expires_at - now);
  }

  /**
   * Extract tokens from OAuth callback URL
   */
  static extractTokensFromCallback(url: string): {
    code?: string;
    error?: string;
    state?: string;
  } {
    const params = new URLSearchParams(url.split('?')[1]);
    return {
      code: params.get('code') || undefined,
      error: params.get('error') || undefined,
      state: params.get('state') || undefined,
    };
  }

  /**
   * Build Keycloak login URL
   */
  static buildLoginUrl(config: {
    keycloakUrl: string;
    realm: string;
    clientId: string;
    redirectUri: string;
    state?: string;
  }): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
    });

    if (config.state) {
      params.set('state', config.state);
    }

    return `${config.keycloakUrl}/realms/${config.realm}/protocol/openid-connect/auth?${params}`;
  }

  /**
   * Build Keycloak logout URL
   */
  static buildLogoutUrl(config: {
    keycloakUrl: string;
    realm: string;
    redirectUri: string;
  }): string {
    const params = new URLSearchParams({
      post_logout_redirect_uri: config.redirectUri,
    });

    return `${config.keycloakUrl}/realms/${config.realm}/protocol/openid-connect/logout?${params}`;
  }

  /**
   * Exchange authorization code for tokens
   * This should be called by your backend to keep client_secret secure
   */
  static async exchangeCodeForTokens(
    code: string,
    backendUrl: string
  ): Promise<TokenData> {
    const response = await fetch(`${backendUrl}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange code for tokens');
    }

    const data = await response.json();

    // Calculate expiry timestamp
    const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      id_token: data.id_token,
      expires_at: expiresAt,
    };
  }
}
