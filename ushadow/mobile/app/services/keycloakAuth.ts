/**
 * Keycloak OAuth2 Authentication Service
 *
 * Implements Authorization Code + PKCE flow for React Native mobile apps.
 * Uses expo-auth-session for secure OAuth2 authentication.
 *
 * Flow:
 * 1. Fetch Keycloak config from backend API
 * 2. Generate PKCE challenge
 * 3. Open browser to Keycloak login page
 * 4. User authenticates with Keycloak
 * 5. Keycloak redirects back with authorization code
 * 6. Exchange code for access token using PKCE verifier
 * 7. Store token and use for API requests
 */

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

// Complete auth session for both platforms
// This is required to properly dismiss the browser after OAuth redirect
WebBrowser.maybeCompleteAuthSession();

export interface KeycloakConfig {
  enabled: boolean;
  public_url: string;  // HTTPS URL for web browsers (e.g., "https://orange.spangled-kettle.ts.net/keycloak")
  mobile_url?: string; // Optional direct IP for mobile (e.g., "http://100.105.225.45:8081")
  realm: string;       // e.g., "ushadow"
  frontend_client_id: string;  // Web client (e.g., "ushadow-frontend")
  mobile_client_id: string;     // Mobile client (e.g., "ushadow-mobile")
  backend_client_id: string;
}

export interface KeycloakTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * Fetch Keycloak configuration from a unode.
 *
 * For environments with multiple unodes, this fetches the Keycloak
 * configuration from the specific unode that the mobile app is connecting to.
 *
 * @param backendUrl - The unode's backend URL (e.g., "http://100.64.1.5:8360")
 * @param hostname - The unode's hostname (e.g., "orange", "public-unode-1")
 */
export async function getKeycloakConfigFromUnode(
  backendUrl: string,
  hostname?: string
): Promise<KeycloakConfig | null> {
  try {
    let configUrl: string;

    if (hostname) {
      // Fetch from unode-specific endpoint (preferred for multi-unode environments)
      configUrl = `${backendUrl}/api/unodes/${hostname}/info`;
      console.log('[Keycloak] Fetching config from unode:', hostname);
    } else {
      // Fallback to general config endpoint (single unode environments)
      configUrl = `${backendUrl}/api/keycloak/config`;
      console.log('[Keycloak] Fetching config from general endpoint');
    }

    console.log('[Keycloak] Requesting config from:', configUrl);

    const response = await Promise.race([
      fetch(configUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout after 10s')), 10000)
      )
    ]);

    console.log('[Keycloak] Response status:', response.status);

    if (!response.ok) {
      console.warn('[Keycloak] Config endpoint failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[Keycloak] Response data:', JSON.stringify(data).substring(0, 200));

    // Extract Keycloak config from unode info response
    let config: KeycloakConfig;
    if (hostname && data.keycloak_config) {
      // UNode info endpoint response
      config = {
        enabled: data.keycloak_config.enabled ?? false,
        public_url: data.keycloak_config.public_url,
        realm: data.keycloak_config.realm,
        frontend_client_id: data.keycloak_config.frontend_client_id,
        mobile_client_id: data.keycloak_config.mobile_client_id || 'ushadow-mobile',
        backend_client_id: data.keycloak_config.backend_client_id || '',
      };
    } else {
      // General config endpoint response
      config = data;
    }

    // Mobile apps should prefer mobile_url (direct IP) over public_url (HTTPS)
    // This avoids iOS cookie/redirect issues with ASWebAuthenticationSession
    const keycloakUrl = config.mobile_url || config.public_url;

    console.log('[Keycloak] Config received:', {
      enabled: config.enabled,
      public_url: config.public_url,
      mobile_url: config.mobile_url,
      using: keycloakUrl,
      realm: config.realm,
      source: hostname ? `unode:${hostname}` : 'general',
    });

    return config;
  } catch (error) {
    console.error('[Keycloak] Failed to fetch config:', error);
    return null;
  }
}

/**
 * Legacy method - fetches from general endpoint.
 * Use getKeycloakConfigFromUnode() for multi-unode environments.
 *
 * @deprecated Use getKeycloakConfigFromUnode() instead
 */
export async function getKeycloakConfig(backendUrl: string): Promise<KeycloakConfig | null> {
  return getKeycloakConfigFromUnode(backendUrl);
}

/**
 * Generate PKCE code verifier and challenge.
 *
 * PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks.
 * This is required for public clients like mobile apps.
 */
async function generatePKCE() {
  // Generate random code verifier (43-128 characters, base64url encoded)
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const codeVerifier = base64UrlEncode(randomBytes);

  // Generate code challenge using S256 (SHA-256)
  const challengeBytes = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );

  // Convert to base64url encoding
  const codeChallenge = challengeBytes
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return {
    codeVerifier,
    codeChallenge,
  };
}

