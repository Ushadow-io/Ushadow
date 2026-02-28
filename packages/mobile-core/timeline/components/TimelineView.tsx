/**
 * TimelineView — Renders a full session timeline as a vertical list.
 *
 * Shows all events in chronological order with a connecting rail,
 * plus a summary header with total duration and event count.
 */

import React from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../../core/theme/ThemeProvider';
import type { TimelineEvent } from '../types/timeline';
import { TimelineEventCard } from './TimelineEventCard';

interface TimelineViewProps {
  events: TimelineEvent[];
  isLoading?: boolean;
  emptyMessage?: string;
}

function computeSummary(events: TimelineEvent[]) {
  if (events.length === 0) return null;

  const totalSeconds = events.reduce((sum, e) => sum + e.duration_seconds, 0);
  const productiveSeconds = events
    .filter((e) => e.is_productive)
    .reduce((sum, e) => sum + e.duration_seconds, 0);
  const productivePct = totalSeconds > 0 ? Math.round((productiveSeconds / totalSeconds) * 100) : 0;

  const totalMinutes = Math.round(totalSeconds / 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  return {
    totalDuration: durationStr,
    eventCount: events.length,
    productivePct,
  };
}

export function TimelineView({
  events,
  isLoading = false,
  emptyMessage = 'No timeline events yet.',
}: TimelineViewProps) {
  const theme = useTheme();
  const summary = computeSummary(events);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary[400]} />
        <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>
          Extracting timeline...
        </Text>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
          {emptyMessage}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary header */}
      {summary && (
        <View style={[styles.summaryRow, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {summary.totalDuration}
            </Text>
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
              Total
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {summary.eventCount}
            </Text>
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
              Activities
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {summary.productivePct}%
            </Text>
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
              Productive
            </Text>
          </View>
        </View>
      )}

      {/* Event list */}
      <FlatList
        data={events}
        keyExtractor={(item) => item.event_id}
        renderItem={({ item, index }) => (
          <TimelineEventCard
            event={item}
            isFirst={index === 0}
            isLast={index === events.length - 1}
          />
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyText: {
    fontSize: 15,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
});
