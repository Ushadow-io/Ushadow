/**
 * Sessions Tab - Ushadow Mobile
 *
 * Displays streaming session history with:
 * - Duration, data volume, source/destination
 * - Active session indicator
 * - Link to Chronicle conversations
 * - Session filtering and search
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  StreamingSession,
  formatDuration,
  formatBytes,
  isSessionActive,
} from '../types/streamingSession';
import { useSessionTracking } from '../hooks/useSessionTracking';
import { colors, theme, gradients, spacing, borderRadius, fontSize } from '../theme';

export default function SessionsScreen() {
  const { sessions, activeSession, deleteSession, clearAllSessions, isLoading } = useSessionTracking();
  const [filter, setFilter] = useState<'all' | 'active' | 'failed'>('all');

  const filteredSessions = sessions.filter(session => {
    if (filter === 'active') return isSessionActive(session);
    if (filter === 'failed') return session.error;
    return true;
  });

  const handleDeleteSession = (sessionId: string) => {
    Alert.alert(
      'Delete Session',
      'Remove this session from history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSession(sessionId),
        },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Sessions',
      'This will remove all session history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: clearAllSessions,
        },
      ]
    );
  };

  const renderSession = ({ item: session }: { item: StreamingSession }) => {
    const isActive = isSessionActive(session);
    const duration = session.durationSeconds ?? 0;
    const sourceLabel = session.source.type === 'omi'
      ? `OMI: ${session.source.deviceName || session.source.deviceId.slice(0, 8)}`
      : 'Phone Mic';

    return (
      <View style={styles.sessionCard} testID={`session-${session.id}`}>
        {/* Header */}
        <View style={styles.sessionHeader}>
          <View style={styles.sessionHeaderLeft}>
            <Ionicons
              name={session.source.type === 'omi' ? 'bluetooth' : 'mic'}
              size={20}
              color={isActive ? colors.primary[400] : theme.textSecondary}
            />
            <Text style={styles.sessionSource}>{sourceLabel}</Text>
            {isActive && (
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={() => handleDeleteSession(session.id)}
            style={styles.deleteButton}
            testID={`delete-session-${session.id}`}
          >
            <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Metrics */}
        <View style={styles.sessionMetrics}>
          <View style={styles.metric}>
            <Ionicons name="time-outline" size={16} color={theme.textMuted} />
            <Text style={styles.metricText}>{formatDuration(duration)}</Text>
          </View>
          <View style={styles.metric}>
            <Ionicons name="download-outline" size={16} color={theme.textMuted} />
            <Text style={styles.metricText}>{formatBytes(session.bytesTransferred)}</Text>
          </View>
          <View style={styles.metric}>
            <Ionicons name="cube-outline" size={16} color={theme.textMuted} />
            <Text style={styles.metricText}>{session.chunksTransferred} chunks</Text>
          </View>
        </View>

        {/* Destinations */}
        {session.destinations.length > 0 && (
          <View style={styles.destinations}>
            {session.destinations.map((dest, idx) => (
              <View
                key={idx}
                style={[
                  styles.destinationChip,
                  !dest.connected && styles.destinationChipDisconnected,
                ]}
              >
                <Text
                  style={[
                    styles.destinationText,
                    !dest.connected && styles.destinationTextDisconnected,
                  ]}
                >
                  {dest.name}
                </Text>
                {!dest.connected && (
                  <Ionicons name="close-circle" size={12} color={colors.error.default} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Error */}
        {session.error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color={colors.error.default} />
            <Text style={styles.errorText}>{session.error}</Text>
          </View>
        )}

        {/* Timestamp */}
        <Text style={styles.sessionTime}>
          {new Date(session.startTime).toLocaleString()}
        </Text>

        {/* Conversation Link */}
        {session.conversationId && (
          <View style={styles.conversationLink}>
            <Ionicons name="link" size={14} color={colors.primary[400]} />
            <Text style={styles.conversationLinkText}>
              Conversation: {session.conversationId.slice(0, 8)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} testID="sessions-screen">
      {/* Header */}
      <View style={styles.header}>
        <LinearGradient
          colors={gradients.brand as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.titleGradientContainer}
        >
          <Text style={styles.title}>Streaming Sessions</Text>
        </LinearGradient>
        <Text style={styles.subtitle}>Track your audio streaming history</Text>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
          onPress={() => setFilter('all')}
          testID="filter-all"
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All ({sessions.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'active' && styles.filterChipActive]}
          onPress={() => setFilter('active')}
          testID="filter-active"
        >
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>
            Active ({activeSession ? 1 : 0})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'failed' && styles.filterChipActive]}
          onPress={() => setFilter('failed')}
          testID="filter-failed"
        >
          <Text style={[styles.filterText, filter === 'failed' && styles.filterTextActive]}>
            Failed ({sessions.filter(s => s.error).length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Clear All Button */}
      {sessions.length > 0 && (
        <TouchableOpacity
          style={styles.clearAllButton}
          onPress={handleClearAll}
          testID="clear-all-sessions"
        >
          <Text style={styles.clearAllButtonText}>Clear All History</Text>
        </TouchableOpacity>
      )}

      {/* Session List */}
      {filteredSessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="pulse-outline" size={64} color={theme.textMuted} />
          <Text style={styles.emptyStateText}>
            {filter === 'all'
              ? 'No sessions yet'
              : filter === 'active'
              ? 'No active sessions'
              : 'No failed sessions'}
          </Text>
          <Text style={styles.emptyStateSubtext}>
            Start streaming to track session data
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSessions}
          renderItem={renderSession}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          testID="sessions-list"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  titleGradientContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: theme.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    textAlign: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: theme.backgroundCard,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary[400],
    borderColor: colors.primary[400],
  },
  filterText: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
  },
  filterTextActive: {
    color: theme.text,
    fontWeight: '600',
  },
  clearAllButton: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  clearAllButtonText: {
    fontSize: fontSize.sm,
    color: colors.error.default,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sessionCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sessionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  sessionSource: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.text,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success.default,
  },
  activeBadgeText: {
    fontSize: fontSize.xs,
    color: colors.success.default,
    fontWeight: '600',
  },
  deleteButton: {
    padding: spacing.xs,
  },
  sessionMetrics: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  destinations: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  destinationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[900],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  destinationChipDisconnected: {
    backgroundColor: colors.error.bg,
  },
  destinationText: {
    fontSize: fontSize.xs,
    color: colors.primary[400],
    fontWeight: '500',
  },
  destinationTextDisconnected: {
    color: colors.error.default,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.error.bg,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error.default,
    flex: 1,
  },
  sessionTime: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },
  conversationLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  conversationLinkText: {
    fontSize: fontSize.xs,
    color: colors.primary[400],
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
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
