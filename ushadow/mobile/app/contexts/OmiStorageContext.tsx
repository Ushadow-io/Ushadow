/**
 * Omi Storage Context
 *
 * One owner for the Omi's offline storage: what the Omi holds, the download to the
 * phone, and the upload to Chronicle. A single instance keeps two screens from
 * uploading the same file twice.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { omiNativeBle, type OmiStorageStatus } from '../../modules/omi-native-ble';
import { useOmiStorageStatus } from '../hooks/useOmiStorageStatus';
import { useOmiStorageUpload, type OmiStorageLogFn, type OmiStorageUploadState } from '../hooks/useOmiStorageUpload';

interface OmiStorageContextType extends OmiStorageUploadState {
  available: boolean;
  status: OmiStorageStatus;
  /** Ask the Omi how much it holds, without downloading. */
  check: () => Promise<void>;
  /** Download everything the Omi holds now. */
  download: () => Promise<void>;
  /** Upload the downloaded recordings to Chronicle now. */
  upload: () => Promise<void>;
  refresh: () => Promise<void>;
  logRef: React.MutableRefObject<OmiStorageLogFn | undefined>;
}

const KEEP_AWAKE_TAG = 'omi-storage-download';

const OmiStorageContext = createContext<OmiStorageContextType | null>(null);

export const OmiStorageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const logRef = useRef<OmiStorageLogFn | undefined>(undefined);
  const { status, refresh: refreshStatus } = useOmiStorageStatus();
  const uploads = useOmiStorageUpload(logRef);
  const { refreshFiles, uploadPending } = uploads;

  const refresh = useCallback(async () => {
    await Promise.all([refreshStatus(), refreshFiles()]);
  }, [refreshStatus, refreshFiles]);

  // Stable, so screens can call them from effects without re-running.
  const check = useCallback(async () => { await omiNativeBle?.checkStorage(); }, []);
  const download = useCallback(async () => { await omiNativeBle?.syncStorage(); }, []);

  // Sync mode (manual download): keep the screen on, so the app stays in front
  // and iOS does not slow or end the download. Back to normal when it ends.
  const syncMode = status.livePaused === true;
  useEffect(() => {
    if (!syncMode) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => { void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {}); };
  }, [syncMode]);

  const value = useMemo<OmiStorageContextType>(() => ({
    ...uploads,
    available: !!omiNativeBle,
    status,
    check,
    download,
    upload: uploadPending,
    refresh,
    logRef,
  }), [uploads, status, check, download, uploadPending, refresh]);

  return <OmiStorageContext.Provider value={value}>{children}</OmiStorageContext.Provider>;
};

export const useOmiStorage = (): OmiStorageContextType => {
  const ctx = useContext(OmiStorageContext);
  if (!ctx) throw new Error('useOmiStorage must be used inside OmiStorageProvider');
  return ctx;
};

/** Send Omi storage upload results to a screen's log (e.g. the Bluetooth log). */
export const useOmiStorageLog = (onLog?: OmiStorageLogFn) => {
  const { logRef } = useOmiStorage();
  useEffect(() => {
    logRef.current = onLog;
    return () => { if (logRef.current === onLog) logRef.current = undefined; };
  }, [logRef, onLog]);
};
