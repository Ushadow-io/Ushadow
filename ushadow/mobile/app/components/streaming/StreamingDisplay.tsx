/**
 * Streaming Display Component
 *
 * Shows streaming status with waveform visualization,
 * duration timer, and audio level indicator.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';

interface StreamingDisplayProps {
  isStreaming: boolean;
  isConnecting?: boolean;
  audioLevel: number; // 0-100
  startTime?: Date;
  sourceType?: 'microphone' | 'omi'; // Determines waveform type
  testID?: string;
}

const WAVEFORM_BARS = 32;
const WAVEFORM_UPDATE_INTERVAL = 100; // ms
const MONITOR_POINTS = 40;
const MONITOR_UPDATE_INTERVAL = 50; // ms - faster for smooth sweep

export const StreamingDisplay: React.FC<StreamingDisplayProps> = ({
  isStreaming,
  isConnecting = false,
  audioLevel,
  startTime,
  sourceType = 'microphone',
  testID = 'streaming-display',
}) => {
  const [duration, setDuration] = useState<number>(0);
  const [waveformData, setWaveformData] = useState<number[]>(Array(WAVEFORM_BARS).fill(0.1));
  const [blipPosition, setBlipPosition] = useState<number>(0);
  const [trailData, setTrailData] = useState<number[]>(Array(MONITOR_POINTS).fill(0));

  // Animation values for waveform bars
  const barAnimations = useRef<Animated.Value[]>(
    Array(WAVEFORM_BARS).fill(0).map(() => new Animated.Value(0.1))
  ).current;

  // Store audioLevel in ref so waveform animation can read it without re-triggering
  const audioLevelRef = useRef(audioLevel);
  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  // Duration timer
  useEffect(() => {
    if (!isStreaming || !startTime) {
      setDuration(0);
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      setDuration(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [isStreaming, startTime]);

  // Waveform animation for phone mic
  useEffect(() => {
    if (!isStreaming || sourceType !== 'microphone') {
      // Reset waveform when not streaming
      barAnimations.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0.1,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
      return;
    }

    const interval = setInterval(() => {
      // Generate new waveform data based on audio level (read from ref to avoid effect restart)
      const currentLevel = audioLevelRef.current;

      const newData = Array(WAVEFORM_BARS).fill(0).map((_, index) => {
        // Create wave-like pattern centered around the audio level
        const baseLevel = currentLevel / 100;
        const variance = Math.random() * 0.4 - 0.2;
        const centerBias = 1 - Math.abs(index - WAVEFORM_BARS / 2) / (WAVEFORM_BARS / 2) * 0.3;
        return Math.max(0.1, Math.min(1, baseLevel * centerBias + variance));
      });

      setWaveformData(newData);

      // Animate bars
      newData.forEach((value, index) => {
        Animated.timing(barAnimations[index], {
          toValue: value,
          duration: WAVEFORM_UPDATE_INTERVAL - 10,
          useNativeDriver: false,
        }).start();
      });
    }, WAVEFORM_UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [isStreaming, sourceType, barAnimations]);

  // Heartrate monitor animation for OMI - blip sweeps across
  useEffect(() => {
    if (!isStreaming || sourceType !== 'omi') {
      setBlipPosition(0);
      setTrailData(Array(MONITOR_POINTS).fill(0));
      return;
    }

    const interval = setInterval(() => {
      setBlipPosition((prev) => {
        const next = (prev + 1) % MONITOR_POINTS;

        // Update trail data - create a spike at current position
        setTrailData((trail) => {
          const newTrail = [...trail];
          // Create ECG-like spike pattern around blip position
          for (let i = 0; i < MONITOR_POINTS; i++) {
            const distFromBlip = Math.abs(i - next);
            if (distFromBlip === 0) {
              // Main spike
              newTrail[i] = 0.8 + Math.random() * 0.2;
            } else if (distFromBlip === 1) {
              // Shoulder
              newTrail[i] = 0.3 + Math.random() * 0.1;
            } else if (distFromBlip === 2) {
              // Small dip
              newTrail[i] = -0.1;
            } else if (i < next - 3) {
              // Fade trail behind blip
              newTrail[i] = Math.max(0, newTrail[i] * 0.85);
            } else if (i > next + 2) {
              // Clear ahead of blip
              newTrail[i] = 0;
            }
          }
          return newTrail;
        });

        return next;
      });
    }, MONITOR_UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [isStreaming, sourceType]);

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const statusText = useMemo(() => {
    if (isConnecting) return 'Connecting...';
    if (isStreaming) return 'Live';
    return 'Idle';
  }, [isConnecting, isStreaming]);

  const statusColor = useMemo(() => {
    if (isConnecting) return colors.warning.default;
    if (isStreaming) return colors.success.default;
    return theme.textMuted;
  }, [isConnecting, isStreaming]);

  return (
    <View style={styles.container} testID={testID}>
      {/* Status Header - only show when streaming or connecting */}
      {(isStreaming || isConnecting) && (
        <View style={styles.header}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
          <View style={styles.durationContainer}>
            <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
            <Text style={styles.durationText}>{formatDuration(duration)}</Text>
          </View>
        </View>
      )}

      {/* Waveform Visualization - Phone Mic or OMI */}
      {sourceType === 'microphone' ? (
        // Phone Mic: Animated waveform bars
        <View style={styles.waveformContainer} testID="streaming-waveform">
          {barAnimations.map((anim, index) => (
            <Animated.View
              key={index}
              style={[
                styles.waveformBar,
                {
                  height: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['10%', '100%'],
                  }),
                  backgroundColor: isStreaming ? colors.accent[400] : theme.textMuted,
                  opacity: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 1],
                  }),
                },
              ]}
            />
          ))}
        </View>
      ) : (
        // OMI Device: Heartbeat monitor animation
        <View style={styles.monitorContainer} testID="streaming-waveform">
          <View style={styles.monitorLine}>
            {trailData.map((value, index) => (
              <View
                key={index}
                style={[
                  styles.monitorPoint,
                  {
                    height: Math.abs(value) * 50 + 2,
                    marginTop: value < 0 ? 25 : 25 - (value * 50),
                    backgroundColor: isStreaming
                      ? index === blipPosition
                        ? colors.accent[300]
                        : colors.accent[400]
                      : theme.textMuted,
                    opacity: isStreaming
                      ? index === blipPosition
                        ? 1
                        : Math.max(0.2, 1 - Math.abs(index - blipPosition) * 0.08)
                      : 0.3,
                  },
                ]}
              />
            ))}
          </View>
          {/* Baseline */}
          <View style={styles.monitorBaseline} />
        </View>
      )}

      {/* Audio Level Indicator with dB - only show when streaming */}
      {isStreaming && (
        <View style={styles.levelContainer}>
          <Text style={styles.levelLabel}>Level</Text>
          <View style={styles.levelBarBackground}>
            <View
              style={[
                styles.levelBarFill,
                {
                  width: `${audioLevel}%`,
                  backgroundColor:
                    audioLevel > 80
                      ? colors.error.default
                      : audioLevel > 50
                      ? colors.warning.default
                      : colors.success.default,
                },
              ]}
            />
          </View>
          <Text style={styles.levelValue}>
            {Math.round((audioLevel * 0.6) - 60)} dB
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  durationText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.textPrimary,
    fontFamily: 'monospace',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    gap: 2,
    marginBottom: spacing.md,
  },
  waveformBar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 6,
  },
  monitorContainer: {
    height: 60,
    marginBottom: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  monitorLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 50,
    gap: 1,
  },
  monitorPoint: {
    flex: 1,
    borderRadius: 1,
    minHeight: 2,
  },
  monitorBaseline: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: theme.textMuted,
    opacity: 0.2,
  },
  levelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  levelLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    width: 70,
  },
  levelBarBackground: {
    flex: 1,
    height: 6,
    backgroundColor: theme.backgroundInput,
    borderRadius: 3,
    overflow: 'hidden',
  },
  levelBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  levelValue: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    width: 50,
    textAlign: 'right',
    fontFamily: 'monospace',
  },
});

export default StreamingDisplay;
