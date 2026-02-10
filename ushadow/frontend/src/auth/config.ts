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

/**
 * Get Keycloak URL for frontend browser access.
 *
 * Frontend always uses localhost:8081 because:
 * - When accessing locally, Keycloak is on localhost:8081
 * - When accessing via Tailscale, Tailscale routes to the same machine where localhost:8081 works
 * - Backend uses a different URL (internal Docker network) for server-to-server communication
 */
function getKeycloakUrl(): string {
  return 'http://localhost:8081'
}

// Backend config is static (based on origin)
export const backendConfig = {
  url: getBackendUrl(),
}

// Internal state for Keycloak config (can be updated from backend settings)
let _keycloakRealm = 'ushadow'
let _keycloakClientId = 'ushadow-frontend'

// Keycloak config - URL is always dynamic based on current origin
// Use Object.defineProperty to create getters that recalculate on each access
export const keycloakConfig: {
  readonly url: string
  realm: string
  clientId: string
} = Object.defineProperties({}, {
  url: {
    get() {
      return getKeycloakUrl() // Recalculates every time it's accessed
    },
    enumerable: true
  },
  realm: {
    get() {
      return _keycloakRealm
    },
    set(value: string) {
      _keycloakRealm = value
    },
    enumerable: true
  },
  clientId: {
    get() {
      return _keycloakClientId
    },
    set(value: string) {
      _keycloakClientId = value
    },
    enumerable: true
  }
}) as any

/**
 * Update Keycloak config from backend settings.
 * Should be called on app initialization and after settings changes.
 *
 * Note: The URL is always determined dynamically based on the current origin,
 * not from settings. This allows seamless switching between localhost and Tailscale.
 * Settings are only used for realm and clientId configuration.
 */
export function updateKeycloakConfig(settings: {
  keycloak?: {
    public_url?: string
    realm?: string
    frontend_client_id?: string
  }
}) {
  if (settings.keycloak) {
    if (settings.keycloak.realm) {
      _keycloakRealm = settings.keycloak.realm
    }
    if (settings.keycloak.frontend_client_id) {
      _keycloakClientId = settings.keycloak.frontend_client_id
    }
    console.log('[Config] Updated Keycloak config:', {
      url: keycloakConfig.url,
      realm: keycloakConfig.realm,
      clientId: keycloakConfig.clientId
    })
  }
}
