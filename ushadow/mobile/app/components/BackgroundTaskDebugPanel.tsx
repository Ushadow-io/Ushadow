/**
 * Background Task Debug Panel
 *
 * Shows diagnostic information about background task execution.
 * Useful for debugging and verifying background task is working.
 *
 * Usage:
 * ```tsx
 * import { BackgroundTaskDebugPanel } from './components/BackgroundTaskDebugPanel';
 *
 * // In your component:
 * <BackgroundTaskDebugPanel />
 * ```
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getBackgroundTaskStatus,
  getStoredConnectionState,
  clearBackgroundTaskData,
} from '../services/backgroundTasks';
import {
  getPersistentLogs,
  clearPersistentLogs,
  PersistentLogEntry,
} from '../services/persistentLogger';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';

export const BackgroundTaskDebugPanel: React.FC<{ testID?: string }> = ({ testID }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState<{
    isRegistered: boolean;
    lastCheck: string | null;
    checkCount: number;
    lastError: string | null;
  } | null>(null);
  const [connectionState, setConnectionState] = useState<{
    isConnected: boolean;
    isStreaming: boolean;
    deviceId?: string;
    timestamp?: string;
  } | null>(null);
  const [persistentLogs, setPersistentLogs] = useState<PersistentLogEntry[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refreshStatus = async () => {
    const taskStatus = await getBackgroundTaskStatus();
    const connState = await getStoredConnectionState();
    const logs = await getPersistentLogs();
    setStatus(taskStatus);
    setConnectionState(connState);
    setPersistentLogs(logs);
    setLastRefresh(new Date());
  };

  useEffect(() => {
    if (isExpanded) {
      refreshStatus();
    }
  }, [isExpanded]);

  const handleClearData = async () => {
    await clearBackgroundTaskData();
    await clearPersistentLogs();
    await refreshStatus();
  };

  const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return 'Never';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  if (!isExpanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedContainer}
        onPress={() => setIsExpanded(true)}
        testID={testID}
      >
        <Ionicons name="bug-outline" size={16} color={theme.textMuted} />
        <Text style={styles.collapsedText}>Background Task Debug</Text>
        <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container} testID={testID}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="bug-outline" size={20} color={colors.primary[400]} />
          <Text style={styles.title}>Background Task Debug</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={refreshStatus}
            testID={`${testID}-refresh`}
          >
            <Ionicons name="refresh" size={18} color={colors.primary[400]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setIsExpanded(false)}
            testID={`${testID}-collapse`}
          >
            <Ionicons name="chevron-up" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Task Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Task Status</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Registered:</Text>
            <View style={styles.valueRow}>
              <Ionicons
                name={status?.isRegistered ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={status?.isRegistered ? colors.success.default : colors.error.default}
              />
              <Text style={[styles.value, status?.isRegistered && styles.valueSuccess]}>
                {status?.isRegistered ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Last Check:</Text>
            <Text style={styles.value}>
              {formatTimestamp(status?.lastCheck || null)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Check Count:</Text>
            <Text style={styles.value}>{status?.checkCount || 0}</Text>
          </View>
          {status?.lastError && (
            <View style={styles.row}>
              <Text style={styles.label}>Last Error:</Text>
              <Text style={[styles.value, styles.valueError]} numberOfLines={2}>
                {status.lastError}
              </Text>
            </View>
          )}
        </View>

        {/* Connection State */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection State</Text>
          {connectionState ? (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Connected:</Text>
                <View style={styles.valueRow}>
                  <Ionicons
                    name={connectionState.isConnected ? 'bluetooth' : 'bluetooth-outline'}
                    size={16}
                    color={connectionState.isConnected ? colors.success.default : theme.textMuted}
                  />
                  <Text style={styles.value}>
                    {connectionState.isConnected ? 'Yes' : 'No'}
                  </Text>
                </View>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Streaming:</Text>
                <View style={styles.valueRow}>
                  <Ionicons
                    name={connectionState.isStreaming ? 'radio' : 'radio-outline'}
                    size={16}
                    color={connectionState.isStreaming ? colors.success.default : theme.textMuted}
                  />
                  <Text style={styles.value}>
                    {connectionState.isStreaming ? 'Yes' : 'No'}
                  </Text>
                </View>
              </View>
              {connectionState.deviceId && (
                <View style={styles.row}>
                  <Text style={styles.label}>Device:</Text>
                  <Text style={styles.value} numberOfLines={1}>
                    {connectionState.deviceId.substring(0, 20)}...
                  </Text>
                </View>
              )}
              <View style={styles.row}>
                <Text style={styles.label}>Updated:</Text>
                <Text style={styles.value}>
                  {formatTimestamp(connectionState.timestamp || null)}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.noData}>No connection state</Text>
          )}
        </View>

        {/* Persistent Logs (survives reload) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Events (Survives Reload)</Text>
          {persistentLogs.length > 0 ? (
            <View style={styles.logsContainer}>
              {persistentLogs.slice(0, 5).map((log, index) => (
                <View key={index} style={styles.logEntry}>
                  <View style={styles.logHeader}>
                    <Text style={styles.logType}>{log.type}</Text>
                    <Text style={styles.logTime}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                  <Text style={styles.logMessage}>{log.message}</Text>
                </View>
              ))}
              {persistentLogs.length > 5 && (
                <Text style={styles.moreLogsText}>
                  ...and {persistentLogs.length - 5} more events
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.noData}>No events yet</Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleClearData}
            testID={`${testID}-clear-data`}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error.default} />
            <Text style={styles.actionButtonText}>Clear Debug Data</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary[400]} />
          <Text style={styles.infoText}>
            Background tasks run every ~15 min on iOS, more frequently on Android.
            Last refreshed: {lastRefresh.toLocaleTimeString()}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  collapsedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  collapsedText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: theme.textMuted,
  },
  container: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: theme.backgroundInput,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  iconButton: {
    padding: spacing.xs,
  },
  content: {
    padding: spacing.md,
    maxHeight: 400,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
  },
  value: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  valueSuccess: {
    color: colors.success.default,
  },
  valueError: {
    color: colors.error.default,
  },
  noData: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error.default,
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.error.default,
  },
  logsContainer: {
    gap: spacing.sm,
  },
  logEntry: {
    backgroundColor: theme.backgroundInput,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary[400],
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  logType: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary[400],
    textTransform: 'uppercase',
  },
  logTime: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  logMessage: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
  },
  moreLogsText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  infoBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.primary[700],
    lineHeight: 16,
  },
});

export default BackgroundTaskDebugPanel;
