/**
 * Leader Discovery Component
 *
 * UI for connecting to the Ushadow leader node.
 * Primary method: QR code scanning from the web dashboard
 * Fallback: Manual IP entry or reconnect to saved leader
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTailscaleDiscovery, SavedServerConfig } from '../hooks/useTailscaleDiscovery';
import QRScanner, { UshadowConnectionData } from './QRScanner';
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';
import { isDemoMode } from '../utils/demoModeStorage';
import { DEMO_UNODE } from '../utils/mockData';

interface LeaderDiscoveryProps {
  onLeaderFound?: (apiUrl: string, streamUrl: string, authToken?: string, chronicleApiUrl?: string) => void;
}

export const LeaderDiscovery: React.FC<LeaderDiscoveryProps> = ({
  onLeaderFound,
}) => {
  const {
    isOnTailscale,
    leader,
    leaderInfo,
    error,
    savedLeader,
    scannedServer,
    connectionStatus,
    connectToLeader,
    connectToEndpoint,
    connectFromQR,
    connectToScanned,
    fetchLeaderInfo,
    clearSaved,
    setError,
  } = useTailscaleDiscovery();

  const [showScanner, setShowScanner] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [justScanned, setJustScanned] = useState(false);  // Track if user just scanned in this session
  const [demoMode, setDemoMode] = useState(false);

  // Check demo mode on mount
  useEffect(() => {
    const checkDemoMode = async () => {
      const isDemo = await isDemoMode();
      setDemoMode(isDemo);
    };
    checkDemoMode();
  }, []);

  const handleQRScan = async (data: UshadowConnectionData) => {
    setShowScanner(false);
    setJustScanned(true);  // Mark that we just scanned
    // This now saves the server AND attempts to connect
    const result = await connectFromQR(data);
    if (result.success && result.leader && onLeaderFound) {
      // Pass auth token from QR code if available (v3+)
      onLeaderFound(result.leader.apiUrl, result.leader.streamUrl, data.auth_token, result.leader.chronicleApiUrl);
    }
  };

  const handleConnectToScanned = async () => {
    const result = await connectToScanned();
    if (result.success && result.leader && onLeaderFound) {
      onLeaderFound(result.leader.apiUrl, result.leader.streamUrl, undefined, result.leader.chronicleApiUrl);
    }
  };

  const handleReconnect = async () => {
    if (!savedLeader) return;

    const result = await connectToLeader(savedLeader.tailscaleIp, savedLeader.port);
    if (result.success && result.leader && onLeaderFound) {
      onLeaderFound(result.leader.apiUrl, result.leader.streamUrl, undefined, result.leader.chronicleApiUrl);
    }
  };

  const handleManualConnect = async () => {
    const trimmed = endpoint.trim();

    if (!trimmed) {
      setError('Please enter a hostname or IP address');
      return;
    }

    const result = await connectToEndpoint(trimmed);
    if (result.success && result.leader && onLeaderFound) {
      onLeaderFound(result.leader.apiUrl, result.leader.streamUrl, undefined, result.leader.chronicleApiUrl);
    }
  };

  const handleConnectToLeader = () => {
    if (leader && onLeaderFound) {
      onLeaderFound(leader.apiUrl, leader.streamUrl, undefined, leader.chronicleApiUrl);
    }
  };

  const handleUseDemoNode = () => {
    if (onLeaderFound) {
      console.log('[LeaderDiscovery] Using demo UNode');
      onLeaderFound(
        DEMO_UNODE.apiUrl,
        DEMO_UNODE.streamUrl,
        DEMO_UNODE.authToken,
        DEMO_UNODE.chronicleApiUrl
      );
    }
  };

  const isConnecting = connectionStatus === 'connecting';

  // Get capabilities from leaderInfo (fetched after connection)
  const capabilities = leaderInfo?.capabilities;
  const services = leaderInfo?.services || [];
  const unodes = leaderInfo?.unodes || [];

  // Render scanned server details card - compact version
  const renderScannedServer = (server: SavedServerConfig) => (
    <View style={styles.serverCard} testID="scanned-server-card">
      <View style={styles.compactServerInfo}>
        <View style={styles.serverTextContainer}>
          <Text style={styles.serverHostname}>{leaderInfo?.hostname || server.hostname}</Text>
          <Text style={styles.serverIp}>{server.tailscaleIp}:{server.port}</Text>
          {connectionStatus === 'connected' && capabilities && (
            <View style={styles.compactCapabilities}>
              {capabilities.can_run_docker && <Text style={styles.capDot}>🐳</Text>}
              {capabilities.can_run_gpu && <Text style={styles.capDot}>⚡</Text>}
              {services.length > 0 && <Text style={styles.capCount}>{services.length} svc</Text>}
            </View>
          )}
        </View>
        <View style={[
          styles.statusIndicator,
          connectionStatus === 'connected' ? styles.statusConnected :
          connectionStatus === 'connecting' ? styles.statusConnecting :
          connectionStatus === 'failed' ? styles.statusFailed :
          styles.statusIdle
        ]}>
          <Text style={styles.statusDot}>
            {connectionStatus === 'connected' ? '●' :
             connectionStatus === 'connecting' ? '◐' :
             connectionStatus === 'failed' ? '●' :
             '○'}
          </Text>
        </View>
      </View>

      {/* Action button */}
      {connectionStatus !== 'connected' && (
        <TouchableOpacity
          style={[styles.connectButton, isConnecting && styles.buttonDisabled]}
          onPress={handleConnectToScanned}
          disabled={isConnecting}
          testID="connect-scanned-button"
        >
          {isConnecting ? (
            <ActivityIndicator color={theme.primaryButtonText} size="small" />
          ) : (
            <Text style={styles.connectButtonText}>Connect</Text>
          )}
        </TouchableOpacity>
      )}
      {connectionStatus === 'connected' && (
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleConnectToLeader}
          testID="continue-button"
        >
          <Text style={styles.connectButtonText}>Use This Server</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} testID="leader-discovery">
      {/* QR Scanner Modal */}
      <QRScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleQRScan}
      />

      {/* Header Text */}
      <Text style={styles.headerText}>Choose how to connect to your UNode:</Text>

      {/* Primary Action: Scan QR Code */}
      <TouchableOpacity
        style={[styles.primaryButton, isConnecting && styles.buttonDisabled]}
        onPress={() => setShowScanner(true)}
        disabled={isConnecting}
        testID="scan-qr-button"
      >
        <Text style={styles.primaryButtonText}>Scan QR Code</Text>
      </TouchableOpacity>

      <Text style={styles.helperText}>
        Scan the QR code from your Ushadow dashboard
      </Text>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Secondary Action: Manual Entry */}
      <TouchableOpacity
        style={[styles.secondaryButton, (isConnecting || showManual) && styles.buttonDisabled]}
        onPress={() => setShowManual(true)}
        disabled={isConnecting || showManual}
        testID="manual-entry-button"
      >
        <Text style={styles.secondaryButtonText}>Enter Address Manually</Text>
      </TouchableOpacity>

      {/* Manual Endpoint Entry */}
      {showManual && (
        <View style={styles.manualSection}>
          <Text style={styles.inputLabel}>Server Address</Text>
          <TextInput
            style={styles.input}
            value={endpoint}
            onChangeText={setEndpoint}
            placeholder="my-leader.tailnet.ts.net or 100.64.1.5:8000"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            testID="manual-endpoint-input"
          />
          <Text style={styles.endpointHint}>
            Enter hostname or IP address. Port defaults to 8000 if not specified.
          </Text>
          <View style={styles.manualActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowManual(false);
                setEndpoint('');
              }}
              testID="cancel-manual-button"
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.manualConnectButton, isConnecting && styles.buttonDisabled]}
              onPress={handleManualConnect}
              disabled={isConnecting}
              testID="manual-connect-button"
            >
              {isConnecting ? (
                <ActivityIndicator color={theme.primaryButtonText} size="small" />
              ) : (
                <Text style={styles.buttonText}>Connect</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Demo Mode Option - Only show in demo mode */}
      {demoMode && (
        <>
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>DEMO MODE</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.demoSection}>
            <View style={styles.demoHeader}>
              <Ionicons name="information-circle" size={20} color={colors.primary[400]} />
              <Text style={styles.demoTitle}>Demo UNode Available</Text>
            </View>
            <Text style={styles.demoDescription}>
              Test streaming features without a real server connection.
            </Text>
            <TouchableOpacity
              style={styles.demoButton}
              onPress={handleUseDemoNode}
              testID="use-demo-node-button"
            >
              <Text style={styles.demoButtonText}>Use Demo Node</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Scanned Server Card - Only show if user just scanned */}
      {justScanned && scannedServer && renderScannedServer(scannedServer)}

      {/* Error Display */}
      {error && (
        <View style={styles.errorSection}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
  },
  headerText: {
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: theme.primaryButton,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  primaryButtonText: {
    color: theme.primaryButtonText,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: theme.backgroundHover,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryButtonText: {
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  helperText: {
    color: theme.textSecondary,
    fontSize: fontSize.sm - 1,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.border,
  },
  dividerText: {
    color: theme.textMuted,
    fontSize: fontSize.sm,
    marginHorizontal: spacing.md,
    fontWeight: '500',
  },
  savedSection: {
    backgroundColor: theme.backgroundHover,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  savedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  savedLabel: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
  },
  savedValue: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  clearButton: {
    padding: spacing.xs,
  },
  clearButtonText: {
    color: colors.error.default,
    fontSize: fontSize.xs,
  },
  reconnectButton: {
    backgroundColor: colors.info.dark,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  toggleManual: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  toggleManualText: {
    color: theme.link,
    fontSize: fontSize.sm,
  },
  manualSection: {
    backgroundColor: theme.backgroundHover,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  inputLabel: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm - 2,
  },
  input: {
    backgroundColor: theme.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: theme.textPrimary,
    fontSize: fontSize.base,
  },
  endpointHint: {
    color: theme.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  manualActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: theme.backgroundInput,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  cancelButtonText: {
    color: theme.textSecondary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  manualConnectButton: {
    flex: 1,
    backgroundColor: theme.primaryButton,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  errorSection: {
    backgroundColor: colors.error.bgSolid,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  errorText: {
    color: colors.error.light,
    fontSize: fontSize.sm,
  },
  leaderSection: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  leaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success.bgSolid,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  leaderIconText: {
    fontSize: fontSize['3xl'],
    color: colors.white,
  },
  leaderTitle: {
    color: theme.statusOnline,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  leaderHostname: {
    color: theme.textPrimary,
    fontSize: fontSize.base,
    marginBottom: spacing.xs,
  },
  leaderUrl: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    marginBottom: spacing.lg,
  },
  connectButton: {
    flex: 1,
    backgroundColor: theme.primaryButton,
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  connectButtonText: {
    color: theme.primaryButtonText,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  // Scanned Server Card Styles - Compact
  serverCard: {
    backgroundColor: theme.backgroundHover,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  compactServerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  serverTextContainer: {
    flex: 1,
  },
  serverHostname: {
    color: theme.textPrimary,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginBottom: spacing.xs - 2,
  },
  serverIp: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    marginBottom: spacing.xs,
  },
  compactCapabilities: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs - 2,
  },
  capDot: {
    fontSize: 14,
  },
  capCount: {
    color: theme.textMuted,
    fontSize: fontSize.xs,
  },
  statusIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  statusConnected: {
    backgroundColor: colors.success.bgSolid,
  },
  statusConnecting: {
    backgroundColor: colors.warning.bgSolid,
  },
  statusFailed: {
    backgroundColor: colors.error.bgSolid,
  },
  statusIdle: {
    backgroundColor: theme.backgroundInput,
  },
  statusDot: {
    color: colors.white,
    fontSize: fontSize.sm,
  },
  continueButton: {
    backgroundColor: theme.primaryButton,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  demoSection: {
    backgroundColor: `${colors.primary[400]}10`,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary[400],
  },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  demoTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  demoDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
    lineHeight: fontSize.sm * 1.5,
  },
  demoButton: {
    backgroundColor: colors.primary[400],
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  demoButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});

export default LeaderDiscovery;
