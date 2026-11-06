/**
 * usePhoneAudioRecorder.ts
 *
 * Phone microphone capture through the native chronicle-duplex-audio module
 * (vendored from Chronicle, see modules/chronicle-duplex-audio).
 *
 * The OS mic driver gives PCM; the module encodes it on-device with the
 * platform Opus encoder (iOS AVAudioConverter, Android MediaCodec) and emits
 * 16 kHz mono 20 ms raw Opus packets. Chronicle audio v2 accepts only Opus.
 *
 * Requires Android 12 (API 31) or newer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
// @ts-ignore - no type declarations available
import base64 from 'react-native-base64';

import {
  addOpusFrameListener,
  startVoiceSession,
  stopVoiceSession,
} from '../../modules/chronicle-duplex-audio';
import type { VoiceCapabilities } from '../protocol/audioCapabilities';
import {
  capturedOpusFrameFromNative,
  type CapturedOpusFrame,
} from '../protocol/capturedOpusFrame';

const FIRST_FRAME_TIMEOUT_MS = 3_000;

export interface PhoneCaptureSession {
  captureEpoch: number;
  capabilities: VoiceCapabilities;
}

export interface UsePhoneAudioRecorder {
  isRecording: boolean;
  isInitializing: boolean;
  error: string | null;
  /** 0-100, smoothed, for the level meter. */
  audioLevel: number;
  startRecording: (onFrame: (frame: CapturedOpusFrame) => void) => Promise<PhoneCaptureSession>;
  stopRecording: () => Promise<void>;
}

function decodeBase64(value: string): Uint8Array {
  const binary = base64.decode(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iOS prompts on first engine start
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
  Alert.alert(
    'Microphone Permission Required',
    'Please enable microphone access in your device settings to use audio streaming.',
    [{ text: 'OK' }],
  );
  return false;
}

export const usePhoneAudioRecorder = (): UsePhoneAudioRecorder => {
  const [isRecording, setIsRecording] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const mountedRef = useRef(true);
  const captureEpochRef = useRef(0);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const firstFrameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCapture = useCallback(() => {
    if (firstFrameTimeoutRef.current) clearTimeout(firstFrameTimeoutRef.current);
    firstFrameTimeoutRef.current = null;
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    if (mountedRef.current) {
      setIsRecording(false);
      setIsInitializing(false);
      setAudioLevel(0);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      await stopVoiceSession();
    } catch (cause) {
      console.warn('[PhoneAudioRecorder] stopVoiceSession failed:', cause);
    } finally {
      clearCapture();
    }
  }, [clearCapture]);

  const startRecording = useCallback(async (
    onFrame: (frame: CapturedOpusFrame) => void,
  ): Promise<PhoneCaptureSession> => {
    if (subscriptionRef.current) await stopRecording();
    if (mountedRef.current) {
      setIsInitializing(true);
      setError(null);
    }
    try {
      if (!(await requestMicPermission())) throw new Error('Microphone permission denied');

      const captureEpoch = captureEpochRef.current + 1;
      captureEpochRef.current = captureEpoch;
      let frameCount = 0;
      subscriptionRef.current = addOpusFrameListener((native) => {
        if (!mountedRef.current || native.captureEpoch !== captureEpochRef.current) return;
        let frame: CapturedOpusFrame;
        try {
          frame = capturedOpusFrameFromNative(native, decodeBase64);
        } catch (cause) {
          console.warn('[PhoneAudioRecorder] Dropped invalid native frame:', cause);
          return;
        }
        frameCount += 1;
        if (frameCount === 1) {
          if (firstFrameTimeoutRef.current) clearTimeout(firstFrameTimeoutRef.current);
          firstFrameTimeoutRef.current = null;
          setError(null);
        }
        const level = Math.min(1, Math.max(0, native.audioLevel || 0)) * 100;
        setAudioLevel(previous => (previous === 0 ? level : previous * 0.65 + level * 0.35));
        onFrame(frame);
      });

      const capabilities = await startVoiceSession({ captureEpoch });
      console.log('[PhoneAudioRecorder] Native Opus capture started:', capabilities.mode, capabilities.input_route);
      firstFrameTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setError('Microphone started, but no audio frames arrived.');
      }, FIRST_FRAME_TIMEOUT_MS);

      if (mountedRef.current) {
        setIsRecording(true);
        setIsInitializing(false);
      }
      return { captureEpoch, capabilities };
    } catch (cause) {
      clearCapture();
      const message = cause instanceof Error ? cause.message : 'Failed to start recording';
      console.error('[PhoneAudioRecorder] Start recording error:', message);
      if (mountedRef.current) setError(message);
      throw cause instanceof Error ? cause : new Error(message);
    }
  }, [clearCapture, stopRecording]);

  useEffect(() => () => {
    mountedRef.current = false;
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    if (firstFrameTimeoutRef.current) clearTimeout(firstFrameTimeoutRef.current);
    stopVoiceSession().catch(() => undefined);
  }, []);

  return { isRecording, isInitializing, error, audioLevel, startRecording, stopRecording };
};
