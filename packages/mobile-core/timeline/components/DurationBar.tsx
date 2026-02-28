/**
 * DurationBar — Horizontal bar showing relative duration of activities.
 *
 * Each activity segment is proportionally sized and colour-coded by category.
 * Useful for at-a-glance routine composition view.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../core/theme/ThemeProvider';
import type { TimelineEvent } from '../types/timeline';
import { CATEGORY_COLORS } from '../types/timeline';

interface DurationBarProps {
  events: TimelineEvent[];
  height?: number;
  showLabels?: boolean;
}

export function DurationBar({ events, height = 24, showLabels = true }: DurationBarProps) {
  const theme = useTheme();
  const totalDuration = events.reduce((sum, e) => sum + e.duration_seconds, 0);

  if (totalDuration === 0 || events.length === 0) {
    return (
      <View style={[styles.bar, { height, backgroundColor: theme.colors.border }]}>
        <Text style={[styles.emptyLabel, { color: theme.colors.textMuted }]}>No data</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.bar, { height, backgroundColor: theme.colors.border }]}>
        {events.map((event) => {
          const widthPct = (event.duration_seconds / totalDuration) * 100;
          if (widthPct < 1) return null; // skip tiny segments
          const color = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.other;
          return (
            <View
              key={event.event_id}
              style={[styles.segment, { width: `${widthPct}%`, backgroundColor: color }]}
            />
          );
        })}
      </View>
      {showLabels && (
        <View style={styles.labels}>
          {events
            .filter((e) => (e.duration_seconds / totalDuration) * 100 >= 8) // only label segments >= 8%
            .map((event) => {
              const mins = Math.round(event.duration_seconds / 60);
              return (
                <Text
                  key={event.event_id}
                  style={[styles.label, { color: theme.colors.textMuted }]}
                  numberOfLines={1}
                >
                  {event.activity} ({mins}m)
                </Text>
              );
            })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
  },
  segment: {
    height: '100%',
  },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  label: {
    fontSize: 11,
  },
  emptyLabel: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 24,
    width: '100%',
  },
});
