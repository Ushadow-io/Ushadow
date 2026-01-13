/**
 * Streaming Indicator Component
 *
 * Animated pulsing dots to show that the assistant is typing/streaming.
 * Three dots with staggered fade animation.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors, spacing } from '../../theme';

export const StreamingIndicator: React.FC = () => {
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Create pulsing animation for each dot with staggered timing
    const createPulse = (opacity: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
    };

    // Start all three animations with staggered delays
    const animation1 = createPulse(dot1Opacity, 0);
    const animation2 = createPulse(dot2Opacity, 200);
    const animation3 = createPulse(dot3Opacity, 400);

    animation1.start();
    animation2.start();
    animation3.start();

    return () => {
      animation1.stop();
      animation2.stop();
      animation3.stop();
    };
  }, [dot1Opacity, dot2Opacity, dot3Opacity]);

  return (
    <View style={styles.container} testID="streaming-indicator">
      <Animated.View
        style={[styles.dot, { opacity: dot1Opacity }]}
        testID="streaming-dot-1"
      />
      <Animated.View
        style={[styles.dot, { opacity: dot2Opacity }]}
        testID="streaming-dot-2"
      />
      <Animated.View
        style={[styles.dot, { opacity: dot3Opacity }]}
        testID="streaming-dot-3"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary[400],
  },
});
