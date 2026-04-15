/**
 * nar8 Active Tab
 *
 * Live recording screen — shows waveform, elapsed time, and schedule bar.
 * Only meaningful during an active routine recording session.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';

export default function ActiveTab() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRecording) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      Alert.alert(
        'End Recording',
        'Stop recording this routine session?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'End',
            style: 'destructive',
            onPress: () => {
              setIsRecording(false);
              setElapsedSeconds(0);
              // TODO: End routine session, navigate to feedback
            },
          },
        ]
      );
    } else {
      setIsRecording(true);
      setElapsedSeconds(0);
    }
  };

  if (!isRecording) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.idleState}>
          <View style={styles.idleIconContainer}>
            <Ionicons name="mic-outline" size={64} color={colors.primary[400]} style={{ opacity: 0.4 }} />
          </View>
          <Text style={styles.idleTitle}>No active recording</Text>
          <Text style={styles.idleSubtext}>
            Start recording from the Routines tab by tapping the mic button on a routine card
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.recordingHeader}>
        <View style={styles.recordingIndicator}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingLabel}>Recording</Text>
        </View>
      </View>

      {/* Elapsed time */}
      <View style={styles.timerContainer}>
        <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
        <Text style={styles.timerLabel}>Elapsed</Text>
      </View>

      {/* Waveform placeholder */}
      <View style={styles.waveformContainer}>
        <View style={styles.waveformPlaceholder}>
          {Array.from({ length: 40 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.waveformBar,
                {
                  height: 8 + Math.random() * 40,
                  backgroundColor: colors.primary[400],
                  opacity: 0.3 + Math.random() * 0.7,
                },
              ]}
            />
          ))}
        </View>
        <Text style={styles.waveformLabel}>Live audio waveform</Text>
      </View>

      {/* Schedule bar placeholder */}
      <View style={styles.scheduleContainer}>
        <Text style={styles.scheduleTitle}>Schedule</Text>
        <View style={styles.scheduleBar}>
          <View
            style={[
              styles.scheduleProgress,
              { width: `${Math.min((elapsedSeconds / 1800) * 100, 100)}%` },
            ]}
          />
        </View>
        <View style={styles.scheduleLabels}>
          <Text style={styles.scheduleLabel}>Start</Text>
          <Text style={styles.scheduleLabel}>Goal: 30m</Text>
        </View>
      </View>

      {/* Stop button */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.stopBtn} onPress={handleToggleRecording}>
          <Ionicons name="stop" size={32} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.stopLabel}>End Recording</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },

  // Idle state
  idleState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing['2xl'] },
  idleIconContainer: { marginBottom: spacing.lg },
  idleTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text.secondary },
  idleSubtext: {
    fontSize: fontSize.sm,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },

  // Recording header
  recordingHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  recordingIndicator: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error.default,
  },
  recordingLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.error.default },

  // Timer
  timerContainer: { alignItems: 'center', paddingVertical: spacing['2xl'] },
  timerText: {
    fontSize: 64,
    fontWeight: '200',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  timerLabel: { fontSize: fontSize.sm, color: colors.text.muted, marginTop: spacing.xs },

  // Waveform
  waveformContainer: { paddingHorizontal: spacing.lg, marginBottom: spacing['2xl'] },
  waveformPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    gap: 2,
  },
  waveformBar: { width: 3, borderRadius: 2 },
  waveformLabel: {
    fontSize: fontSize.xs,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Schedule
  scheduleContainer: { paddingHorizontal: spacing.lg, marginBottom: spacing['2xl'] },
  scheduleTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text.secondary, marginBottom: spacing.sm },
  scheduleBar: {
    height: 8,
    backgroundColor: theme.backgroundInput,
    borderRadius: 4,
    overflow: 'hidden',
  },
  scheduleProgress: {
    height: '100%',
    backgroundColor: colors.primary[400],
    borderRadius: 4,
  },
  scheduleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  scheduleLabel: { fontSize: fontSize.xs, color: colors.text.muted },

  // Controls
  controlsContainer: { alignItems: 'center', paddingBottom: spacing['2xl'] },
  stopBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.error.default,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopLabel: { fontSize: fontSize.sm, color: colors.text.muted, marginTop: spacing.sm },
});
