/**
 * Keycloak and Backend Configuration
 *
 * Configuration is fetched from backend settings API at runtime.
 * Fallback to env vars only for initial load before settings are available.
 */

/**
 * Get backend URL based on current origin.
 *
 * When accessing via Tailscale (e.g., https://ushadow.spangled-kettle.ts.net),
 * the backend is accessible at the same origin through /api routes.
 * When accessing locally (localhost/127.0.0.1), use the configured backend port.
 */
function getBackendUrl(): string {
  const origin = window.location.origin

  // If accessing via Tailscale (*.ts.net), use the same origin
  // Tailscale serve routes /api to the backend
  if (origin.includes('.ts.net')) {
    return origin
  }

  // Otherwise use the configured backend URL (local development)
  return import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
}

// Backend config is static (based on origin)
export const backendConfig = {
  url: getBackendUrl(),
}

// Keycloak config will be populated from backend settings
// Default to localhost for initial load, then update from backend
export let keycloakConfig = {
  url: 'http://localhost:8081',
  realm: 'ushadow',
  clientId: 'ushadow-frontend',
}

/**
 * Update Keycloak config from backend settings.
 * Should be called on app initialization and after settings changes.
 */
export function updateKeycloakConfig(settings: {
  keycloak?: {
    public_url?: string
    realm?: string
    frontend_client_id?: string
  }
}) {
  if (settings.keycloak) {
    keycloakConfig = {
      url: settings.keycloak.public_url || keycloakConfig.url,
      realm: settings.keycloak.realm || keycloakConfig.realm,
      clientId: settings.keycloak.frontend_client_id || keycloakConfig.clientId,
    }
    console.log('[Config] Updated Keycloak config from backend:', keycloakConfig)
  }
}

/**
 * Register this environment's OAuth redirect URI with Keycloak.
 * Called on app initialization to enable dynamic redirect URI registration.
 *
 * This allows multiple environments running on different ports to register
 * their callback URLs without pre-configuring them in Keycloak.
 */
export async function registerRedirectUri(): Promise<void> {
  // Build redirect URI for this environment
  const redirectUri = `${window.location.origin}/oauth/callback`
  const postLogoutRedirectUri = `${window.location.origin}/`

  try {
    console.log('[Auth] Registering redirect URI with Keycloak:', redirectUri)

    const response = await fetch(`${backendConfig.url}/api/auth/register-redirect-uri`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        redirect_uri: redirectUri,
        post_logout_redirect_uri: postLogoutRedirectUri,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.warn('[Auth] Failed to register redirect URI:', error)
      return
    }

    const result = await response.json()
    console.log('[Auth] ✓ Redirect URI registered:', result.redirect_uri)
  } catch (error) {
    // Non-critical error - OAuth will fail if not registered, but app can still load
    console.warn('[Auth] Error registering redirect URI:', error)
  }
}
