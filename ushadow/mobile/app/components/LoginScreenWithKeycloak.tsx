/**
 * Login Screen Component with OIDC Support
 *
 * Uses provider-agnostic OIDC (Authorization Code + PKCE) for authentication.
 * Works with Keycloak, Authentik, Auth0, or any OIDC provider.
 * The component auto-detects if an OIDC provider is available on the backend.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';
import { saveAuthToken, saveRefreshToken, saveIdToken, saveApiUrl, getDefaultServerUrl, setDefaultServerUrl } from '../_utils/authStorage';
import {
  isOidcAvailable,
  authenticate,
} from '../../../../packages/mobile-core/auth/oidcAuth';

interface LoginScreenProps {
  visible: boolean;
  onClose: () => void;
  onLoginSuccess: (token: string, apiUrl: string) => void;
  initialApiUrl?: string;
  hostname?: string;  // UNode hostname for fetching OIDC config
  autoStartKeycloak?: boolean;  // Auto-trigger OAuth when provider is detected (e.g. QR scan)
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  visible,
  onClose,
  onLoginSuccess,
  initialApiUrl = '',
  hostname,
  autoStartKeycloak = false,
}) => {
  const [apiUrl, setApiUrl] = useState(initialApiUrl || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  // OIDC availability detection
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [authAvailable, setAuthAvailable] = useState<boolean | null>(null);

  // Guard: only auto-start once per modal open
  const autoStartedRef = useRef(false);

  // Load the default server URL when modal opens
  useEffect(() => {
    if (visible) {
      if (initialApiUrl) {
        setApiUrl(initialApiUrl);
      } else {
        getDefaultServerUrl().then((defaultUrl) => {
          setApiUrl(defaultUrl);
        });
      }
    }
  }, [visible, initialApiUrl, hostname]);

  // Check if OIDC is available when API URL changes
  useEffect(() => {
    if (apiUrl.trim()) {
      checkAuthAvailability();
    }
  }, [apiUrl, hostname]);

  // Reset auto-start guard when modal closes
  useEffect(() => {
    if (!visible) {
      autoStartedRef.current = false;
    }
  }, [visible]);

  // Auto-start OAuth when triggered by QR scan
  useEffect(() => {
    if (
      autoStartKeycloak &&
      authAvailable === true &&
      !checkingAuth &&
      !loading &&
      !autoStartedRef.current
    ) {
      autoStartedRef.current = true;
      handleOidcLogin();
    }
  }, [autoStartKeycloak, authAvailable, checkingAuth, loading]);

  const checkAuthAvailability = async () => {
    const url = extractBaseUrl(apiUrl);
    if (!url) return;

    setCheckingAuth(true);
    try {
      const available = await isOidcAvailable(url, hostname);
      setAuthAvailable(available);
      console.log('[Login] OIDC available:', available, hostname ? `(unode: ${hostname})` : '');
    } catch (err) {
      console.error('[Login] Failed to check OIDC:', err);
      setAuthAvailable(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  const extractBaseUrl = (url: string): string => {
    const trimmed = url.trim().replace(/\/$/, '');
    return trimmed.replace(/\/api\/.*$/, '');
  };

  const handleOidcLogin = async () => {
    const baseUrl = extractBaseUrl(apiUrl);
    if (!baseUrl) {
      setError('Please enter a server URL');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[Login] Starting OIDC authentication...', hostname ? `(unode: ${hostname})` : '');

      const tokens = await authenticate(baseUrl, hostname);

      if (!tokens || !tokens.access_token) {
        throw new Error('Authentication cancelled or failed');
      }

      console.log('[Login] Authentication successful');

      // Save tokens and API URL
      await saveAuthToken(tokens.access_token);
      if (tokens.refresh_token) {
        await saveRefreshToken(tokens.refresh_token);
      }
      if (tokens.id_token) {
        await saveIdToken(tokens.id_token);
      }
      await saveApiUrl(baseUrl);

      // Optionally save as default server URL
      if (saveAsDefault) {
        await setDefaultServerUrl(baseUrl);
      }

      // Clear form
      setSaveAsDefault(false);

      // Notify parent
      onLoginSuccess(tokens.access_token, baseUrl);
    } catch (err) {
      console.error('[Login] OIDC error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      testID="login-modal"
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              testID="close-login"
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Login</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>
              {hostname ? `Sign in to ${hostname}` : 'Sign in to Ushadow'}
            </Text>
            <Text style={styles.formSubtitle}>
              {hostname
                ? extractBaseUrl(initialApiUrl || apiUrl) || 'Checking server\u2026'
                : 'Enter your server URL to connect to your leader node'}
            </Text>

            {/* API URL — only show editable field when not QR-triggered */}
            {!hostname && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Server URL</Text>
                <TextInput
                  style={styles.input}
                  value={apiUrl}
                  onChangeText={setApiUrl}
                  placeholder="https://your-server.ts.net"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  testID="login-api-url"
                />
                {/* Save as default checkbox */}
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setSaveAsDefault(!saveAsDefault)}
                  testID="login-save-default"
                >
                  <View style={[styles.checkbox, saveAsDefault && styles.checkboxChecked]}>
                    {saveAsDefault && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Save as default server</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Loading indicator while checking auth */}
            {checkingAuth && (
              <View style={styles.checkingContainer}>
                <ActivityIndicator size="small" color={theme.primaryButton} />
                <Text style={styles.checkingText}>Checking authentication methods...</Text>
              </View>
            )}

            {/* Login Button */}
            {authAvailable && !checkingAuth && (
              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleOidcLogin}
                disabled={loading}
                testID="login-oidc"
              >
                {loading ? (
                  <ActivityIndicator color={theme.primaryButtonText} />
                ) : (
                  <Text style={styles.loginButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Show message if auth is not available */}
            {authAvailable === false && !checkingAuth && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  Authentication is not available on this server. Please check your server configuration.
                </Text>
              </View>
            )}

            {/* Error */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Help Text */}
            <Text style={styles.helpText}>
              Don't have an account? Scan the QR code from your Ushadow dashboard to connect automatically.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.lg,
    backgroundColor: theme.backgroundCard,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  closeButton: {
    padding: spacing.sm,
  },
  closeButtonText: {
    color: theme.link,
    fontSize: fontSize.base,
  },
  headerSpacer: {
    width: 60,
  },
  form: {
    padding: spacing.xl,
    flex: 1,
  },
  formTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  formSubtitle: {
    fontSize: fontSize.base,
    color: theme.textSecondary,
    marginBottom: spacing['2xl'],
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: theme.textPrimary,
    fontSize: fontSize.base,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkboxChecked: {
    backgroundColor: theme.primaryButton,
    borderColor: theme.primaryButton,
  },
  checkmark: {
    color: theme.primaryButtonText,
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  checkingText: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    marginLeft: spacing.sm,
  },
  errorContainer: {
    backgroundColor: colors.error.bgSolid,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.error.light,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: theme.primaryButton,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: theme.primaryButtonText,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  helpText: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default LoginScreen;
