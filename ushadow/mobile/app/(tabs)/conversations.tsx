/**
 * Conversations Tab - Ushadow Mobile
 *
 * Displays user's conversations from the Chronicle backend.
 * Shows transcripts, speaker segments, and conversation metadata.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';
import { fetchConversations, Conversation, getChronicleAudioUrl } from '../services/chronicleApi';
import { isAuthenticated } from '../utils/authStorage';
import ConversationAudioPlayer from '../components/AudioPlayer';

export default function ConversationsScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetailedSummary, setExpandedDetailedSummary] = useState<Set<string>>(new Set());

  const loadConversations = useCallback(async (showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) {
        setIsRefreshing(true);
      }
      setError(null);

      const loggedIn = await isAuthenticated();
      setIsLoggedIn(loggedIn);

      if (!loggedIn) {
        setConversations([]);
        return;
      }

      const response = await fetchConversations(1, 50);
      console.log(`[Conversations] Raw response:`, JSON.stringify(response, null, 2));
      console.log(`[Conversations] First conversation:`, JSON.stringify(response.conversations[0], null, 2));
      setConversations(response.conversations);
      console.log(`[Conversations] Loaded ${response.conversations.length} conversations`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load conversations';
      setError(message);
      console.error('[Conversations] Error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Refresh when screen regains focus (e.g., after scanning QR code)
  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  const handleRefresh = useCallback(() => {
    loadConversations(true);
  }, [loadConversations]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleDetailedSummary = (id: string) => {
    setExpandedDetailedSummary(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return colors.success.default;
      case 'processing':
        return colors.warning.default;
      case 'closed':
        return theme.textMuted;
      default:
        return theme.textMuted;
    }
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const itemId = item.id || item.conversation_id;
    const isExpanded = expandedId === itemId;
    const isDetailedExpanded = expandedDetailedSummary.has(itemId);

    // Use title as main heading, summary as preview
    const title = item.title || 'Untitled Conversation';
    const summary = item.summary || 'No summary available';

    // Determine status from has_memory or default
    const hasContent = item.has_memory || (item.memory_count && item.memory_count > 0);

    return (
      <TouchableOpacity
        style={styles.conversationCard}
        onPress={() => toggleExpand(itemId)}
        activeOpacity={0.7}
        testID={`conversation-${itemId}`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.statusDot, { backgroundColor: hasContent ? colors.success.default : colors.primary[400] }]} />
            <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
          </View>
          <View style={styles.cardHeaderRight}>
            {item.segment_count !== undefined && (
              <Text style={styles.duration}>{item.segment_count} segments</Text>
            )}
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.textMuted}
            />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.conversationTitle} numberOfLines={isExpanded ? undefined : 1}>
          {title}
        </Text>

        {/* Summary - always visible, more lines when collapsed */}
        <Text
          style={styles.transcriptPreview}
          numberOfLines={isExpanded ? undefined : 4}
        >
          {summary}
        </Text>

        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Audio Player */}
            {(item.audio_path || item.cropped_audio_path) && item.conversation_id && (
              <ConversationAudioPlayer
                conversationId={item.conversation_id}
                cropped={true}
                getAudioUrl={getChronicleAudioUrl}
              />
            )}

            {/* Detailed summary with its own toggle */}
            {item.detailed_summary && (
              <View style={styles.detailedSummarySection}>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    toggleDetailedSummary(itemId);
                  }}
                  style={styles.sectionHeader}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sectionLabel}>Detailed Summary</Text>
                  <Ionicons
                    name={isDetailedExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={theme.textMuted}
                  />
                </TouchableOpacity>
                {isDetailedExpanded && (
                  <Text style={styles.fullTranscript}>
                    {item.detailed_summary}
                  </Text>
                )}
              </View>
            )}

            <View style={styles.metadataSection}>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Client:</Text>
                <Text style={styles.metadataValue}>{item.client_id}</Text>
              </View>
              {item.segment_count !== undefined && (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Segments:</Text>
                  <Text style={styles.metadataValue}>{item.segment_count}</Text>
                </View>
              )}
              {item.memory_count !== undefined && (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Memories:</Text>
                  <Text style={styles.metadataValue}>{item.memory_count}</Text>
                </View>
              )}
              {item.transcript_version_count !== undefined && (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Transcript Versions:</Text>
                  <Text style={styles.metadataValue}>{item.transcript_version_count}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      {!isLoggedIn ? (
        <>
          <Ionicons name="log-in-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Not Logged In</Text>
          <Text style={styles.emptySubtitle}>
            Log in from the Home tab to view your conversations
          </Text>
        </>
      ) : (
        <>
          <Ionicons name="chatbubbles-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>No Conversations Yet</Text>
          <Text style={styles.emptySubtitle}>
            Start streaming audio to create conversations
          </Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} testID="conversations-screen">
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        <Text style={styles.headerSubtitle}>
          {conversations.length > 0
            ? `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`
            : 'Your audio transcripts'}
        </Text>
      </View>

      {/* Error Message */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={colors.error.default} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[400]} />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item, index) => item.id || item.conversation_id || `conv-${index}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary[400]}
              colors={[colors.primary[400]]}
            />
          }
          testID="conversations-list"
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: theme.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.bg,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error.default,
    fontSize: fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: theme.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  conversationCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  cardDate: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  duration: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  conversationTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  transcriptPreview: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  expandedContent: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: spacing.md,
  },
  detailedSummarySection: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginHorizontal: -spacing.xs,
    borderRadius: borderRadius.sm,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fullTranscript: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    lineHeight: 22,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  metadataSection: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  metadataLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  metadataValue: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    fontFamily: 'monospace',
  },
  speakersSection: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  speakersTitle: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  speakerSegment: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  speakerLabel: {
    fontSize: fontSize.xs,
    color: colors.accent[400],
    fontWeight: '600',
    marginRight: spacing.sm,
    minWidth: 60,
  },
  speakerText: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['3xl'] * 2,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
