/**
 * Protected Route Component with Token Expiry Handling
 *
 * Implements simple re-login strategy:
 * 1. Check if user has valid token
 * 2. If no token or expired, redirect to Keycloak login
 * 3. After login, redirect back to original URL
 */

import { useEffect, useState } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { TokenManager } from './TokenManager';
import { keycloakConfig } from './config';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  function checkAuth() {
    const authenticated = TokenManager.isAuthenticated();
    setIsAuthenticated(authenticated);

    if (!authenticated) {
      redirectToLogin();
    }
  }

  function redirectToLogin() {
    // Save the current location so we can redirect back after login
    const returnUrl = `${window.location.pathname}${window.location.search}`;
    sessionStorage.setItem('login_return_url', returnUrl);

    // Generate state for CSRF protection
    const state = generateState();
    sessionStorage.setItem('oauth_state', state);

    // Build login URL
    const loginUrl = TokenManager.buildLoginUrl({
      keycloakUrl: keycloakConfig.url,
      realm: keycloakConfig.realm,
      clientId: keycloakConfig.clientId,
      redirectUri: `${window.location.origin}/auth/callback`,
      state,
    });

    // Redirect to Keycloak
    window.location.href = loginUrl;
  }

  function generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  // Loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Not authenticated (shouldn't reach here as we redirect above)
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated - render children
  return <>{children}</>;
}
