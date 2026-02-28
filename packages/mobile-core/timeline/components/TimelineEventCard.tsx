/**
 * TimelineEventCard — Renders a single activity in the timeline.
 *
 * Shows activity name, category icon, duration, sentiment, and notes.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../core/theme/ThemeProvider';
import type { TimelineEvent } from '../types/timeline';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../types/timeline';

interface TimelineEventCardProps {
  event: TimelineEvent;
  isFirst?: boolean;
  isLast?: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const SENTIMENT_INDICATORS: Record<string, string> = {
  positive: '\u{1F60A}',
  neutral: '',
  negative: '\u{1F615}',
  frustrated: '\u{1F624}',
};

export function TimelineEventCard({ event, isFirst, isLast }: TimelineEventCardProps) {
  const theme = useTheme();
  const categoryColor = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.other;
  const categoryIcon = CATEGORY_ICONS[event.category] || CATEGORY_ICONS.other;
  const sentimentIcon = event.sentiment ? SENTIMENT_INDICATORS[event.sentiment] : '';

  return (
    <View style={styles.container}>
      {/* Timeline rail */}
      <View style={styles.rail}>
        {!isFirst && (
          <View style={[styles.railLine, { backgroundColor: theme.colors.border }]} />
        )}
        <View style={[styles.railDot, { backgroundColor: categoryColor }]} />
        {!isLast && (
          <View style={[styles.railLineBottom, { backgroundColor: theme.colors.border }]} />
        )}
      </View>

      {/* Content */}
      <View style={[styles.card, { backgroundColor: theme.colors.backgroundCard, borderColor: theme.colors.border }]}>
        <View style={styles.header}>
          <Text style={styles.categoryIcon}>{categoryIcon}</Text>
          <Text style={[styles.activity, { color: theme.colors.text }]} numberOfLines={1}>
            {event.activity}
          </Text>
          {sentimentIcon ? <Text style={styles.sentiment}>{sentimentIcon}</Text> : null}
        </View>

        <View style={styles.meta}>
          <Text style={[styles.time, { color: theme.colors.textMuted }]}>
            {formatTime(event.started_at)} — {formatTime(event.ended_at)}
          </Text>
          <View style={[styles.durationBadge, { backgroundColor: categoryColor + '30' }]}>
            <Text style={[styles.durationText, { color: categoryColor }]}>
              {formatDuration(event.duration_seconds)}
            </Text>
          </View>
        </View>

        {event.notes && (
          <Text style={[styles.notes, { color: theme.colors.textSecondary }]} numberOfLines={2}>
            {event.notes}
          </Text>
        )}

        {!event.is_productive && (
          <View style={[styles.tag, { backgroundColor: theme.colors.warning + '20' }]}>
            <Text style={[styles.tagText, { color: theme.colors.warning }]}>
              Not goal-contributing
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    minHeight: 72,
  },
  rail: {
    width: 32,
    alignItems: 'center',
  },
  railLine: {
    width: 2,
    flex: 1,
  },
  railLineBottom: {
    width: 2,
    flex: 1,
  },
  railDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    marginLeft: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryIcon: {
    fontSize: 16,
  },
  activity: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  sentiment: {
    fontSize: 14,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  time: {
    fontSize: 12,
  },
  durationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  durationText: {
    fontSize: 12,
    fontWeight: '600',
  },
  notes: {
    fontSize: 13,
    marginTop: 6,
    fontStyle: 'italic',
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
