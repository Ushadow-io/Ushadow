/**
 * Keycloak OIDC Configuration
 */

export const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8081',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'ushadow',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'ushadow-frontend',
};

export const backendConfig = {
  url: import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000',
};
