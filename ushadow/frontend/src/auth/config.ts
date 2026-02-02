/**
 * Keycloak and Backend Configuration
 *
 * Loaded from environment variables (.env file)
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

export const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8081',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'ushadow',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'ushadow-frontend',
}

export const backendConfig = {
  url: getBackendUrl(),
}
