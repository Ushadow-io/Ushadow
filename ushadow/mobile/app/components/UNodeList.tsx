/**
 * UNode List Component
 *
 * Displays list of saved UNodes with switching capability
 * and an add button for new connections.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UNode } from '../utils/unodeStorage';
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';

interface UNodeListProps {
  unodes: UNode[];
  activeUnodeId: string | null;
  onSelectUnode: (unode: UNode) => void;
  onAddUnode: () => void;
  onDeleteUnode: (id: string) => void;
  isConnecting?: boolean;
  testID?: string;
}

export const UNodeList: React.FC<UNodeListProps> = ({
  unodes,
  activeUnodeId,
  onSelectUnode,
  onAddUnode,
  onDeleteUnode,
  isConnecting = false,
  testID = 'unode-list',
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleLongPress = useCallback((unode: UNode) => {
    Alert.alert(
      'Remove UNode',
      `Remove "${unode.name}" from saved connections?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onDeleteUnode(unode.id),
        },
      ]
    );
  }, [onDeleteUnode]);

  const formatLastConnected = (dateStr?: string): string => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderUnode = ({ item: unode }: { item: UNode }) => {
    const isActive = activeUnodeId === unode.id;
    const isExpanded = expandedId === unode.id;

    return (
      <TouchableOpacity
        style={[
          styles.unodeCard,
          isActive && styles.unodeCardActive,
        ]}
        onPress={() => onSelectUnode(unode)}
        onLongPress={() => handleLongPress(unode)}
        disabled={isConnecting}
        testID={`unode-item-${unode.id}`}
      >
        <View style={styles.unodeMain}>
          <View style={styles.unodeIcon}>
            <Ionicons
              name={isActive ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={isActive ? colors.primary[400] : theme.textMuted}
            />
          </View>
          <View style={styles.unodeInfo}>
            <View style={styles.unodeHeader}>
              <Text style={[styles.unodeName, isActive && styles.unodeNameActive]}>
                {unode.name}
              </Text>
              {isActive && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              )}
            </View>
            <Text style={styles.unodeLastConnected}>
              {unode.tailscaleIp || unode.apiUrl.replace(/^https?:\/\//, '').split('/')[0]}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.expandButton}
            onPress={() => setExpandedId(isExpanded ? null : unode.id)}
            testID={`unode-expand-${unode.id}`}
          >
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.textMuted}
            />
          </TouchableOpacity>
        </View>

        {isExpanded && (
          <View style={styles.unodeDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>API URL</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {unode.apiUrl}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Stream URL</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {unode.streamUrl}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Last Connected</Text>
              <Text style={styles.detailValue}>
                {formatLastConnected(unode.lastConnectedAt)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Auth</Text>
              <Text style={styles.detailValue}>
                {unode.authToken ? 'Authenticated' : 'No token'}
              </Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState} testID="unode-empty-state">
      <Ionicons name="cube-outline" size={48} color={theme.textMuted} />
      <Text style={styles.emptyTitle}>No UNodes saved</Text>
      <Text style={styles.emptySubtitle}>
        Add your first leader node connection to get started
      </Text>
    </View>
  );

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>UNodes</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={onAddUnode}
          testID="add-unode-button"
        >
          <Ionicons name="add-circle" size={24} color={colors.primary[400]} />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {unodes.length > 0 ? (
        <FlatList
          data={unodes}
          keyExtractor={(item) => item.id}
          renderItem={renderUnode}
          scrollEnabled={false}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        renderEmptyState()
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addButtonText: {
    color: colors.primary[400],
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  listContent: {
    gap: spacing.sm,
  },
  unodeCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  unodeCardActive: {
    borderColor: colors.primary[400],
    backgroundColor: `${colors.primary[400]}10`,
  },
  unodeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  unodeIcon: {
    marginRight: spacing.md,
  },
  unodeInfo: {
    flex: 1,
  },
  unodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unodeName: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: theme.textPrimary,
  },
  unodeNameActive: {
    color: colors.primary[400],
  },
  activeBadge: {
    backgroundColor: colors.primary[400],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  activeBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  unodeLastConnected: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
  },
  expandButton: {
    padding: spacing.sm,
  },
  unodeDetails: {
    backgroundColor: theme.backgroundInput,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    minWidth: 100,
  },
  detailValue: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    flex: 1,
    textAlign: 'right',
    fontFamily: 'monospace',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: theme.textSecondary,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

export default UNodeList;
