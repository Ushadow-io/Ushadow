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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from './theme';
import { LeaderDiscovery } from './components/LeaderDiscovery';

// Storage
import {
  UNode,
  getUnodes,
  saveUnode,
  removeUnode,
  getActiveUnodeId,
  setActiveUnode,
} from './utils/unodeStorage';
import { getAuthToken } from './utils/authStorage';

// API
import { verifyUnodeAuth } from './services/chronicleApi';

// Types
type ConnectionStatus = 'unknown' | 'checking' | 'connected' | 'error';

interface UNodeStatus {
  ushadow: ConnectionStatus;
  chronicle: ConnectionStatus;
  ushadowError?: string;
  chronicleError?: string;
}

export default function UNodeDetailsPage() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // State
  const [unodes, setUnodes] = useState<UNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, UNodeStatus>>({});
  const [loading, setLoading] = useState(true);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

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
    const ushadowUrl = `${node.apiUrl}/api/auth/me`;
    console.log(`[UNodeDetails] Checking ushadow auth: ${ushadowUrl}`);
    try {
      const response = await fetch(ushadowUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(`[UNodeDetails] Ushadow response: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`[UNodeDetails] Ushadow auth OK:`, data);
        ushadowStatus = 'connected';
      } else {
        const errorText = await response.text();
        console.log(`[UNodeDetails] Ushadow auth failed: ${response.status} - ${errorText}`);
        if (response.status === 401) {
          ushadowStatus = 'error';
          ushadowError = `401: ${errorText.substring(0, 100)}`;
        } else {
          ushadowStatus = 'error';
          ushadowError = `${response.status}: ${errorText.substring(0, 100)}`;
        }
      }
    } catch (err) {
      console.error(`[UNodeDetails] Ushadow request failed:`, err);
      ushadowStatus = 'error';
      ushadowError = `Network error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Check chronicle connection - use chronicleApiUrl if available
    let chronicleStatus: ConnectionStatus = 'unknown';
    let chronicleError: string | undefined;
    const chronicleUrl = node.chronicleApiUrl || node.apiUrl;
    console.log(`[UNodeDetails] Checking chronicle: ${chronicleUrl}/api/conversations`);
    try {
      const result = await verifyUnodeAuth(chronicleUrl, token);
      console.log(`[UNodeDetails] Chronicle result:`, result);
      if (result.valid) {
        chronicleStatus = 'connected';
      } else {
        chronicleStatus = 'error';
        chronicleError = result.error;
      }
    } catch (err) {
      console.error(`[UNodeDetails] Chronicle request failed:`, err);
      chronicleStatus = 'error';
      chronicleError = `Network error: ${err instanceof Error ? err.message : String(err)}`;
    }

    setStatuses(prev => ({
      ...prev,
      [node.id]: {
        ushadow: ushadowStatus,
        chronicle: chronicleStatus,
        ushadowError,
        chronicleError,
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

  // Show add UNode modal
  const handleAddUNode = () => {
    setShowDiscoveryModal(true);
  };

  // Handle UNode found from discovery
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

    // Reload unodes and select the new one
    const updatedUnodes = await getUnodes();
    setUnodes(updatedUnodes);
    setSelectedId(savedNode.id);
    await setActiveUnode(savedNode.id);
    setShowDiscoveryModal(false);

    // Check status of the new node
    if (token) {
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

    return (
      <View style={styles.selectedCard}>
        {/* Header */}
        <View style={styles.selectedHeader}>
          <View style={styles.selectedIconContainer}>
            <Ionicons name="server" size={32} color={colors.primary[400]} />
          </View>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedName}>{selectedNode.name}</Text>
            <Text style={styles.selectedUrl}>{selectedNode.apiUrl}</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => handleRefreshStatus(selectedNode)}
          >
            <Ionicons name="refresh" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Connection Statuses */}
        <View style={styles.statusSection}>
          <Text style={styles.statusSectionTitle}>Connection Status</Text>

          {/* Ushadow Status */}
          <View style={styles.statusItemFull}>
            <View style={styles.statusItemHeader}>
              <Text style={styles.statusItemLabel}>Ushadow Auth</Text>
              {renderStatusBadge(status.ushadow, status.ushadowError)}
            </View>
            <Text style={styles.statusEndpoint}>{selectedNode.apiUrl}/api/auth/me</Text>
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
            <Text style={styles.statusEndpoint}>{selectedNode.chronicleApiUrl || selectedNode.apiUrl}/api/conversations</Text>
            {status.chronicleError && status.chronicle === 'error' && (
              <Text style={styles.statusErrorDetail}>{status.chronicleError}</Text>
            )}
          </View>
        </View>

        {/* Details */}
        <View style={styles.detailsSection}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Stream URL</Text>
            <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
              {selectedNode.streamUrl}
            </Text>
          </View>
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

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemoveNode(selectedNode)}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error.default} />
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render other node item
  const renderOtherNode = (node: UNode) => {
    const status = statuses[node.id];
    const isConnected = status?.ushadow === 'connected' && status?.chronicle === 'connected';
    const hasError = status?.ushadow === 'error' || status?.chronicle === 'error';

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

        {/* Add Button */}
        <TouchableOpacity style={styles.addNodeButton} onPress={handleAddUNode}>
          <Ionicons name="add-circle-outline" size={24} color={colors.primary[400]} />
          <Text style={styles.addNodeText}>Add UNode</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Discovery Modal */}
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
  refreshButton: {
    padding: spacing.sm,
  },
  // Status section
  statusSection: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  statusSectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: spacing.md,
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
    padding: spacing.lg,
    alignItems: 'flex-start',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  removeButtonText: {
    fontSize: fontSize.sm,
    color: colors.error.default,
    fontWeight: '500',
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
});
