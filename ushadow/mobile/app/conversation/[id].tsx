/**
 * Conversation Detail Screen - Ushadow Mobile
 *
 * Full-screen detail view for a single conversation, matching the web
 * ConversationDetailPage feature surface: header + source badge, summary,
 * detailed summary, full-audio player, metadata grid, Chronicle memories
 * list, segmented transcript, and native share.
 */

import React, { useMemo, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';
import { useConversationDetail } from '../hooks/useConversationDetail';
import type { ConversationSource } from '../hooks/useConversations';
import { getChronicleAudioUrl } from '../services/chronicleApi';
import { getMyceliaAudioUrl } from '../services/myceliaApi';
import {
  getConversationMemories,
  type ConversationMemory,
} from '../services/memoriesApi';
import ConversationAudioPlayer from '../components/AudioPlayer';

type AnySegment = {
  speaker?: string;
  speaker_label?: string;
  speaker_id?: string;
  start?: number;
  start_time?: number;
  end?: number;
  end_time?: number;
  text?: string;
};

function normalizeSegments(conv: any): Array<{
  speaker: string;
  start: number;
  end: number;
  text: string;
}> {
  const raw: AnySegment[] = conv?.segments || conv?.speaker_segments || [];
  return raw
    .map((s) => ({
      speaker: s.speaker || s.speaker_label || s.speaker_id || 'Unknown',
      start: typeof s.start === 'number' ? s.start : (s.start_time ?? 0),
      end: typeof s.end === 'number' ? s.end : (s.end_time ?? 0),
      text: s.text || '',
    }))
    .filter((s) => s.text);
}

function formatDuration(seconds: number | undefined, conv: any): string {
  if (!seconds) {
    const range = conv?.timeRanges?.[0];
    if (range?.start && range?.end) {
      const ms = new Date(range.end).getTime() - new Date(range.start).getTime();
      seconds = Math.floor(ms / 1000);
    }
  }
  if (!seconds) return 'Unknown';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatDateTime(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ConversationDetailScreen() {
  const params = useLocalSearchParams<{ id: string; source?: string }>();
  const router = useRouter();
  const id = params.id;
  const source = (params.source as ConversationSource) || 'chronicle';

  const { conversation, isLoading, error } = useConversationDetail(id, source);

  const [memories, setMemories] = useState<ConversationMemory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);

  // Fetch memories for Chronicle conversations only (matches web behavior)
  useEffect(() => {
    if (!id || source !== 'chronicle') return;
    let cancelled = false;
    (async () => {
      try {
        setMemoriesLoading(true);
        const response = await getConversationMemories(id, source);
        if (!cancelled) setMemories(response.memories || []);
      } catch (err) {
        console.warn('[ConversationDetail] memories fetch failed:', err);
        if (!cancelled) setMemories([]);
      } finally {
        if (!cancelled) setMemoriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  const segments = useMemo(() => normalizeSegments(conversation), [conversation]);

  const handleShare = useCallback(async () => {
    if (!conversation) return;
    const myceliaConv = conversation as any;
    const title = conversation.title || myceliaConv?.name || 'Conversation';
    const summary = conversation.summary || myceliaConv?.summaries?.[0]?.text || '';
    try {
      await Share.share({
        title,
        message: summary ? `${title}\n\n${summary}` : title,
      });
    } catch (err) {
      console.warn('[ConversationDetail] share failed:', err);
    }
  }, [conversation]);

  // Audio URL provider — Chronicle has its own helper; Mycelia builds
  // a time-range URL from the conversation's timeRanges.
  const audioUrlProvider = useCallback(
    async (convId: string, cropped: boolean) => {
      if (source === 'chronicle') return getChronicleAudioUrl(convId, cropped);
      return getMyceliaAudioUrl(conversation);
    },
    [source, conversation]
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} testID="conversation-detail-loading">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[400]} />
          <Text style={styles.loadingText}>Loading conversation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !conversation) {
    return (
      <SafeAreaView style={styles.container} testID="conversation-detail-error">
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            testID="conversation-detail-back-button"
          >
            <Ionicons name="arrow-back" size={20} color={theme.textPrimary} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={32} color={colors.error.default} />
          <Text style={styles.errorTitle}>Failed to load conversation</Text>
          <Text style={styles.errorSubtitle}>{error || 'Conversation not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const myceliaConv = conversation as any;
  const title = conversation.title || myceliaConv?.name || 'Untitled Conversation';
  const summary =
    conversation.summary ||
    (myceliaConv?.summaries && myceliaConv.summaries.length > 0
      ? myceliaConv.summaries[0].text
      : null);
  const detailedSummary = conversation.detailed_summary || myceliaConv?.details;
  const startTime =
    myceliaConv?.started_at ||
    myceliaConv?.timeRanges?.[0]?.start ||
    conversation.created_at;
  const endTime = myceliaConv?.completed_at || myceliaConv?.timeRanges?.[0]?.end;
  const sourceLabel = source === 'chronicle' ? 'Chronicle' : 'Mycelia';
  const sourceBadgeColor = source === 'chronicle' ? colors.primary[400] : colors.accent[400];

  const showAudioPlayer =
    (source === 'chronicle' && (conversation.audio_path || conversation.cropped_audio_path) && conversation.conversation_id) ||
    (source === 'mycelia' && myceliaConv?.timeRanges?.[0]?.start && myceliaConv?.timeRanges?.[0]?.end);

  return (
    <SafeAreaView style={styles.container} testID="conversation-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          testID="conversation-detail-back-button"
        >
          <Ionicons name="arrow-back" size={20} color={theme.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={[styles.sourceBadge, { backgroundColor: sourceBadgeColor }]} testID="conversation-source-badge">
          <Text style={styles.sourceBadgeText}>{sourceLabel}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} testID="conversation-detail-scroll">
        {/* Title + summaries */}
        <View style={styles.card} testID="conversation-metadata">
          <Text style={styles.title}>{title}</Text>
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
          {detailedSummary && detailedSummary !== summary ? (
            <Text style={styles.detailedSummary}>{detailedSummary}</Text>
          ) : null}

          {/* Actions row: audio (rendered below) + share */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={handleShare}
              style={styles.shareButton}
              testID="share-conversation-button"
            >
              <Ionicons name="share-outline" size={18} color={colors.success.default} />
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
          </View>

          {/* Full audio player */}
          {showAudioPlayer && conversation.conversation_id ? (
            <ConversationAudioPlayer
              conversationId={conversation.conversation_id}
              cropped={true}
              getAudioUrl={audioUrlProvider}
            />
          ) : null}

          {/* Metadata grid */}
          <View style={styles.metadataGrid}>
            {startTime ? (
              <View style={styles.metadataItem}>
                <Text style={styles.metadataLabel}>
                  {source === 'mycelia' ? 'Started' : 'Created'}
                </Text>
                <Text style={styles.metadataValue}>{formatDateTime(startTime)}</Text>
              </View>
            ) : null}
            {endTime ? (
              <View style={styles.metadataItem}>
                <Text style={styles.metadataLabel}>
                  {source === 'mycelia' ? 'Ended' : 'Completed'}
                </Text>
                <Text style={styles.metadataValue}>{formatDateTime(endTime)}</Text>
              </View>
            ) : null}
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Duration</Text>
              <Text style={styles.metadataValue}>
                {formatDuration(conversation.duration_seconds, conversation)}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Segments</Text>
              <Text style={styles.metadataValue}>{segments.length}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Memories</Text>
              <Text style={styles.metadataValue}>{conversation.memory_count ?? 0}</Text>
            </View>
          </View>
        </View>

        {/* Memories (Chronicle only) */}
        {source === 'chronicle' ? (
          <View style={styles.card} testID="conversation-memories">
            <View style={styles.sectionHeader}>
              <Ionicons name="library-outline" size={18} color={colors.accent[400]} />
              <Text style={styles.sectionTitle}>Memories</Text>
              {memories.length > 0 ? (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{memories.length}</Text>
                </View>
              ) : null}
            </View>

            {memoriesLoading ? (
              <ActivityIndicator size="small" color={colors.accent[400]} style={styles.inlineSpinner} />
            ) : memories.length > 0 ? (
              memories.map((memory, idx) => (
                <TouchableOpacity
                  key={memory.id || idx}
                  style={styles.memoryItem}
                  onPress={() => router.push(`/(tabs)/memories?id=${memory.id}`)}
                  testID={`memory-item-${idx}`}
                >
                  <Text style={styles.memoryText} numberOfLines={3}>
                    {memory.content}
                  </Text>
                  {memory.source ? (
                    <Text style={styles.memorySource}>{memory.source}</Text>
                  ) : null}
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyText}>No memories extracted from this conversation</Text>
            )}
          </View>
        ) : null}

        {/* Transcript */}
        <View style={styles.card} testID="conversation-transcript">
          <View style={styles.sectionHeader}>
            <Ionicons name="chatbubbles-outline" size={18} color={colors.primary[400]} />
            <Text style={styles.sectionTitle}>Transcript</Text>
          </View>

          {segments.length > 0 ? (
            segments.map((segment, idx) => (
              <View key={idx} style={styles.segment} testID={`transcript-segment-${idx}`}>
                <View style={styles.segmentHeader}>
                  <View style={styles.speakerBadge}>
                    <Text style={styles.speakerInitial}>
                      {segment.speaker.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.segmentMeta}>
                    <Text style={styles.speakerName}>{segment.speaker}</Text>
                    <Text style={styles.segmentTime}>
                      {Math.floor(segment.start)}s – {Math.floor(segment.end)}s
                    </Text>
                  </View>
                </View>
                <Text style={styles.segmentText}>{segment.text}</Text>
              </View>
            ))
          ) : conversation.transcript ? (
            <Text style={styles.plainTranscript}>
              {typeof conversation.transcript === 'string'
                ? conversation.transcript
                : (conversation.transcript as any)?.text || ''}
            </Text>
          ) : (
            <Text style={styles.emptyText}>No transcript available</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
  },
  backText: {
    fontSize: fontSize.base,
    color: theme.textPrimary,
    marginLeft: spacing.xs,
  },
  sourceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  sourceBadgeText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  card: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  summary: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  detailedSummary: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    fontStyle: 'italic',
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  shareButtonText: {
    color: colors.success.default,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: spacing.md,
  },
  metadataItem: {
    minWidth: '40%',
    flex: 1,
  },
  metadataLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginBottom: 2,
  },
  metadataValue: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  countBadge: {
    backgroundColor: 'rgba(192, 132, 252, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  countBadgeText: {
    color: colors.accent[400],
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  memoryItem: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  memoryText: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    lineHeight: 20,
  },
  memorySource: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },
  segment: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  segmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  speakerBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary[400],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  speakerInitial: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  segmentMeta: {
    flex: 1,
  },
  speakerName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  segmentTime: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  segmentText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  plainTranscript: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    lineHeight: 22,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  inlineSpinner: {
    paddingVertical: spacing.md,
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
  errorBox: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.error.bg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.error.default,
    marginTop: spacing.sm,
  },
  errorSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
