/**
 * Connection Log Viewer Component
 *
 * Modal-based log viewer with status summary, filter chips,
 * and grouped entries by date.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ConnectionLogEntry,
  ConnectionType,
  ConnectionState,
  CONNECTION_TYPE_LABELS,
} from '../types/connectionLog';
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';

interface ConnectionLogViewerProps {
  visible: boolean;
  onClose: () => void;
  entries: ConnectionLogEntry[];
  connectionState: ConnectionState;
  onClearLogs: () => void;
}

type FilterType = 'all' | ConnectionType;

// Type-specific colors and icons
const TYPE_COLORS: Record<ConnectionType, string> = {
  network: colors.info.default,
  server: colors.primary[400],
  bluetooth: '#5E5CE6',
  websocket: colors.success.default,
};

const TYPE_ICONS: Record<ConnectionType, keyof typeof Ionicons.glyphMap> = {
  network: 'wifi',
  server: 'server',
  bluetooth: 'bluetooth',
  websocket: 'swap-horizontal',
};

const STATUS_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  connected: 'checkmark-circle',
  disconnected: 'close-circle',
  connecting: 'sync-circle',
  error: 'alert-circle',
  unknown: 'help-circle',
};

const STATUS_COLORS: Record<string, string> = {
  connected: colors.success.default,
  disconnected: theme.textMuted,
  connecting: colors.warning.default,
  error: colors.error.default,
  unknown: theme.textMuted,
};

const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'network', label: 'Network' },
  { key: 'server', label: 'Server' },
  { key: 'bluetooth', label: 'Bluetooth' },
  { key: 'websocket', label: 'WebSocket' },
];

export const ConnectionLogViewer: React.FC<ConnectionLogViewerProps> = ({
  visible,
  onClose,
  entries,
  connectionState,
  onClearLogs,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const filteredEntries = useMemo(() => {
    if (activeFilter === 'all') return entries;
    return entries.filter((entry) => entry.type === activeFilter);
  }, [entries, activeFilter]);

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (date: Date): string => {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    if (isToday) return 'Today';

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const renderStatusSummary = () => (
    <View style={styles.statusSummaryContainer} testID="connection-status-summary">
      <View style={styles.statusSummary}>
        {/* All filter button */}
        <TouchableOpacity
          style={styles.statusItem}
          onPress={() => setActiveFilter('all')}
          testID="filter-icon-all"
        >
          <View
            style={[
              styles.statusIconContainer,
              { borderColor: colors.primary[400] },
              activeFilter === 'all' && styles.statusIconContainerActive,
            ]}
          >
            <Ionicons name="apps" size={18} color={colors.primary[400]} />
          </View>
          <Text style={[styles.statusLabel, { color: colors.primary[400] }]}>
            All
          </Text>
        </TouchableOpacity>

        {/* Connection type filters */}
        {(['network', 'server', 'bluetooth', 'websocket'] as ConnectionType[]).map((type) => {
          const status = connectionState[type];
          const typeColor = TYPE_COLORS[type];
          const statusColor = STATUS_COLORS[status];
          const typeIcon = TYPE_ICONS[type];
          const statusIcon = STATUS_ICONS[status];
          const isActive = activeFilter === type;

          return (
            <TouchableOpacity
              key={type}
              style={styles.statusItem}
              onPress={() => setActiveFilter(type)}
              testID={`filter-icon-${type}`}
            >
              <View
                style={[
                  styles.statusIconContainer,
                  { borderColor: typeColor },
                  isActive && styles.statusIconContainerActive,
                ]}
              >
                <Ionicons name={typeIcon} size={18} color={typeColor} />
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              </View>
              <Text style={[styles.statusLabel, { color: typeColor }]}>
                {CONNECTION_TYPE_LABELS[type]}
              </Text>
              <Ionicons name={statusIcon} size={14} color={statusColor} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderFilters = () => (
    <View style={styles.filterContainer}>
      {FILTER_OPTIONS.map((option) => {
        const isActive = activeFilter === option.key;
        const chipColor = option.key === 'all'
          ? colors.primary[400]
          : TYPE_COLORS[option.key as ConnectionType];

        return (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.filterChip,
              isActive && [styles.filterChipActive, { borderColor: chipColor }],
            ]}
            onPress={() => setActiveFilter(option.key)}
            testID={`filter-${option.key}`}
          >
            {option.key !== 'all' && (
              <Ionicons
                name={TYPE_ICONS[option.key as ConnectionType]}
                size={14}
                color={isActive ? chipColor : theme.textMuted}
              />
            )}
            <Text
              style={[
                styles.filterText,
                isActive && { color: chipColor },
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderLogEntry = ({ item, index }: { item: ConnectionLogEntry; index: number }) => {
    const statusColor = STATUS_COLORS[item.status];
    const typeColor = TYPE_COLORS[item.type];
    const statusIcon = STATUS_ICONS[item.status];
    const typeIcon = TYPE_ICONS[item.type];

    const showDateHeader =
      index === 0 ||
      formatDate(item.timestamp) !== formatDate(filteredEntries[index - 1].timestamp);

    return (
      <>
        {showDateHeader && (
          <View style={styles.dateHeader}>
            <Text style={styles.dateHeaderText}>{formatDate(item.timestamp)}</Text>
          </View>
        )}
        <View style={styles.logEntry} testID={`log-entry-${item.id}`}>
          <View style={styles.logTimeContainer}>
            <Text style={styles.logTime}>{formatTime(item.timestamp)}</Text>
          </View>
          <View style={[styles.logIndicator, { backgroundColor: typeColor }]} />
          <View style={styles.logContent}>
            <View style={styles.logHeader}>
              <Ionicons name={typeIcon} size={14} color={typeColor} />
              <Text style={[styles.logType, { color: typeColor }]}>
                {CONNECTION_TYPE_LABELS[item.type]}
              </Text>
              <Ionicons name={statusIcon} size={12} color={statusColor} />
            </View>
            <Text style={styles.logMessage}>{item.message}</Text>
            {item.details && (
              <Text style={styles.logDetails}>{item.details}</Text>
            )}
          </View>
        </View>
      </>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-text-outline" size={48} color={theme.textMuted} />
      <Text style={styles.emptyStateText}>No log entries</Text>
      <Text style={styles.emptyStateSubtext}>
        Connection events will appear here as they occur
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Connection Logs</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            testID="close-logs-button"
          >
            <Text style={styles.closeButtonText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Current Status Summary with integrated filters */}
        {renderStatusSummary()}

        {/* Log Count */}
        <View style={styles.countContainer}>
          <Text style={styles.countText}>
            {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
          </Text>
          {entries.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={onClearLogs}
              testID="clear-logs-button"
            >
              <Text style={styles.clearButtonText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Log List */}
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          renderItem={renderLogEntry}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  closeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeButtonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.primary[400],
  },
  statusSummaryContainer: {
    backgroundColor: theme.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingVertical: spacing.md,
  },
  statusSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.sm,
  },
  statusItem: {
    alignItems: 'center',
    gap: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  statusIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.backgroundInput,
    position: 'relative',
  },
  statusIconContainerActive: {
    backgroundColor: theme.backgroundHover,
    transform: [{ scale: 1.1 }],
  },
  statusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.backgroundCard,
  },
  statusLabel: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: theme.backgroundInput,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: theme.backgroundCard,
  },
  filterText: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
  },
  countContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  countText: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
  },
  clearButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  clearButtonText: {
    fontSize: fontSize.sm,
    color: colors.error.default,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  dateHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: theme.backgroundCard,
  },
  dateHeaderText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logEntry: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  logTimeContainer: {
    width: 70,
    marginRight: spacing.sm,
  },
  logTime: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontFamily: 'monospace',
  },
  logIndicator: {
    width: 3,
    borderRadius: 1.5,
    marginRight: spacing.sm,
  },
  logContent: {
    flex: 1,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  logType: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  logMessage: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  logDetails: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyStateText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textSecondary,
    marginTop: spacing.md,
  },
  emptyStateSubtext: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

export default ConnectionLogViewer;
