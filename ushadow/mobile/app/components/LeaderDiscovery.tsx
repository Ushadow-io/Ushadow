/**
 * Leader Discovery Component
 *
 * UI for connecting to the Ushadow leader node.
 * Primary method: QR code scanning from the web dashboard
 * Fallback: Manual IP entry or reconnect to saved leader
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useTailscaleDiscovery, SavedServerConfig } from '../hooks/useTailscaleDiscovery';
import QRScanner, { UshadowConnectionData } from './QRScanner';
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';

interface LeaderDiscoveryProps {
  onLeaderFound?: (apiUrl: string, streamUrl: string, authToken?: string) => void;
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
  const [showDetails, setShowDetails] = useState(false);  // Collapsed by default

  const handleQRScan = async (data: UshadowConnectionData) => {
    setShowScanner(false);
    // This now saves the server AND attempts to connect
    const result = await connectFromQR(data);
    if (result.success && result.leader && onLeaderFound) {
      // Pass auth token from QR code if available (v3+)
      onLeaderFound(result.leader.apiUrl, result.leader.streamUrl, data.auth_token);
    }
  };

  const handleConnectToScanned = async () => {
    const result = await connectToScanned();
    if (result.success && result.leader && onLeaderFound) {
      onLeaderFound(result.leader.apiUrl, result.leader.streamUrl);
    }
  };

  const handleReconnect = async () => {
    if (!savedLeader) return;

    const result = await connectToLeader(savedLeader.tailscaleIp, savedLeader.port);
    if (result.success && result.leader && onLeaderFound) {
      onLeaderFound(result.leader.apiUrl, result.leader.streamUrl);
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
      onLeaderFound(result.leader.apiUrl, result.leader.streamUrl);
    }
  };

  const handleConnectToLeader = () => {
    if (leader && onLeaderFound) {
      onLeaderFound(leader.apiUrl, leader.streamUrl);
    }
  };

  const isConnecting = connectionStatus === 'connecting';

  // Get capabilities from leaderInfo (fetched after connection)
  const capabilities = leaderInfo?.capabilities;
  const services = leaderInfo?.services || [];
  const unodes = leaderInfo?.unodes || [];

  // Render scanned server details card
  const renderScannedServer = (server: SavedServerConfig) => (
    <View style={styles.serverCard} testID="scanned-server-card">
      <View style={styles.serverHeader}>
        <Text style={styles.serverTitle}>Scanned Server</Text>
        <View style={[
          styles.connectionBadge,
          connectionStatus === 'connected' ? styles.badgeConnected :
          connectionStatus === 'connecting' ? styles.badgeConnecting :
          connectionStatus === 'failed' ? styles.badgeFailed :
          styles.badgeIdle
        ]}>
          <Text style={styles.badgeText}>
            {connectionStatus === 'connected' ? 'Connected' :
             connectionStatus === 'connecting' ? 'Connecting...' :
             connectionStatus === 'failed' ? 'Failed' :
             'Ready'}
          </Text>
        </View>
      </View>

      <View style={styles.serverInfo}>
        <Text style={styles.serverHostname}>{leaderInfo?.hostname || server.hostname}</Text>
        <Text style={styles.serverIp}>{server.tailscaleIp}:{server.port}</Text>
      </View>

      {/* Collapsible Details Toggle - shown after connection */}
      {connectionStatus === 'connected' && leaderInfo && (
        <TouchableOpacity
          style={styles.detailsToggle}
          onPress={() => setShowDetails(!showDetails)}
          testID="toggle-details"
        >
          <Text style={styles.detailsToggleText}>
            {showDetails ? '▼ Hide Details' : '▶ Show Details'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Collapsible Details Section */}
      {showDetails && (
        <>
          {/* Capabilities */}
          {capabilities && (
            <View style={styles.capabilitiesSection}>
              <Text style={styles.capabilitiesTitle}>Capabilities</Text>
              <View style={styles.capabilitiesRow}>
                <View style={[styles.capBadge, capabilities.can_run_docker && styles.capEnabled]}>
                  <Text style={styles.capText}>Docker</Text>
                </View>
                <View style={[styles.capBadge, capabilities.can_run_gpu && styles.capEnabled]}>
                  <Text style={styles.capText}>GPU</Text>
                </View>
                <View style={[styles.capBadge, capabilities.can_become_leader && styles.capEnabled]}>
                  <Text style={styles.capText}>Leader</Text>
                </View>
              </View>
            </View>
          )}

          {/* Streaming URLs */}
          {leaderInfo && (
            <View style={styles.urlsSection}>
              <Text style={styles.urlsTitle}>Streaming Endpoints</Text>
              <Text style={styles.urlText}>PCM: {leaderInfo.ws_pcm_url}</Text>
              <Text style={styles.urlText}>OMI: {leaderInfo.ws_omi_url}</Text>
            </View>
          )}

          {/* Services */}
          {services.length > 0 && (
            <View style={styles.servicesSection}>
              <Text style={styles.servicesTitle}>Services ({services.length})</Text>
              {services.map((svc, idx) => (
                <View key={idx} style={styles.serviceRow}>
                  <Text style={styles.serviceName}>{svc.display_name}</Text>
                  <Text style={styles.serviceStatus}>{svc.status}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Unodes */}
          {unodes.length > 0 && (
            <View style={styles.unodesSection}>
              <Text style={styles.unodesTitle}>Cluster Nodes ({unodes.length})</Text>
              {unodes.map((node, idx) => (
                <View key={idx} style={styles.unodeRow}>
                  <Text style={styles.unodeHostname}>{node.hostname}</Text>
                  <View style={[styles.unodeStatusBadge,
                    node.status === 'online' ? styles.unodeOnline : styles.unodeOffline]}>
                    <Text style={styles.unodeStatusText}>{node.role}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* Hint to connect if not connected */}
      {connectionStatus !== 'connected' && (
        <Text style={styles.hintText}>
          Connect to see full server details
        </Text>
      )}

      {/* Action buttons */}
      <View style={styles.serverActions}>
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
            <Text style={styles.connectButtonText}>Continue</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.rescanButton}
          onPress={() => setShowScanner(true)}
          testID="rescan-button"
        >
          <Text style={styles.rescanText}>Scan New QR</Text>
        </TouchableOpacity>
      </View>
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

      {/* Scanned Server - Always show if available */}
      {scannedServer ? (
        <>
          {renderScannedServer(scannedServer)}

          {/* Error Display */}
          {error && (
            <View style={styles.errorSection}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Manual Connection Toggle */}
          <TouchableOpacity
            style={styles.toggleManual}
            onPress={() => setShowManual(!showManual)}
            testID="toggle-manual"
          >
            <Text style={styles.toggleManualText}>
              {showManual ? 'Hide manual entry' : 'Enter address manually'}
            </Text>
          </TouchableOpacity>

          {/* Manual Endpoint Entry */}
          {showManual && (
            <View style={styles.manualSection}>
              <Text style={styles.inputLabel}>Endpoint</Text>
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
                Tailscale hostname or IP address. Port defaults to 8000 if not specified.
              </Text>
              <TouchableOpacity
                style={[styles.manualConnectButton, isConnecting && styles.buttonDisabled]}
                onPress={handleManualConnect}
                disabled={isConnecting}
                testID="manual-connect-button"
              >
                <Text style={styles.buttonText}>Connect</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <>
          {/* No Scanned Server - Show initial setup UI */}
          {/* Connection Status */}
          <View style={styles.statusSection}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  isOnTailscale === true
                    ? styles.statusOnline
                    : isOnTailscale === false
                    ? styles.statusOffline
                    : styles.statusUnknown,
                ]}
              />
              <Text style={styles.statusText}>
                {isOnTailscale === true
                  ? 'Connected to Tailscale'
                  : isOnTailscale === false
                  ? 'Tailscale not detected'
                  : 'Checking Tailscale...'}
              </Text>
            </View>
          </View>

          {/* Primary Action: Scan QR Code */}
          <TouchableOpacity
            style={[styles.primaryButton, isConnecting && styles.buttonDisabled]}
            onPress={() => setShowScanner(true)}
            disabled={isConnecting}
            testID="scan-qr-button"
          >
            {isConnecting ? (
              <ActivityIndicator color={theme.primaryButtonText} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Scan QR Code</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helperText}>
            Open the Mobile App wizard on your Ushadow dashboard to get the QR code
          </Text>

          {/* Saved Leader Quick Reconnect */}
          {savedLeader && (
            <View style={styles.savedSection}>
              <View style={styles.savedHeader}>
                <Text style={styles.savedLabel}>Previous Connection</Text>
                <TouchableOpacity onPress={clearSaved} style={styles.clearButton}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.savedValue}>
                {savedLeader.hostname} ({savedLeader.tailscaleIp})
              </Text>
              <TouchableOpacity
                style={[styles.reconnectButton, isConnecting && styles.buttonDisabled]}
                onPress={handleReconnect}
                disabled={isConnecting}
                testID="reconnect-button"
              >
                <Text style={styles.buttonText}>Reconnect</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Manual Connection Toggle */}
          <TouchableOpacity
            style={styles.toggleManual}
            onPress={() => setShowManual(!showManual)}
            testID="toggle-manual"
          >
            <Text style={styles.toggleManualText}>
              {showManual ? 'Hide manual entry' : 'Enter address manually'}
            </Text>
          </TouchableOpacity>

          {/* Manual Endpoint Entry */}
          {showManual && (
            <View style={styles.manualSection}>
              <Text style={styles.inputLabel}>Endpoint</Text>
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
                Tailscale hostname or IP address. Port defaults to 8000 if not specified.
              </Text>
              <TouchableOpacity
                style={[styles.manualConnectButton, isConnecting && styles.buttonDisabled]}
                onPress={handleManualConnect}
                disabled={isConnecting}
                testID="manual-connect-button"
              >
                <Text style={styles.buttonText}>Connect</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Error Display */}
          {error && (
            <View style={styles.errorSection}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </>
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
  statusSection: {
    marginBottom: spacing.xl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  statusOnline: {
    backgroundColor: theme.statusOnline,
  },
  statusOffline: {
    backgroundColor: colors.error.default,
  },
  statusUnknown: {
    backgroundColor: theme.statusConnecting,
  },
  statusText: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
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
  helperText: {
    color: theme.textSecondary,
    fontSize: fontSize.sm - 1,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
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
    marginBottom: spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  ipInputContainer: {
    flex: 2,
  },
  portInputContainer: {
    flex: 1,
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
  manualConnectButton: {
    backgroundColor: theme.ghostButtonHover,
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
  // Scanned Server Card Styles
  serverCard: {
    backgroundColor: theme.backgroundHover,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  serverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  serverTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  connectionBadge: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
  },
  badgeConnected: {
    backgroundColor: colors.success.bgSolid,
  },
  badgeConnecting: {
    backgroundColor: colors.warning.bgSolid,
  },
  badgeFailed: {
    backgroundColor: colors.error.bgSolid,
  },
  badgeIdle: {
    backgroundColor: theme.ghostButtonHover,
  },
  badgeText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  serverInfo: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  serverHostname: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  serverIp: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  detailsToggle: {
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  detailsToggleText: {
    color: theme.link,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  capabilitiesSection: {
    marginBottom: spacing.lg,
  },
  capabilitiesTitle: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  capabilitiesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  capBadge: {
    paddingHorizontal: 10,
    paddingVertical: spacing.sm - 2,
    borderRadius: borderRadius.sm + 2,
    backgroundColor: theme.ghostButtonHover,
    opacity: 0.5,
  },
  capEnabled: {
    backgroundColor: colors.info.bgSolid,
    opacity: 1,
  },
  capText: {
    color: theme.textPrimary,
    fontSize: fontSize.xs,
  },
  urlsSection: {
    backgroundColor: theme.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  urlsTitle: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  urlText: {
    color: colors.primary[300],
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: spacing.xs,
  },
  serverActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  continueButton: {
    flex: 1,
    backgroundColor: theme.primaryButton,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  rescanButton: {
    padding: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent[500],
  },
  rescanText: {
    color: colors.accent[500],
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  // Services section
  servicesSection: {
    backgroundColor: theme.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  servicesTitle: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm - 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.backgroundHover,
  },
  serviceName: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
  },
  serviceStatus: {
    color: theme.statusOnline,
    fontSize: fontSize.xs,
  },
  // Unodes section
  unodesSection: {
    backgroundColor: theme.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  unodesTitle: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  unodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm - 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.backgroundHover,
  },
  unodeHostname: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
  },
  unodeStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  unodeOnline: {
    backgroundColor: colors.success.bgSolid,
  },
  unodeOffline: {
    backgroundColor: colors.error.bgSolid,
  },
  unodeStatusText: {
    color: colors.white,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  // Hint text
  hintText: {
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});

export default LeaderDiscovery;
