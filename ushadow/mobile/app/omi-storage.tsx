/**
 * Omi Storage Page
 *
 * The Omi saves audio to its own storage while Bluetooth is down. This page shows
 * how much is still on the Omi, the download to the phone, and the upload to
 * Chronicle, and lets the user run each step now.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from './theme';
import { useOmiStorage } from './contexts/OmiStorageContext';
import { downloadPercent, formatDuration, onOmiText } from './_utils/omiStorageFormat';

const ID = 'omi-storage';

function ago(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ActionButton({ label, onPress, disabled, testID }: {
  label: string; onPress: () => void; disabled?: boolean; testID: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function ProgressBar({ percent, testID }: { percent: number; testID: string }) {
  return (
    <View style={styles.progressTrack} testID={testID}>
      <View style={[styles.progressFill, { width: `${percent}%` }]} />
    </View>
  );
}

export default function OmiStoragePage() {
  const router = useRouter();
  const { available, status, files, progress, lastError, lastUploadAtMs, check, download, upload, refresh } =
    useOmiStorage();

  // Fresh numbers each time the page opens.
  useEffect(() => {
    void refresh().then(() => check());
  }, [refresh, check]);

  const busy = status.phase !== 'idle';
  const connected = status.connected !== false;
  const onOmi = onOmiText(status);
  const waitingSeconds = files.reduce((sum, f) => sum + f.durationMs / 1000, 0);

  return (
    <SafeAreaView style={styles.container} testID={`${ID}-page`}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} testID={`${ID}-back`}>
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Omi storage</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!available && <Text style={styles.note}>Omi storage sync needs the iPhone app.</Text>}

        <Text style={styles.label}>On the Omi</Text>
        <View style={styles.card} testID={`${ID}-omi-card`}>
          <Text style={styles.big} testID={`${ID}-on-omi`}>
            {status.phase === 'checking' ? 'Asking the Omi…' : onOmi === null ? 'Not checked yet' : onOmi === 'nothing' ? 'Nothing waiting' : onOmi}
          </Text>
          {status.checkedAtMs > 0 && <Text style={styles.muted}>Checked {ago(status.checkedAtMs)}</Text>}

          {status.phase === 'downloading' && (
            <View style={styles.section}>
              <ProgressBar percent={downloadPercent(status)} testID={`${ID}-download-progress`} />
              <Text style={styles.muted}>
                Downloading: {status.received} of {status.total} records ({downloadPercent(status)}%)
              </Text>
              {status.livePaused && (
                <Text style={styles.warning} testID={`${ID}-sync-mode`}>
                  Sync mode: live audio is off and the screen stays on until the download ends. Speech now is not
                  recorded.
                </Text>
              )}
            </View>
          )}
          {!busy && status.lastResult !== '' && (
            <Text style={styles.result} testID={`${ID}-last-result`}>{status.lastResult}</Text>
          )}
          {!connected && <Text style={styles.warning}>Connect the Omi to check or download.</Text>}

          <View style={styles.buttons}>
            <ActionButton label="Check" onPress={() => void check()} disabled={busy || !connected} testID={`${ID}-check`} />
            <ActionButton label="Download now" onPress={() => void download()} disabled={busy || !connected} testID={`${ID}-download`} />
          </View>
        </View>

        <Text style={styles.label}>On the phone</Text>
        <View style={styles.card} testID={`${ID}-phone-card`}>
          <Text style={styles.big} testID={`${ID}-waiting`}>
            {files.length === 0 ? 'Nothing to upload' : `${files.length} recording(s), ${formatDuration(waitingSeconds)}`}
          </Text>
          {progress && (
            <View style={styles.section}>
              <ProgressBar percent={Math.round((progress.done / progress.total) * 100)} testID={`${ID}-upload-progress`} />
              <Text style={styles.muted}>Uploading to Chronicle: {progress.done} of {progress.total}</Text>
            </View>
          )}
          {!progress && lastError && <Text style={styles.error} testID={`${ID}-upload-error`}>Upload failed: {lastError}</Text>}
          {!progress && !lastError && lastUploadAtMs && <Text style={styles.muted}>Last upload {ago(lastUploadAtMs)}</Text>}

          {files.slice(0, 20).map(f => (
            <View key={f.name} style={styles.fileRow} testID={`${ID}-file-${f.name}`}>
              <Text style={styles.fileTime}>
                {f.startEpochSec > 0 ? new Date(f.startEpochSec * 1000).toLocaleString() : 'Unknown time'}
              </Text>
              <Text style={styles.muted}>{f.durationMs > 0 ? formatDuration(f.durationMs / 1000) : '—'}</Text>
            </View>
          ))}
          {files.length > 20 && <Text style={styles.muted}>…and {files.length - 20} more</Text>}

          <View style={styles.buttons}>
            <ActionButton label="Upload now" onPress={() => void upload()} disabled={!!progress || files.length === 0} testID={`${ID}-upload`} />
          </View>
        </View>

        <Text style={styles.note}>
          The Omi saves audio while Bluetooth is off. On every connect, the phone downloads it, then uploads it to
          Chronicle. The Omi frees its storage as the phone receives the audio. The download goes on while the phone is
          locked. The upload runs when the app is open. "Download now" turns live audio off until it ends, so the
          download is faster.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', padding: spacing.xs },
  backText: { fontSize: fontSize.base, color: theme.textPrimary, marginLeft: spacing.xs },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '600', color: theme.textPrimary },
  headerSpacer: { width: 70 },
  content: { padding: spacing.lg },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  big: { fontSize: fontSize.xl, fontWeight: '600', color: theme.textPrimary },
  muted: { fontSize: fontSize.sm, color: theme.textMuted, marginTop: spacing.xs },
  result: { fontSize: fontSize.sm, color: theme.textSecondary, marginTop: spacing.sm },
  warning: { fontSize: fontSize.sm, color: colors.warning.default, marginTop: spacing.sm },
  error: { fontSize: fontSize.sm, color: colors.error.default, marginTop: spacing.sm },
  section: { marginTop: spacing.md },
  progressTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: theme.backgroundInput,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.primaryButton },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: theme.primaryButton,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: fontSize.sm, fontWeight: '600', color: theme.primaryButtonText },
  fileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  fileTime: { fontSize: fontSize.sm, color: theme.textPrimary },
  note: { fontSize: fontSize.sm, color: theme.textMuted, lineHeight: 20 },
});
