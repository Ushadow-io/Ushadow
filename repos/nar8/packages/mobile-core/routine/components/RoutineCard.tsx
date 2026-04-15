/**
 * RoutineCard — List item for a routine with quick-record action.
 *
 * Shows routine name, goal, tags, and session count.
 * Tap to navigate to detail; long-press or button to start recording.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../core/theme/ThemeProvider';
import type { Routine } from '../types/routine';

interface RoutineCardProps {
  routine: Routine;
  sessionCount?: number;
  onPress?: (routine: Routine) => void;
  onRecord?: (routine: Routine) => void;
}

const GOAL_TYPE_LABELS: Record<string, string> = {
  time: '\u{23F0}',      // alarm clock
  location: '\u{1F4CD}', // pin
  activity: '\u{2705}',  // checkmark
};

export function RoutineCard({ routine, sessionCount, onPress, onRecord }: RoutineCardProps) {
  const theme = useTheme();
  const goalIcon = GOAL_TYPE_LABELS[routine.goal_type] || GOAL_TYPE_LABELS.activity;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.backgroundCard, borderColor: theme.colors.border }]}
      onPress={() => onPress?.(routine)}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {routine.name}
          </Text>
          {routine.goal_time && (
            <Text style={[styles.goalTime, { color: theme.colors.primary[400] }]}>
              {routine.goal_time}
            </Text>
          )}
        </View>

        <View style={styles.goalRow}>
          <Text style={styles.goalIcon}>{goalIcon}</Text>
          <Text style={[styles.goal, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {routine.goal}
          </Text>
        </View>

        <View style={styles.footer}>
          {routine.tags.length > 0 && (
            <View style={styles.tags}>
              {routine.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: theme.colors.primary[400] + '20' }]}>
                  <Text style={[styles.tagText, { color: theme.colors.primary[400] }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
          {sessionCount !== undefined && (
            <Text style={[styles.sessionCount, { color: theme.colors.textMuted }]}>
              {sessionCount} session{sessionCount !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </View>

      {onRecord && (
        <TouchableOpacity
          style={[styles.recordButton, { backgroundColor: theme.colors.primary[400] }]}
          onPress={() => onRecord(routine)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.recordIcon}>{'\u{23FA}'}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  goalTime: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  goalIcon: {
    fontSize: 14,
  },
  goal: {
    fontSize: 13,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  sessionCount: {
    fontSize: 12,
  },
  recordButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  recordIcon: {
    fontSize: 18,
    color: '#ffffff',
  },
});
