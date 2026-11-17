/**
 * useOmiNativeAudio - Omi audio through the native iOS BLE link.
 *
 * The JS friend-lite listener stops when iOS pauses the JS thread (locked phone).
 * The native module keeps the BLE link and its audio subscription in CoreBluetooth,
 * which iOS wakes for every packet. `available` is false off iOS; callers then use
 * the JS listener.
 */
import { useCallback, useRef } from 'react';
import type { EventSubscription } from 'expo-modules-core';
// @ts-ignore - no type declarations available
import base64 from 'react-native-base64';

import { omiNativeBle, type OmiNativeBleStats } from '../../modules/omi-native-ble';

function decodeBase64(value: string): Uint8Array {
  const binary = base64.decode(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export interface UseOmiNativeAudio {
  available: boolean;
  start: (deviceId: string, onAudio: (opus: Uint8Array) => void) => Promise<void>;
  stop: () => Promise<void>;
  /** One-line summary plus the native log lines since the last call. */
  readReport: () => Promise<{ summary: string; newLines: string[] } | null>;
}

export function useOmiNativeAudio(): UseOmiNativeAudio {
  const subscriptionRef = useRef<EventSubscription | null>(null);
  const seenLinesRef = useRef(0);
  // Native audio events that reached JS; compare with the native packet count.
  const jsEventsRef = useRef(0);

  const stop = useCallback(async () => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    await omiNativeBle?.stop();
  }, []);

  const start = useCallback(async (deviceId: string, onAudio: (opus: Uint8Array) => void) => {
    if (!omiNativeBle) throw new Error('native Omi BLE is not available on this platform');
    subscriptionRef.current?.remove();
    subscriptionRef.current = omiNativeBle.onAudio(event => {
      jsEventsRef.current += 1;
      onAudio(decodeBase64(event.opusBase64));
    });
    await omiNativeBle.start(deviceId);
  }, []);

  const readReport = useCallback(async () => {
    if (!omiNativeBle) return null;
    const stats: OmiNativeBleStats = await omiNativeBle.getStats();
    // The native log is a rolling window; if it rotated, show what is there.
    const start = seenLinesRef.current <= stats.log.length ? seenLinesRef.current : 0;
    const newLines = stats.log.slice(start);
    seenLinesRef.current = stats.log.length;
    const summary = `native BLE: ${stats.packets} packets (${stats.backgroundPackets} in background), `
      + `${stats.connects} connects, ${stats.disconnects} disconnects, ${stats.restores} restores; `
      + `JS got ${jsEventsRef.current} audio events`;
    return { summary, newLines };
  }, []);

  return { available: !!omiNativeBle, start, stop, readReport };
}