/**
 * Convert bytes to base64url encoding
 */
function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(bytes)));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Authenticate with Keycloak using OAuth2 Authorization Code + PKCE flow.
 *
 * This opens a browser window for the user to log in with Keycloak,
 * then exchanges the authorization code for an access token.
 *
 * @param backendUrl - The ushadow backend URL (e.g., "https://blue.spangled-kettle.ts.net")
 * @param hostname - Optional unode hostname for multi-unode environments
 * @returns Access token and related OAuth2 tokens
 */
export async function authenticateWithKeycloak(
  backendUrl: string,
  hostname?: string
): Promise<KeycloakTokens | null> {
  try {
    // 1. Get Keycloak configuration from unode (or fallback to general endpoint)
    const config = await getKeycloakConfigFromUnode(backendUrl, hostname);

    if (!config || !config.enabled) {
      console.log('[Keycloak] Keycloak not enabled on this backend');
      return null;
    }

    const { realm, mobile_client_id } = config;
    // Prefer mobile_url (direct IP) for mobile apps to avoid cookie issues
    const keycloak_url = config.mobile_url || config.public_url;

    // 2. Generate PKCE challenge
    const { codeVerifier, codeChallenge } = await generatePKCE();
    console.log('[Keycloak] Generated PKCE challenge');

    // 3. Set up OAuth2 endpoints
    const discovery = {
      authorizationEndpoint: `${keycloak_url}/realms/${realm}/protocol/openid-connect/auth`,
      tokenEndpoint: `${keycloak_url}/realms/${realm}/protocol/openid-connect/token`,
    };

    // 4. Create redirect URI (expo AuthSession handles this)
    // Use native deep linking (not proxy) for better redirect handling
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'ushadow',  // Must match app.json scheme
      path: 'oauth/callback',
      useProxy: false,  // Use native deep link, not Expo proxy
    });

    console.log('[Keycloak] ========== OAuth Flow Debug ==========');
    console.log('[Keycloak] Platform:', Platform.OS);
    console.log('[Keycloak] Redirect URI:', redirectUri);
    console.log('[Keycloak] Using DEDICATED MOBILE CLIENT:', mobile_client_id);
    console.log('[Keycloak] ⚠️  NOT using web client (frontend_client_id)');

    // 5. Build authorization request
    const authRequestParams: AuthSession.AuthRequestConfig = {
      clientId: mobile_client_id,  // Use dedicated mobile client (NOT frontend_client_id)
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      redirectUri,
      usePKCE: false,  // We'll handle PKCE manually for more control
      extraParams: {
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      },
    };

    const authRequest = new AuthSession.AuthRequest(authRequestParams);

    // 6. Open browser for user authentication
    console.log('[Keycloak] Opening browser for authentication...');
    console.log('[Keycloak] Discovery endpoints:', discovery);
    console.log('[Keycloak] Auth request config:', {
      clientId: mobile_client_id,
      redirectUri,
      scopes: authRequestParams.scopes,
      extraParams: authRequestParams.extraParams,
    });

    // Build the authorization URL explicitly to debug
    try {
      const authUrl = await authRequest.makeAuthUrlAsync(discovery);
      console.log('[Keycloak] Built authorization URL:', authUrl);

      // Parse URL to check redirect_uri parameter
      if (authUrl) {
        const url = new URL(authUrl);
        console.log('[Keycloak] Authorization endpoint:', url.origin + url.pathname);
        console.log('[Keycloak] Query parameters:');
        url.searchParams.forEach((value, key) => {
          if (key === 'redirect_uri') {
            console.log(`  🎯 ${key}: ${value}`);
          } else if (key === 'code_challenge') {
            console.log(`  🔒 ${key}: ${value.substring(0, 20)}...`);
          } else {
            console.log(`  • ${key}: ${value}`);
          }
        });
      }
    } catch (error) {
      console.error('[Keycloak] Failed to build auth URL:', error);
    }

    // Configure browser options for better redirect handling
    const browserOptions: AuthSession.AuthSessionOptions = {
      preferEphemeralSession: false, // MUST be false for Keycloak cookies to persist
      showInRecents: false, // Don't show in recent apps
    };

    const authResult = await authRequest.promptAsync(discovery, browserOptions);

    console.log('[Keycloak] Actual auth URL used:', authRequest.url);

    console.log('[Keycloak] Auth result type:', authResult.type);

    if (authResult.type !== 'success') {
      console.log('[Keycloak] Auth cancelled or failed:', authResult.type);
      // Ensure browser is dismissed even on failure
      try {
        await WebBrowser.dismissBrowser();
      } catch (e) {
        // Ignore dismissal errors
      }
      return null;
    }

    console.log('[Keycloak] Redirect received successfully');

    const { code } = authResult.params;

    if (!code) {
      console.error('[Keycloak] No authorization code received');
      return null;
    }

    console.log('[Keycloak] Authorization code received, exchanging for tokens...');

    // 7. Exchange authorization code for tokens via backend
    // The backend handles the token exchange to keep client_secret secure
    const tokenResponse = await fetch(`${backendUrl}/api/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: mobile_client_id,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Keycloak] Token exchange failed:', tokenResponse.status, errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokens: KeycloakTokens = await tokenResponse.json();
    console.log('[Keycloak] ✅ Authentication successful, tokens received');

    return tokens;
  } catch (error) {
    console.error('[Keycloak] Authentication error:', error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token.
 *
 * When the access token expires, use the refresh token to get a new one
 * without requiring the user to log in again.
 */
export async function refreshKeycloakToken(
  backendUrl: string,
  refreshToken: string
): Promise<KeycloakTokens | null> {
  try {
    console.log('[Keycloak] Refreshing access token...');

    const response = await fetch(`${backendUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.error('[Keycloak] Token refresh failed:', response.status);
      return null;
    }

    const tokens: KeycloakTokens = await response.json();
    console.log('[Keycloak] ✅ Token refreshed successfully');

    return tokens;
  } catch (error) {
    console.error('[Keycloak] Token refresh error:', error);
    return null;
  }
}

