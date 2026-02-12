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
import { StreamingSession } from '../types/streamingSession';
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';

interface ConnectionLogViewerProps {
  visible: boolean;
  onClose: () => void;
  entries: ConnectionLogEntry[];
  connectionState: ConnectionState;
  sessions?: StreamingSession[];
  onClearLogs: () => void;
  onClearLogsByType: (type: ConnectionType) => void;
  onClearSessions?: () => void;
}

type FilterType = 'all' | ConnectionType | 'sessions';

// Type-specific colors and icons
const TYPE_COLORS: Record<ConnectionType | 'sessions', string> = {
  network: colors.info.default,
  server: colors.primary[400],
  bluetooth: '#5E5CE6',
  websocket: colors.success.default,
  sessions: colors.warning.default,
};

const TYPE_ICONS: Record<ConnectionType | 'sessions', keyof typeof Ionicons.glyphMap> = {
  network: 'wifi',
  server: 'server',
  bluetooth: 'bluetooth',
  websocket: 'swap-horizontal',
  sessions: 'time-outline',
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

const TAB_OPTIONS: { key: FilterType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All', icon: 'list' },
  { key: 'network', label: 'Network', icon: 'wifi' },
  { key: 'server', label: 'Server', icon: 'server' },
  { key: 'bluetooth', label: 'BT', icon: 'bluetooth' },
  { key: 'websocket', label: 'WS', icon: 'swap-horizontal' },
  { key: 'sessions', label: 'Sessions', icon: 'time-outline' },
];

export const ConnectionLogViewer: React.FC<ConnectionLogViewerProps> = ({
  visible,
  onClose,
  entries,
  connectionState,
  sessions = [],
  onClearLogs,
  onClearLogsByType,
  onClearSessions,
}) => {
  const [activeTab, setActiveTab] = useState<FilterType>('all');

  const filteredEntries = useMemo(() => {
    if (activeTab === 'all') return entries;
    if (activeTab === 'sessions') return [];
    return entries.filter((entry) => entry.type === activeTab);
  }, [entries, activeTab]);

  const isSessionsView = activeTab === 'sessions';

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

  const renderTabs = () => (
    <View style={styles.tabContainer} testID="connection-tabs">
      {TAB_OPTIONS.map((tab) => {
        const isActive = activeTab === tab.key;
        let tabColor = colors.primary[400];
        let status: string | undefined;

        if (tab.key !== 'all' && tab.key !== 'sessions') {
          tabColor = TYPE_COLORS[tab.key as ConnectionType];
          status = connectionState[tab.key as ConnectionType];
        } else if (tab.key === 'sessions') {
          tabColor = TYPE_COLORS.sessions;
        }

        const statusColor = status ? STATUS_COLORS[status] : undefined;

        return (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              isActive && [styles.tabActive, { borderBottomColor: tabColor }],
            ]}
            onPress={() => setActiveTab(tab.key)}
            testID={`tab-${tab.key}`}
          >
            <View style={styles.tabIconContainer}>
              <Ionicons
                name={tab.icon}
                size={24}
                color={isActive ? tabColor : theme.textMuted}
              />
              {status && statusColor && (
                <View style={[styles.tabStatusDot, { backgroundColor: statusColor }]} />
              )}
            </View>
            <Text
              style={[
                styles.tabLabel,
                isActive ? { color: tabColor } : { color: theme.textMuted },
              ]}
            >
              {tab.label}
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

  const renderSessionItem = ({ item }: { item: StreamingSession }) => {
    const duration = item.durationSeconds
      ? `${Math.floor(item.durationSeconds / 60)}m ${item.durationSeconds % 60}s`
      : 'In progress';
    const startTime = new Date(item.startTime).toLocaleString();
    const endTime = item.endTime ? new Date(item.endTime).toLocaleString() : null;
    const hasError = !!item.error;

    // Format end reason
    const endReasonLabels = {
      manual_stop: 'Stopped by user',
      connection_lost: 'Connection lost',
      error: 'Error occurred',
      timeout: 'Connection timeout',
    };
    const endReasonText = item.endReason ? endReasonLabels[item.endReason] : 'Unknown';

    return (
      <View style={styles.sessionEntry} testID={`session-${item.id}`}>
        <View style={styles.sessionHeader}>
          <View style={styles.sessionIconContainer}>
            <Ionicons
              name={item.source.type === 'phone' ? 'phone-portrait' : 'bluetooth'}
              size={20}
              color={colors.primary[400]}
            />
          </View>
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionSource}>
              {item.source.type === 'phone' ? 'Phone Microphone' : `OMI Device (${item.source.deviceName})`}
            </Text>
            <Text style={styles.sessionTime}>Started: {startTime}</Text>
          </View>
          {hasError && (
            <Ionicons name="alert-circle" size={20} color={colors.error.default} />
          )}
        </View>
        <View style={styles.sessionDetails}>
          <View style={styles.sessionDetailRow}>
            <Text style={styles.sessionDetailLabel}>Duration:</Text>
            <Text style={styles.sessionDetailValue}>{duration}</Text>
          </View>
          {endTime && (
            <View style={styles.sessionDetailRow}>
              <Text style={styles.sessionDetailLabel}>Ended:</Text>
              <Text style={styles.sessionDetailValue}>{endTime}</Text>
            </View>
          )}
          <View style={styles.sessionDetailRow}>
            <Text style={styles.sessionDetailLabel}>Codec:</Text>
            <Text style={styles.sessionDetailValue}>{item.codec.toUpperCase()}</Text>
          </View>
          <View style={styles.sessionDetailRow}>
            <Text style={styles.sessionDetailLabel}>Data:</Text>
            <Text style={styles.sessionDetailValue}>
              {(item.bytesTransferred / 1024).toFixed(1)} KB ({item.chunksTransferred} chunks)
            </Text>
          </View>
          {item.endTime && (
            <View style={styles.sessionDetailRow}>
              <Text style={styles.sessionDetailLabel}>Reason:</Text>
              <Text style={[styles.sessionDetailValue, hasError && { color: colors.error.default }]}>
                {endReasonText}
              </Text>
            </View>
          )}
          {item.destinations && item.destinations.length > 0 && (
            <View style={styles.sessionDetailRow}>
              <Text style={styles.sessionDetailLabel}>Destinations:</Text>
              <Text style={styles.sessionDetailValue}>
                {item.destinations.map(d => d.name).join(', ')}
              </Text>
            </View>
          )}
          {hasError && (
            <View style={styles.sessionErrorContainer}>
              <Text style={styles.sessionErrorText}>{item.error}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name={isSessionsView ? "time-outline" : "document-text-outline"}
        size={48}
        color={theme.textMuted}
      />
      <Text style={styles.emptyStateText}>
        {isSessionsView ? 'No sessions' : 'No log entries'}
      </Text>
      <Text style={styles.emptyStateSubtext}>
        {isSessionsView
          ? 'Streaming sessions will appear here as you use the app'
          : 'Connection events will appear here as they occur'
        }
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

        {/* Tabs */}
        {renderTabs()}

        {/* Count and Actions */}
        <View style={styles.countContainer}>
          <Text style={styles.countText}>
            {isSessionsView
              ? `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`
              : `${filteredEntries.length} ${filteredEntries.length === 1 ? 'entry' : 'entries'}`
            }
          </Text>
          <View style={styles.clearButtonsContainer}>
            {!isSessionsView && activeTab !== 'all' && filteredEntries.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => onClearLogsByType(activeTab as ConnectionType)}
                testID={`clear-${activeTab}-logs-button`}
              >
                <Text style={styles.clearButtonText}>Clear {CONNECTION_TYPE_LABELS[activeTab as ConnectionType]}</Text>
              </TouchableOpacity>
            )}
            {!isSessionsView && entries.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={onClearLogs}
                testID="clear-all-logs-button"
              >
                <Text style={styles.clearButtonText}>Clear All</Text>
              </TouchableOpacity>
            )}
            {isSessionsView && sessions.length > 0 && onClearSessions && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={onClearSessions}
                testID="clear-sessions-button"
              >
                <Text style={styles.clearButtonText}>Clear Sessions</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Content List */}
        {isSessionsView ? (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            renderItem={renderSessionItem}
            ListEmptyComponent={renderEmptyState}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
          />
        ) : (
          <FlatList
            data={filteredEntries}
            keyExtractor={(item) => item.id}
            renderItem={renderLogEntry}
            ListEmptyComponent={renderEmptyState}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
          />
        )}
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
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: theme.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomWidth: 3,
  },
  tabIconContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  tabStatusDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: theme.backgroundCard,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: '500',
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
  clearButtonsContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  // Session styles
  sessionEntry: {
    backgroundColor: theme.backgroundCard,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sessionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[400] + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionSource: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  sessionTime: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
  },
  sessionDetails: {
    gap: spacing.xs,
  },
  sessionDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sessionDetailLabel: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  sessionDetailValue: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    fontWeight: '500',
  },
  sessionErrorContainer: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.error.bgSolid,
    borderRadius: borderRadius.sm,
  },
  sessionErrorText: {
    fontSize: fontSize.sm,
    color: colors.error.light,
  },
});

export default ConnectionLogViewer;
