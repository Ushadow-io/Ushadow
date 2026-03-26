/**
 * Auth and Backend Configuration
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

// Casdoor config — overwritten by updateAuthConfig() once backend settings load.
// Pre-settings fallback uses VITE_CASDOOR_URL env var, defaulting to localhost:8082.
const _defaultBase = import.meta.env.VITE_CASDOOR_URL || 'http://localhost:8082'
export let casdoorConfig = {
  url: _defaultBase,
  clientId: import.meta.env.VITE_CASDOOR_CLIENT_ID || 'ushadow',
  organization: import.meta.env.VITE_CASDOOR_ORG || 'ushadow',
  authEndpoint: `${_defaultBase}/login/oauth/authorize`,
  signupEndpoint: `${_defaultBase}/signup/oauth/authorize`,
  logoutEndpoint: `${_defaultBase}/api/logout`,
}

export function updateAuthConfig(settings: {
  casdoor?: { public_url?: string; client_id?: string; organization?: string; port?: number }
}) {
  if (settings.casdoor?.public_url) {
    const base = settings.casdoor.public_url
    casdoorConfig = {
      url: base,
      clientId: settings.casdoor.client_id || casdoorConfig.clientId,
      organization: settings.casdoor.organization || casdoorConfig.organization,
      authEndpoint: `${base}/login/oauth/authorize`,
      signupEndpoint: `${base}/signup/oauth/authorize`,
      logoutEndpoint: `${base}/api/logout`,
    }
    console.log('[Config] Updated Casdoor config from backend:', casdoorConfig)
  }
}

/**
 * Register this environment's OAuth redirect URI with Casdoor.
 * Called on app initialization to enable dynamic redirect URI registration.
 *
 * This allows multiple environments running on different ports to register
 * their callback URLs without pre-configuring them in Casdoor.
 */
export async function registerRedirectUri(): Promise<void> {
  // Build redirect URI for this environment
  const redirectUri = `${window.location.origin}/oauth/callback`
  const postLogoutRedirectUri = `${window.location.origin}/`

  try {
    console.log('[Auth] Registering redirect URI with Casdoor:', redirectUri)

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
