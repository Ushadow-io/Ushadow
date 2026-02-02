/**
 * UNode Details Page
 *
 * Full-page view for managing UNode connections.
 * Shows selected node with full details, connection statuses,
 * and list of other available nodes.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from './theme';
import { LeaderDiscovery } from './components/LeaderDiscovery';
import QRScanner, { UshadowConnectionData } from './components/QRScanner';
import { useTailscaleDiscovery } from './hooks/useTailscaleDiscovery';

// Storage
import {
  UNode,
  getUnodes,
  saveUnode,
  removeUnode,
  getActiveUnodeId,
  setActiveUnode,
  updateUnodeStreamConfig,
  updateUnodeUrls,
  parseStreamUrl,
} from './_utils/unodeStorage';
import { getAuthToken, saveAuthToken } from './_utils/authStorage';

// API
import { verifyUnodeAuth } from './services/chronicleApi';

// Types
type ConnectionStatus = 'unknown' | 'checking' | 'connected' | 'error';

interface UNodeStatus {
  ushadow: ConnectionStatus;
  chronicle: ConnectionStatus;
  ushadowError?: string;
  chronicleError?: string;
  ushadowStatusCode?: number;
  chronicleStatusCode?: number;
}

export default function UNodeDetailsPage() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Tailscale discovery hook for QR scanning
  const { connectFromQR } = useTailscaleDiscovery();

  // State
  const [unodes, setUnodes] = useState<UNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, UNodeStatus>>({});
  const [loading, setLoading] = useState(true);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [rescanNodeId, setRescanNodeId] = useState<string | null>(null); // Track node being rescanned
  const [cardExpanded, setCardExpanded] = useState(false);

  // Editable endpoint paths for testing
  // These should match the endpoints used in chronicleApi.verifyUnodeAuth
  const [ushadowEndpoint, setUshadowEndpoint] = useState('/api/auth/me');
  const [chronicleEndpoint, setChronicleEndpoint] = useState('/api/services/chronicle-backend/proxy/users/me');
  const [streamEndpoint, setStreamEndpoint] = useState('/chronicle/ws_pcm');
  const [streamProtocol, setStreamProtocol] = useState<'ws' | 'wss'>('wss');

  // Timeout configuration (ms)
  const [requestTimeout, setRequestTimeout] = useState(10000); // 10 seconds default

  // URL editing mode
  const [showUrlEdit, setShowUrlEdit] = useState(false);
  const [editApiUrl, setEditApiUrl] = useState('');
  const [editChronicleApiUrl, setEditChronicleApiUrl] = useState('');

  // Debug: Manual QR data input
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualQrData, setManualQrData] = useState('');

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Initialize stream config and URLs from selected node
  // Only run when selectedId changes, not when unodes updates (to avoid overwriting edits)
  useEffect(() => {
    const loadNodeConfig = async () => {
      if (selectedId) {
        const nodes = await getUnodes();
        const node = nodes.find(n => n.id === selectedId);
        if (node) {
          // Load stream config
          if (node.streamUrl) {
            const config = parseStreamUrl(node.streamUrl);
            setStreamEndpoint(config.path);
            setStreamProtocol(config.protocol);
          }
          // Load URLs for editing
          setEditApiUrl(node.apiUrl || '');
          setEditChronicleApiUrl(node.chronicleApiUrl || '');
        }
      }
    };
    loadNodeConfig();
  }, [selectedId]); // Only re-run when selection changes

  const loadData = async () => {
    setLoading(true);
    try {
      const [savedUnodes, activeId, token] = await Promise.all([
        getUnodes(),
        getActiveUnodeId(),
        getAuthToken(),
      ]);

      setUnodes(savedUnodes);
      setSelectedId(activeId || (savedUnodes.length > 0 ? savedUnodes[0].id : null));
      setAuthToken(token);

      // Check status for all nodes
      if (token && savedUnodes.length > 0) {
        checkAllStatuses(savedUnodes, token);
      }
    } catch (err) {
      console.error('[UNodeDetails] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check connection status for all UNodes
  const checkAllStatuses = async (nodes: UNode[], token: string) => {
    for (const node of nodes) {
      checkNodeStatus(node, token);
    }
  };

  // Check status for a single node
  const checkNodeStatus = async (node: UNode, token: string) => {
    setStatuses(prev => ({
      ...prev,
      [node.id]: {
        ushadow: 'checking',
        chronicle: 'checking',
      },
    }));

    // Check ushadow connection (auth endpoint)
    let ushadowStatus: ConnectionStatus = 'unknown';
    let ushadowError: string | undefined;
    let ushadowStatusCode: number | undefined;
    const ushadowUrl = `${node.apiUrl}${ushadowEndpoint}`;
    console.log(`[UNodeDetails] Checking ushadow auth: ${ushadowUrl}`);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

      const response = await fetch(ushadowUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log(`[UNodeDetails] Ushadow response: ${response.status}`);
      ushadowStatusCode = response.status;
      if (response.ok) {
        const data = await response.json();
        console.log(`[UNodeDetails] Ushadow auth OK:`, data);
        ushadowStatus = 'connected';
      } else {
        const errorText = await response.text();
        console.log(`[UNodeDetails] Ushadow auth failed: ${response.status} - ${errorText}`);
        ushadowStatus = 'error';
        ushadowError = errorText.substring(0, 100);
      }
    } catch (err) {
      console.error(`[UNodeDetails] Ushadow request failed:`, err);
      ushadowStatus = 'error';
      ushadowError = err instanceof Error ? err.message : String(err);
    }

    // Check chronicle connection - chronicle is proxied at /chronicle/ on main apiUrl
    let chronicleStatus: ConnectionStatus = 'unknown';
    let chronicleError: string | undefined;
    let chronicleStatusCode: number | undefined;
    // Use apiUrl as base since chronicle is proxied (endpoint includes /chronicle/ prefix)
    const chronicleFullUrl = `${node.apiUrl}${chronicleEndpoint}`;
    console.log(`[UNodeDetails] Checking chronicle: ${chronicleFullUrl}`);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

      const response = await fetch(chronicleFullUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log(`[UNodeDetails] Chronicle response: ${response.status}`);
      chronicleStatusCode = response.status;
      if (response.ok) {
        chronicleStatus = 'connected';
      } else {
        const errorText = await response.text();
        console.log(`[UNodeDetails] Chronicle failed: ${response.status} - ${errorText}`);
        chronicleStatus = 'error';
        chronicleError = errorText.substring(0, 100);
      }
    } catch (err) {
      console.error(`[UNodeDetails] Chronicle request failed:`, err);
      chronicleStatus = 'error';
      chronicleError = err instanceof Error ? err.message : String(err);
    }

    setStatuses(prev => ({
      ...prev,
      [node.id]: {
        ushadow: ushadowStatus,
        chronicle: chronicleStatus,
        ushadowError,
        chronicleError,
        ushadowStatusCode,
        chronicleStatusCode,
      },
    }));
  };

  // Select a node
  const handleSelectNode = async (nodeId: string) => {
    setSelectedId(nodeId);
    await setActiveUnode(nodeId);
  };

  // Remove a node
  const handleRemoveNode = (node: UNode) => {
    Alert.alert(
      'Remove UNode',
      `Remove "${node.name}" from saved connections?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeUnode(node.id);
            const updated = await getUnodes();
            setUnodes(updated);

            if (selectedId === node.id) {
              const newActive = updated.length > 0 ? updated[0].id : null;
              setSelectedId(newActive);
              if (newActive) await setActiveUnode(newActive);
            }
          },
        },
      ]
    );
  };

  // Refresh status for a node
  const handleRefreshStatus = (node: UNode) => {
    if (authToken) {
      checkNodeStatus(node, authToken);
    }
  };

  // Save stream config when user finishes editing
  const handleStreamConfigSave = async () => {
    if (selectedId && streamEndpoint) {
      try {
        await updateUnodeStreamConfig(selectedId, {
          protocol: streamProtocol,
          path: streamEndpoint,
        });
        console.log('[UNodeDetails] Saved stream config:', streamProtocol, streamEndpoint);
      } catch (error) {
        console.error('[UNodeDetails] Failed to save stream config:', error);
      }
    }
  };

  // Save URL changes
  const handleUrlsSave = async () => {
    if (selectedId) {
      try {
        await updateUnodeUrls(selectedId, {
          apiUrl: editApiUrl,
          chronicleApiUrl: editChronicleApiUrl || undefined,
        });
        // Refresh unodes to reflect changes
        const updatedUnodes = await getUnodes();
        setUnodes(updatedUnodes);
        console.log('[UNodeDetails] Saved URLs:', editApiUrl, editChronicleApiUrl);
      } catch (error) {
        console.error('[UNodeDetails] Failed to save URLs:', error);
      }
    }
  };

  // Handle protocol toggle
  const handleProtocolToggle = async () => {
    const newProtocol = streamProtocol === 'wss' ? 'ws' : 'wss';
    setStreamProtocol(newProtocol);
    if (selectedId) {
      try {
        await updateUnodeStreamConfig(selectedId, { protocol: newProtocol });
        console.log('[UNodeDetails] Saved stream protocol:', newProtocol);
      } catch (error) {
        console.error('[UNodeDetails] Failed to save protocol:', error);
      }
    }
  };

  // Show add UNode modal
  const handleAddUNode = () => {
    setRescanNodeId(null); // Adding new, not rescanning
    setShowDiscoveryModal(true);
  };

  // Open scanner directly for rescan
  const handleRescanNode = (node: UNode) => {
    setRescanNodeId(node.id);
    setShowScanner(true);
  };

  // Handle QR scan result for rescan
  const handleQRScan = async (data: UshadowConnectionData) => {
    console.log('[UNodeDetails] QR scan successful, data:', data);
    setShowScanner(false);

    // Connect using the QR data
    console.log('[UNodeDetails] Attempting to connect from QR...');
    const result = await connectFromQR(data);
    console.log('[UNodeDetails] Connection result:', result);

    if (!result.success || !result.leader) {
      console.error('[UNodeDetails] Connection failed:', result.error);
      Alert.alert('Connection Failed', result.error || 'Could not connect to the scanned server');
      setRescanNodeId(null);
      return;
    }

    // Update the existing node with new connection info
    const existingNode = unodes.find(n => n.id === rescanNodeId);
    await saveUnode({
      id: rescanNodeId!, // Keep same ID
      name: existingNode?.name || result.leader.hostname.split('.')[0] || 'UNode',
      apiUrl: result.leader.apiUrl,
      chronicleApiUrl: result.leader.chronicleApiUrl,
      streamUrl: result.leader.streamUrl,
      tailscaleIp: new URL(result.leader.apiUrl).hostname,
      authToken: data.auth_token,
    });

    // Reload unodes
    await getUnodes();
    setRescanNodeId(null);

    if (data.auth_token) {
      // Save token globally so other pages can use it
      await saveAuthToken(data.auth_token);
    }

    // Navigate back to the main page so user can start streaming
    router.replace('/');
  };

  // Handle UNode found from discovery (for adding new nodes)
  const handleUnodeFound = async (apiUrl: string, streamUrl: string, token?: string, chronicleApiUrl?: string) => {
    const name = new URL(apiUrl).hostname.split('.')[0] || 'UNode';

    const savedNode = await saveUnode({
      name,
      apiUrl,
      chronicleApiUrl,
      streamUrl,
      tailscaleIp: new URL(apiUrl).hostname,
      authToken: token,
    });

    // Reload unodes and select the new node
    const updatedUnodes = await getUnodes();
    setUnodes(updatedUnodes);
    setSelectedId(savedNode.id);
    await setActiveUnode(savedNode.id);
    setShowDiscoveryModal(false);

    // Check status of the node
    if (token) {
      // Save token globally so other pages can use it
      await saveAuthToken(token);
      setAuthToken(token);
      checkNodeStatus(savedNode, token);
    }
  };

  // Get selected node
  const selectedNode = unodes.find(n => n.id === selectedId);
  const otherNodes = unodes.filter(n => n.id !== selectedId);

  // Format date
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render status badge
  const renderStatusBadge = (status: ConnectionStatus, error?: string) => {
    const config = {
      unknown: { icon: 'help-circle-outline', color: theme.textMuted, label: 'Unknown' },
      checking: { icon: 'sync', color: colors.warning.default, label: 'Checking...' },
      connected: { icon: 'checkmark-circle', color: colors.success.default, label: 'Connected' },
      error: { icon: 'alert-circle', color: colors.error.default, label: error || 'Error' },
    }[status];

    return (
      <View style={styles.statusBadge}>
        {status === 'checking' ? (
          <ActivityIndicator size="small" color={config.color} />
        ) : (
          <Ionicons name={config.icon as any} size={16} color={config.color} />
        )}
        <Text style={[styles.statusLabel, { color: config.color }]}>
          {config.label}
        </Text>
      </View>
    );
  };

  // Render the large selected node card
  const renderSelectedNodeCard = () => {
    if (!selectedNode) {
      return (
        <View style={styles.emptyCard}>
          <Ionicons name="server-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>No UNode Selected</Text>
          <Text style={styles.emptySubtitle}>Add a UNode to start streaming</Text>
          <TouchableOpacity style={styles.addButton} onPress={handleAddUNode}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add UNode</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const status = statuses[selectedNode.id] || {
      ushadow: 'unknown',
      chronicle: 'unknown',
    };

    // Determine overall status for collapsed view
    // Only ushadow connection is required (chronicle is optional)
    const isConnected = status.ushadow === 'connected';
    const hasError = status.ushadow === 'error'; // Only fail on ushadow error
    const isChecking = status.ushadow === 'checking' || status.chronicle === 'checking';

    return (
      <View style={styles.selectedCard}>
        {/* Collapsed Header - Always visible, tap to expand */}
        <TouchableOpacity
          style={styles.selectedHeader}
          onPress={() => setCardExpanded(!cardExpanded)}
          activeOpacity={0.7}
        >
          <View style={styles.selectedIconContainer}>
            <Ionicons name="server" size={32} color={colors.primary[400]} />
          </View>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedName}>{selectedNode.name}</Text>
            {/* Compact status list */}
            <View style={styles.compactStatusList}>
              <View style={styles.compactStatusRow}>
                <Text style={styles.compactServiceName}>ushadow:</Text>
                {status.ushadow === 'checking' ? (
                  <ActivityIndicator size="small" color={colors.warning.default} />
                ) : (
                  <Text style={[styles.compactStatusText,
                    status.ushadow === 'connected' ? styles.statusTextConnected :
                    status.ushadow === 'error' ? styles.statusTextError : styles.statusTextUnknown]}>
                    {status.ushadow === 'connected' ? '200' : status.ushadowStatusCode || status.ushadow}
                  </Text>
                )}
              </View>
              <View style={styles.compactStatusRow}>
                <Text style={styles.compactServiceName}>chronicle:</Text>
                {status.chronicle === 'checking' ? (
                  <ActivityIndicator size="small" color={colors.warning.default} />
                ) : (
                  <Text style={[styles.compactStatusText,
                    status.chronicle === 'connected' ? styles.statusTextConnected :
                    status.chronicle === 'error' ? styles.statusTextError : styles.statusTextUnknown]}>
                    {status.chronicle === 'connected' ? '200' : status.chronicleStatusCode || status.chronicle}
                  </Text>
                )}
              </View>
            </View>
          </View>
          <Ionicons
            name={cardExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={theme.textSecondary}
          />
        </TouchableOpacity>

        {/* Actions - Always visible below header */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemoveNode(selectedNode)}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rescanButton}
            onPress={() => handleRescanNode(selectedNode)}
            testID="rescan-qr-button"
          >
            <Ionicons name="qr-code-outline" size={18} color="#fff" />
            <Text style={styles.rescanButtonText}>Rescan</Text>
          </TouchableOpacity>
        </View>

        {/* Expanded Content - Advanced details */}
        {cardExpanded && (
          <>
            {/* URL Configuration - Hidden behind edit button */}
            <View style={styles.urlSection}>
              <TouchableOpacity
                style={styles.editUrlsButton}
                onPress={() => setShowUrlEdit(!showUrlEdit)}
              >
                <Ionicons
                  name={showUrlEdit ? 'chevron-up' : 'settings-outline'}
                  size={16}
                  color={colors.primary[400]}
                />
                <Text style={styles.editUrlsText}>
                  {showUrlEdit ? 'Hide URL Config' : 'Edit URLs'}
                </Text>
              </TouchableOpacity>

              {showUrlEdit && (
                <View style={styles.urlEditFields}>
                  {/* API URL */}
                  <View style={styles.urlField}>
                    <Text style={styles.urlFieldLabel}>API URL (Ushadow)</Text>
                    <TextInput
                      style={styles.urlInput}
                      value={editApiUrl}
                      onChangeText={setEditApiUrl}
                      onBlur={handleUrlsSave}
                      onSubmitEditing={handleUrlsSave}
                      placeholder="https://example.ts.net"
                      placeholderTextColor={theme.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      returnKeyType="done"
                      testID="edit-api-url"
                    />
                  </View>

                  {/* Chronicle API URL */}
                  <View style={styles.urlField}>
                    <Text style={styles.urlFieldLabel}>Chronicle API URL (optional)</Text>
                    <Text style={styles.urlFieldHint}>
                      Leave empty to use: API URL + /chronicle/api
                    </Text>
                    <TextInput
                      style={styles.urlInput}
                      value={editChronicleApiUrl}
                      onChangeText={setEditChronicleApiUrl}
                      onBlur={handleUrlsSave}
                      onSubmitEditing={handleUrlsSave}
                      placeholder="https://example.ts.net/chronicle/api"
                      placeholderTextColor={theme.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      returnKeyType="done"
                      testID="edit-chronicle-api-url"
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Connection Statuses */}
            <View style={styles.statusSection}>
              <View style={styles.statusHeader}>
                <Text style={styles.statusSectionTitle}>Connection Status</Text>
                <View style={styles.timeoutControl}>
                  <Text style={styles.timeoutLabel}>Timeout: {requestTimeout / 1000}s</Text>
                  <View style={styles.timeoutButtons}>
                    <TouchableOpacity
                      style={styles.timeoutButton}
                      onPress={() => setRequestTimeout(Math.max(3000, requestTimeout - 2000))}
                    >
                      <Text style={styles.timeoutButtonText}>-</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.timeoutButton}
                      onPress={() => setRequestTimeout(Math.min(30000, requestTimeout + 2000))}
                    >
                      <Text style={styles.timeoutButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Ushadow Status */}
              <View style={styles.statusItemFull}>
                <View style={styles.statusItemHeader}>
                  <Text style={styles.statusItemLabel}>Ushadow Auth</Text>
                  {renderStatusBadge(status.ushadow, status.ushadowError)}
                </View>
                <Text style={styles.endpointBaseUrl}>{selectedNode.apiUrl}</Text>
                <TextInput
                  style={styles.endpointInput}
                  value={ushadowEndpoint}
                  onChangeText={setUshadowEndpoint}
                  placeholder="/api/auth/me"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
                {status.ushadowError && status.ushadow === 'error' && (
                  <Text style={styles.statusErrorDetail}>{status.ushadowError}</Text>
                )}
              </View>

              {/* Chronicle Status */}
              <View style={styles.statusItemFull}>
                <View style={styles.statusItemHeader}>
                  <Text style={styles.statusItemLabel}>Chronicle API</Text>
                  {renderStatusBadge(status.chronicle, status.chronicleError)}
                </View>
                <Text style={styles.endpointBaseUrl}>{selectedNode.apiUrl}</Text>
                <TextInput
                  style={styles.endpointInput}
                  value={chronicleEndpoint}
                  onChangeText={setChronicleEndpoint}
                  placeholder="/users/me"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
                {status.chronicleError && status.chronicle === 'error' && (
                  <Text style={styles.statusErrorDetail}>{status.chronicleError}</Text>
                )}
              </View>

              {/* Streaming URL */}
              <View style={styles.statusItemFull}>
                <View style={styles.statusItemHeader}>
                  <Text style={styles.statusItemLabel}>Stream URL</Text>
                  {/* Protocol Toggle */}
                  <TouchableOpacity
                    style={[
                      styles.protocolToggle,
                      streamProtocol === 'wss' && styles.protocolToggleSecure
                    ]}
                    onPress={handleProtocolToggle}
                  >
                    <Text style={styles.protocolToggleText}>{streamProtocol}://</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.endpointBaseUrl}>
                  {streamProtocol}://{selectedNode.apiUrl?.replace('https://', '').replace('http://', '') || ''}
                </Text>
                <TextInput
                  style={styles.endpointInput}
                  value={streamEndpoint}
                  onChangeText={setStreamEndpoint}
                  onBlur={handleStreamConfigSave}
                  onSubmitEditing={handleStreamConfigSave}
                  placeholder="/chronicle/ws_pcm"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
              </View>

              <TouchableOpacity
                style={styles.refreshStatusButton}
                onPress={() => handleRefreshStatus(selectedNode)}
              >
                <Ionicons name="refresh" size={16} color={colors.primary[400]} />
                <Text style={styles.refreshStatusText}>Test Endpoints</Text>
              </TouchableOpacity>
            </View>

            {/* Details */}
            <View style={styles.detailsSection}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Added</Text>
                <Text style={styles.detailValue}>{formatDate(selectedNode.addedAt)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last Connected</Text>
                <Text style={styles.detailValue}>{formatDate(selectedNode.lastConnectedAt)}</Text>
              </View>
              {selectedNode.tailscaleIp && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tailscale IP</Text>
                  <Text style={styles.detailValue}>{selectedNode.tailscaleIp}</Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>
    );
  };

  // Render other node item
  const renderOtherNode = (node: UNode) => {
    const status = statuses[node.id];
    // Only ushadow connection is required (chronicle is optional)
    const isConnected = status?.ushadow === 'connected';
    const hasError = status?.ushadow === 'error'; // Only fail on ushadow error

    return (
      <TouchableOpacity
        key={node.id}
        style={styles.otherNodeCard}
        onPress={() => handleSelectNode(node.id)}
        onLongPress={() => handleRemoveNode(node)}
      >
        <View style={styles.otherNodeIcon}>
          <Ionicons name="server-outline" size={24} color={theme.textSecondary} />
        </View>
        <View style={styles.otherNodeInfo}>
          <Text style={styles.otherNodeName}>{node.name}</Text>
          <Text style={styles.otherNodeUrl} numberOfLines={1}>{node.apiUrl}</Text>
        </View>
        <View style={styles.otherNodeStatus}>
          {status?.ushadow === 'checking' || status?.chronicle === 'checking' ? (
            <ActivityIndicator size="small" color={theme.textMuted} />
          ) : (
            <Ionicons
              name={isConnected ? 'checkmark-circle' : hasError ? 'alert-circle' : 'help-circle-outline'}
              size={20}
              color={isConnected ? colors.success.default : hasError ? colors.error.default : theme.textMuted}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[400]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Destinations</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Selected Node Card */}
        <Text style={styles.sectionTitle}>Selected UNode</Text>
        {renderSelectedNodeCard()}

        {/* Other Nodes */}
        {otherNodes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Other UNodes</Text>
            <View style={styles.otherNodesList}>
              {otherNodes.map(renderOtherNode)}
            </View>
          </>
        )}

        {/* Test Audio Discovery */}
        {selectedNode && authToken && (
          <TouchableOpacity
            style={[styles.addNodeButton, { backgroundColor: '#FFF3E0' }]}
            onPress={async () => {
              try {
                const { getAvailableAudioDestinations, buildRelayUrl } = await import('./services/audioProviderApi');
                console.log('[Test] Querying audio destinations...');
                const destinations = await getAvailableAudioDestinations(selectedNode.apiUrl, authToken);
                console.log('[Test] Found destinations:', destinations);
                Alert.alert(
                  '✅ Audio Discovery Success',
                  `Found ${destinations.length} destination(s):\n\n${destinations.map(d => `• ${d.instance_name} (${d.status})`).join('\n')}`
                );
                if (destinations.length > 0) {
                  const relayUrl = buildRelayUrl(selectedNode.apiUrl, authToken, destinations);
                  console.log('[Test] Relay URL:', relayUrl);
                }
              } catch (err) {
                console.error('[Test] Failed:', err);
                Alert.alert('❌ Test Failed', err instanceof Error ? err.message : 'Unknown error');
              }
            }}
          >
            <Ionicons name="radio-outline" size={24} color="#F57C00" />
            <Text style={[styles.addNodeText, { color: '#F57C00' }]}>🧪 Test Audio Discovery</Text>
          </TouchableOpacity>
        )}

        {/* Add Button */}
        <TouchableOpacity style={styles.addNodeButton} onPress={handleAddUNode}>
          <Ionicons name="add-circle-outline" size={24} color={colors.primary[400]} />
          <Text style={styles.addNodeText}>Add UNode</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* QR Scanner for rescan */}
      <QRScanner
        visible={showScanner}
        onClose={() => { setShowScanner(false); setRescanNodeId(null); }}
        onScan={handleQRScan}
      />

      {/* Discovery Modal for adding new nodes */}
      <Modal
        visible={showDiscoveryModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDiscoveryModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDiscoveryModal(false)} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add UNode</Text>
            <View style={styles.modalCloseButton} />
          </View>
          <ScrollView style={styles.modalContent}>
            <LeaderDiscovery onLeaderFound={handleUnodeFound} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
  },
  backText: {
    fontSize: fontSize.base,
    color: theme.textPrimary,
    marginLeft: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  headerSpacer: {
    width: 70,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  // Empty state
  emptyCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing['2xl'],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[400],
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  addButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  // Selected card
  selectedCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primary[400],
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  selectedIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary[400] + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  selectedInfo: {
    flex: 1,
  },
  selectedName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  selectedUrl: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    marginTop: 2,
  },
  // Compact status for collapsed view
  compactStatusList: {
    marginTop: spacing.xs,
  },
  compactStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  compactServiceName: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotConnected: {
    backgroundColor: colors.success.default,
  },
  statusDotError: {
    backgroundColor: colors.error.default,
  },
  statusDotUnknown: {
    backgroundColor: theme.textMuted,
  },
  compactStatusText: {
    fontSize: fontSize.sm,
  },
  statusTextConnected: {
    color: colors.success.default,
  },
  statusTextError: {
    color: colors.error.default,
  },
  statusTextUnknown: {
    color: theme.textMuted,
  },
  refreshStatusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  refreshStatusText: {
    fontSize: fontSize.sm,
    color: colors.primary[400],
  },
  refreshButton: {
    padding: spacing.sm,
  },
  // Status section
  statusSection: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusSectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  timeoutControl: {
    alignItems: 'flex-end',
  },
  timeoutLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginBottom: spacing.xs,
  },
  timeoutButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  timeoutButton: {
    width: 28,
    height: 28,
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeoutButtonText: {
    fontSize: fontSize.base,
    color: colors.primary[400],
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  statusItem: {
    flex: 1,
  },
  statusItemLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  statusItemFull: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  statusItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statusEndpoint: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontFamily: 'monospace',
  },
  endpointBaseUrl: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontFamily: 'monospace',
    marginTop: spacing.xs,
  },
  endpointInput: {
    fontSize: fontSize.sm,
    color: '#ffffff',
    fontFamily: 'monospace',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: colors.primary[600],
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  protocolToggle: {
    backgroundColor: colors.warning.default,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  protocolToggleSecure: {
    backgroundColor: colors.success.default,
  },
  protocolToggleText: {
    fontSize: fontSize.xs,
    color: '#fff',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  statusErrorDetail: {
    fontSize: fontSize.sm,
    color: colors.error.default,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  // Details section
  detailsSection: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    fontWeight: '500',
  },
  // Actions
  actionsSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.default,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  removeButtonText: {
    fontSize: fontSize.base,
    color: '#fff',
    fontWeight: '600',
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[400],
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  rescanButtonText: {
    fontSize: fontSize.base,
    color: '#fff',
    fontWeight: '600',
  },
  // Other nodes list
  otherNodesList: {
    gap: spacing.sm,
  },
  otherNodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  otherNodeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.backgroundInput,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  otherNodeInfo: {
    flex: 1,
  },
  otherNodeName: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: theme.textPrimary,
  },
  otherNodeUrl: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
  },
  otherNodeStatus: {
    paddingLeft: spacing.sm,
  },
  // Add node button
  addNodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
  },
  addNodeText: {
    fontSize: fontSize.base,
    color: colors.primary[400],
    fontWeight: '500',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  modalContent: {
    flex: 1,
  },
  // URL editing section
  urlSection: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  editUrlsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: theme.backgroundInput,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary[600],
  },
  editUrlsText: {
    fontSize: fontSize.sm,
    color: colors.primary[400],
    fontWeight: '600',
  },
  urlEditFields: {
    marginTop: spacing.md,
  },
  urlField: {
    marginBottom: spacing.md,
  },
  urlFieldLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  urlFieldHint: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  urlInput: {
    fontSize: fontSize.sm,
    color: '#ffffff',
    fontFamily: 'monospace',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: colors.primary[600],
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
});