/**
 * Logout from Keycloak session.
 *
 * Opens browser to Keycloak logout endpoint to clear the session,
 * then redirects back to the app.
 *
 * @param backendUrl - The ushadow backend URL
 * @param idToken - The ID token from login (required for proper logout)
 * @param hostname - Optional unode hostname
 */
export async function logoutFromKeycloak(
  backendUrl: string,
  idToken?: string,
  hostname?: string
): Promise<void> {
  try {
    const config = await getKeycloakConfigFromUnode(backendUrl, hostname);

    if (!config || !config.enabled) {
      console.log('[Keycloak] No active Keycloak config, skipping logout');
      return;
    }

    const { realm, mobile_client_id } = config;
    // Prefer mobile_url (direct IP) for mobile apps
    const keycloak_url = config.mobile_url || config.public_url;

    // Create redirect URI for post-logout
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'ushadow',
      path: 'logout/callback',
      useProxy: false,
    });

    // Build Keycloak logout URL with required parameters
    // Note: client_id is required when using post_logout_redirect_uri
    const params = new URLSearchParams({
      client_id: mobile_client_id,  // Use dedicated mobile client
      post_logout_redirect_uri: redirectUri,
    });

    if (idToken) {
      params.append('id_token_hint', idToken);
      console.log('[Keycloak] Using id_token_hint for logout');
    } else {
      console.warn('[Keycloak] No id_token provided - logout may fail with parameter error');
    }

    const logoutUrl = `${keycloak_url}/realms/${realm}/protocol/openid-connect/logout?${params.toString()}`;

    console.log('[Keycloak] Logging out from Keycloak session...');
    console.log('[Keycloak] Logout URL params:', { hasIdTokenHint: !!idToken });

    // Open browser to logout endpoint
    await WebBrowser.openAuthSessionAsync(logoutUrl, redirectUri, {
      preferEphemeralSession: true,
      showInRecents: false,
    });

    console.log('[Keycloak] ✅ Logged out from Keycloak');
  } catch (error) {
    console.error('[Keycloak] Logout error:', error);
    // Don't throw - local logout still happened
  }
}

/**
 * Check if Keycloak is available and enabled for a backend/unode.
 *
 * @param backendUrl - The backend URL
 * @param hostname - Optional unode hostname
 */
export async function isKeycloakAvailable(
  backendUrl: string,
  hostname?: string
): Promise<boolean> {
  const config = await getKeycloakConfigFromUnode(backendUrl, hostname);
  return config?.enabled ?? false;
}
