/**
 * Uploads recordings the native module downloaded from the Omi's own storage
 * (audio the Omi saved while Bluetooth was down) to Chronicle.
 *
 * The native side already holds the only copy: the Omi frees its storage as the phone
 * receives it. So a file is deleted only after Chronicle accepted it; a failed upload
 * leaves it on the phone for the next try (new download, app foreground, next launch).
 *
 * Used once, by OmiStorageProvider; read the state through useOmiStorage().
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { omiNativeBle, type OmiStorageFile } from '../../modules/omi-native-ble';
import { uploadAudioFile } from '../services/chronicleApi';
import { useAppLifecycle } from './useAppLifecycle';

export type OmiStorageLogFn = (status: 'connected' | 'error', message: string, details?: string) => void;

export interface OmiStorageUploadState {
  /** Downloaded recordings still on the phone, oldest first. */
  files: OmiStorageFile[];
  /** Set while an upload run is going. */
  progress: { done: number; total: number } | null;
  lastError: string | null;
  lastUploadAtMs: number | null;
}

export function useOmiStorageUpload(logRef: React.MutableRefObject<OmiStorageLogFn | undefined>) {
  const [state, setState] = useState<OmiStorageUploadState>({
    files: [], progress: null, lastError: null, lastUploadAtMs: null,
  });
  const busyRef = useRef(false);
  const againRef = useRef(false);

  const refreshFiles = useCallback(async () => {
    if (!omiNativeBle) return [];
    const files = await omiNativeBle.listStorageFiles();
    setState(s => ({ ...s, files }));
    return files;
  }, []);

  const uploadOne = async (file: OmiStorageFile) => {
    await uploadAudioFile(file.uri, file.name, {
      deviceName: 'omi-storage',
      capturedAt: file.startEpochSec > 0 ? new Date(file.startEpochSec * 1000) : undefined,
    });
    await omiNativeBle!.deleteStorageFile(file.uri);
  };

  const uploadPending = useCallback(async () => {
    if (!omiNativeBle) return;
    if (busyRef.current) {
      againRef.current = true; // files arrived mid-run: go round once more
      return;
    }
    busyRef.current = true;
    try {
      do {
        againRef.current = false;
        const files = await refreshFiles();
        let sent = 0;
        for (const file of files) {
          setState(s => ({ ...s, progress: { done: sent, total: files.length } }));
          try {
            await uploadOne(file);
          } catch (e) {
            const message = (e as Error).message;
            setState(s => ({ ...s, lastError: message }));
            logRef.current?.('error', `Omi storage upload failed; ${files.length - sent} recording(s) kept on the phone`, message);
            return;
          }
          sent += 1;
        }
        if (sent > 0) {
          setState(s => ({ ...s, lastError: null, lastUploadAtMs: Date.now() }));
          logRef.current?.('connected', `Uploaded ${sent} recording(s) from the Omi's storage`);
        }
      } while (againRef.current);
    } finally {
      busyRef.current = false;
      setState(s => ({ ...s, progress: null }));
      void refreshFiles();
    }
  }, [refreshFiles, logRef]);

  useEffect(() => {
    if (!omiNativeBle) return;
    const sub = omiNativeBle.onStorage(() => { void uploadPending(); });
    void uploadPending(); // files left from an earlier run
    return () => sub.remove();
  }, [uploadPending]);

  useAppLifecycle({ onForeground: () => { void uploadPending(); } });

  return { ...state, uploadPending, refreshFiles };
}
