/**
 * OAuth Callback Handler
 *
 * Handles the redirect back from Keycloak after login/registration.
 * Exchanges authorization code for tokens and redirects to original URL.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext';
import { TokenManager } from './TokenManager';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const { handleCallback } = useKeycloakAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    processCallback();
  }, []);

  async function processCallback() {
    try {
      // Extract code and state from URL
      const { code, error: oauthError, state } = TokenManager.extractTokensFromCallback(
        window.location.href
      );

      // Handle OAuth errors
      if (oauthError) {
        setError(`Authentication failed: ${oauthError}`);
        return;
      }

      // Validate inputs
      if (!code) {
        setError('No authorization code received');
        return;
      }

      if (!state) {
        setError('No state parameter received');
        return;
      }

      // Handle callback via context
      await handleCallback(code, state);

      // Redirect to original URL
      const returnUrl = sessionStorage.getItem('login_return_url') || '/';
      sessionStorage.removeItem('login_return_url');

      navigate(returnUrl, { replace: true });
    } catch (err) {
      console.error('OAuth callback error:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to complete authentication'
      );
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Authentication Error
            </h3>
            <p className="text-sm text-gray-500 mb-6">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              data-testid="auth-error-back-button"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
}
