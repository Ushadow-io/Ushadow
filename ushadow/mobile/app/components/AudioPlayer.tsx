/**
 * Audio Player Component - Ushadow Mobile
 *
 * Lazy-loading audio player for Chronicle conversations.
 * Uses expo-av for audio playback on mobile devices.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';

interface AudioPlayerProps {
  conversationId: string;
  cropped?: boolean;
  getAudioUrl: (conversationId: string, cropped: boolean) => Promise<string>;
}

function formatTime(millis: number): string {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function ConversationAudioPlayer({
  conversationId,
  cropped = true,
  getAudioUrl,
}: AudioPlayerProps) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [position, setPosition] = useState<number>(0);

  // Set up audio mode and load URL on mount
  useEffect(() => {
    let mounted = true;

    async function setupAudio() {
      try {
        // Configure audio mode for playback
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        console.log('[AudioPlayer] Audio mode configured');
      } catch (err) {
        console.error('[AudioPlayer] Failed to set audio mode:', err);
      }

      try {
        setIsLoading(true);
        setError(null);
        const url = await getAudioUrl(conversationId, cropped);
        if (mounted) {
          console.log('[AudioPlayer] Loaded URL for', conversationId, ':', url);
          setAudioUrl(url);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[AudioPlayer] Failed to load audio URL:', err);
        if (mounted) {
          setError('Failed to load audio');
          setIsLoading(false);
        }
      }
    }

    setupAudio();
    return () => { mounted = false };
  }, [conversationId, cropped, getAudioUrl]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        console.log('[AudioPlayer] Cleaning up sound');
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);
      setIsPlaying(status.isPlaying);

      // Auto-cleanup when finished
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    }
  };

  const handlePlayPause = async () => {
    if (!audioUrl) {
      console.error('[AudioPlayer] No audio URL available');
      return;
    }

    try {
      if (isPlaying) {
        console.log('[AudioPlayer] Pausing audio');
        await sound?.pauseAsync();
      } else {
        // Load sound if not loaded
        if (!sound) {
          console.log('[AudioPlayer] Loading audio from URL:', audioUrl.substring(0, 100) + '...');
          console.log('[AudioPlayer] Creating sound object...');

          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: audioUrl },
            { shouldPlay: true },
            onPlaybackStatusUpdate
          );

          console.log('[AudioPlayer] Sound created successfully, starting playback');
          setSound(newSound);
        } else {
          console.log('[AudioPlayer] Resuming existing sound');
          await sound.playAsync();
        }
      }
    } catch (error) {
      console.error('[AudioPlayer] Error playing audio:', error);
      console.error('[AudioPlayer] Error details:', JSON.stringify(error, null, 2));
      setError(`Failed to play: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary[400]} />
        <Text style={styles.loadingText}>Loading audio...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={16} color={colors.error.default} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.audioControls}>
        <TouchableOpacity
          onPress={handlePlayPause}
          style={styles.playButton}
          testID={`audio-play-${conversationId}`}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={20}
            color="white"
          />
        </TouchableOpacity>

        <View style={styles.audioInfo}>
          <Text style={styles.audioTime}>
            {duration > 0
              ? `${formatTime(position)} / ${formatTime(duration)}`
              : 'Loading...'}
          </Text>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    color: theme.textMuted,
    fontSize: fontSize.xs,
    marginLeft: spacing.sm,
  },
  errorContainer: {
    backgroundColor: colors.error.bg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error.default,
    fontSize: fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
  audioControls: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  audioTime: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    fontFamily: 'monospace',
  },
  debugText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontFamily: 'monospace',
    marginTop: spacing.xs,
  },
});
