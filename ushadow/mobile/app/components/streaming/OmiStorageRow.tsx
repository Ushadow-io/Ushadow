/**
 * OmiStorageRow - one-line status of the audio saved on the Omi during Bluetooth
 * gaps. Tap to open the Omi storage screen.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';
import { useOmiStorage } from '../../contexts/OmiStorageContext';
import { storageSummary } from '../../_utils/omiStorageFormat';

interface OmiStorageRowProps {
  testID?: string;
}

export const OmiStorageRow: React.FC<OmiStorageRowProps> = ({ testID = 'omi-storage-row' }) => {
  const router = useRouter();
  const { available, status, files, progress, lastError } = useOmiStorage();
  if (!available) return null;

  const busy = status.phase !== 'idle' || !!progress;
  const failed = !busy && !!lastError;
  const icon = busy ? 'sync' : failed ? 'alert-circle' : 'file-tray-full-outline';
  const iconColor = failed ? colors.error.default : busy ? colors.warning.default : theme.textSecondary;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push('/omi-storage')}
      accessibilityLabel="Open Omi storage"
      testID={testID}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <View style={styles.text}>
        <Text style={styles.title}>Omi storage</Text>
        <Text style={styles.summary} numberOfLines={1} testID={`${testID}-summary`}>
          {failed ? 'Upload failed — tap for details' : storageSummary(status, files.length, progress)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  summary: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    marginTop: 2,
  },
});
