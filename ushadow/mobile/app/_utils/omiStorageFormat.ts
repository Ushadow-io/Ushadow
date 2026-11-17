/**
 * Plain-words text for the Omi's offline storage, shared by the streaming-page row
 * and the Omi storage screen.
 */
import type { OmiStorageStatus } from '../../modules/omi-native-ble';

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

/** Audio still on the Omi, e.g. "12 min" or "340 records"; null when never asked. */
export function onOmiText(status: OmiStorageStatus): string | null {
  if (status.recordsOnOmi === undefined) return null;
  if (status.recordsOnOmi === 0) return 'nothing';
  if (status.secondsOnOmi !== undefined) return `about ${formatDuration(status.secondsOnOmi)}`;
  return `${status.recordsOnOmi} records`;
}

export function downloadPercent(status: OmiStorageStatus): number {
  if (status.total <= 0) return 0;
  return Math.min(100, Math.round((status.received / status.total) * 100));
}

/** One line for the streaming page, e.g. "Downloading 42%" or "About 12 min on the Omi". */
export function storageSummary(
  status: OmiStorageStatus,
  waitingFiles: number,
  progress: { done: number; total: number } | null,
): string {
  if (status.phase === 'downloading') {
    const live = status.livePaused ? ' (live audio off)' : '';
    return `Downloading from the Omi: ${downloadPercent(status)}%${live}`;
  }
  if (status.phase === 'checking') return 'Asking the Omi…';
  if (progress) return `Uploading to Chronicle: ${progress.done} of ${progress.total}`;
  const onOmi = onOmiText(status);
  const parts: string[] = [];
  if (onOmi && onOmi !== 'nothing') parts.push(`${onOmi} on the Omi`);
  if (waitingFiles > 0) parts.push(`${waitingFiles} to upload`);
  if (parts.length > 0) return parts.join(' · ');
  return onOmi === 'nothing' ? 'All synced' : 'Tap to check the Omi';
}
