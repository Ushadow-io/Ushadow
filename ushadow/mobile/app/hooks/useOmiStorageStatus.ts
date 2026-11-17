/**
 * Live status of the Omi's own storage: how much audio it holds and how a
 * download to the phone is going. Used once, by OmiStorageProvider.
 */
import { useCallback, useEffect, useState } from 'react';
import { omiNativeBle, type OmiStorageStatus } from '../../modules/omi-native-ble';
import { useAppLifecycle } from './useAppLifecycle';

const EMPTY: OmiStorageStatus = { phase: 'idle', received: 0, total: 0, lastResult: '', checkedAtMs: 0 };

export function useOmiStorageStatus() {
  const [status, setStatus] = useState<OmiStorageStatus>(EMPTY);

  const refresh = useCallback(async () => {
    if (!omiNativeBle) return;
    setStatus(await omiNativeBle.getStorageStatus());
  }, []);

  useEffect(() => {
    if (!omiNativeBle) return;
    // Events carry no "connected" field; keep the last known one.
    const sub = omiNativeBle.onStorageStatus(next => setStatus(s => ({ ...next, connected: s.connected })));
    void refresh();
    return () => sub.remove();
  }, [refresh]);

  // While the app was in the background, events may have been missed.
  useAppLifecycle({ onForeground: () => { void refresh(); } });

  return { status, refresh };
}
