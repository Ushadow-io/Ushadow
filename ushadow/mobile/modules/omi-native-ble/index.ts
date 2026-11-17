/**
 * Native (iOS) Omi BLE link. Returns null where the native module is absent
 * (Android, Expo Go), so callers fall back to the JS friend-lite path.
 */
import { type EventSubscription, type NativeModule, requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export interface OmiAudioEvent {
  opusBase64: string;
  receivedAtMs: number;
}

export interface OmiLinkEvent {
  state: 'connected' | 'disconnected' | 'restored';
  detail?: string | null;
}

export interface OmiStorageEvent {
  /** New downloaded files ready to upload. */
  savedFiles: number;
}

/** What the Omi holds in its own storage, and how a download is going. */
export interface OmiStorageStatus {
  phase: 'idle' | 'checking' | 'downloading';
  /** Records received in the current (or last) download. */
  received: number;
  /** Records in the current (or last) download. */
  total: number;
  /** Records still on the Omi; absent until the Omi was asked. */
  recordsOnOmi?: number;
  /** Estimated audio still on the Omi; absent until one download was measured. */
  secondsOnOmi?: number;
  /** How the last check or download ended, in plain words. */
  lastResult: string;
  /** When the Omi was last asked (epoch ms); 0 when never. */
  checkedAtMs: number;
  /** Live audio is off while a manual download runs. */
  livePaused?: boolean;
  /** Only in getStorageStatus(). */
  connected?: boolean;
}

/** A recording downloaded from the Omi's own storage, waiting for upload. */
export interface OmiStorageFile {
  uri: string;
  name: string;
  /** Wall-clock start (epoch seconds); 0 when the Omi's clock was not set. */
  startEpochSec: number;
  /** 0 when unknown (file recovered after a crash). */
  durationMs: number;
}

export interface OmiNativeBleStats {
  packets: number;
  backgroundPackets: number;
  connects: number;
  disconnects: number;
  restores: number;
  lastPacketAtMs: number;
  inBackground: boolean;
  log: string[];
}

type Events = {
  onOmiAudio: (event: OmiAudioEvent) => void;
  onOmiLink: (event: OmiLinkEvent) => void;
  onOmiStorage: (event: OmiStorageEvent) => void;
  onOmiStorageStatus: (event: OmiStorageStatus) => void;
};

declare class OmiNativeBleModule extends NativeModule<Events> {
  start(deviceId: string): Promise<void>;
  stop(): Promise<void>;
  getStats(): Promise<OmiNativeBleStats>;
  syncStorage(): Promise<void>;
  checkStorage(): Promise<void>;
  getStorageStatus(): Promise<OmiStorageStatus>;
  listStorageFiles(): Promise<OmiStorageFile[]>;
  deleteStorageFile(uri: string): Promise<void>;
}

const native = Platform.OS === 'ios'
  ? requireOptionalNativeModule<OmiNativeBleModule>('OmiNativeBle')
  : null;

export const omiNativeBle = native
  ? {
      start: (deviceId: string) => native.start(deviceId),
      stop: () => native.stop(),
      getStats: () => native.getStats(),
      syncStorage: () => native.syncStorage(),
      checkStorage: () => native.checkStorage(),
      getStorageStatus: () => native.getStorageStatus(),
      onStorageStatus: (listener: Events['onOmiStorageStatus']): EventSubscription =>
        native.addListener('onOmiStorageStatus', listener),
      listStorageFiles: () => native.listStorageFiles(),
      deleteStorageFile: (uri: string) => native.deleteStorageFile(uri),
      onStorage: (listener: Events['onOmiStorage']): EventSubscription =>
        native.addListener('onOmiStorage', listener),
      onAudio: (listener: Events['onOmiAudio']): EventSubscription =>
        native.addListener('onOmiAudio', listener),
      onLink: (listener: Events['onOmiLink']): EventSubscription =>
        native.addListener('onOmiLink', listener),
    }
  : null;
