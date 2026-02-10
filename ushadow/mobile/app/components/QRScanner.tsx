/**
 * QR Code Scanner Component
 *
 * Uses expo-camera to scan QR codes containing ushadow connection data.
 * Expected QR data format:
 * {
 *   "type": "ushadow-connect",
 *   "v": 1,
 *   "hostname": "my-leader",
 *   "ip": "100.64.1.5",
 *   "port": 8000
 * }
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';

export interface UshadowConnectionData {
  type: 'ushadow-connect';
  v: number;
  hostname: string;  // UNode hostname (e.g., "orange", "public-unode-1")
  ip: string;
  port: number;
  api_url: string;  // Full URL to unode backend (e.g., "http://100.64.1.5:8360")
  auth_token?: string;  // JWT token for authenticating with ushadow and chronicle (v3+)
  envname?: string;  // Environment name (v4+)
}

interface QRScannerProps {
  visible: boolean;
  onClose: () => void;
  onScan: (data: UshadowConnectionData) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  visible,
  onClose,
  onScan,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scanningRef = React.useRef(false); // Ref to prevent multiple scans

  // Reset scanned state when modal opens
  useEffect(() => {
    if (visible) {
      setScanned(false);
      setError(null);
      scanningRef.current = false; // Reset ref
    }
  }, [visible]);

  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    // Check both state and ref to prevent multiple triggers
    if (scanned || scanningRef.current) {
      console.log('[QRScanner] Duplicate scan blocked');
      return;
    }

    // Set both flags IMMEDIATELY
    setScanned(true);
    scanningRef.current = true;

    console.log('[QRScanner] Raw QR data:', result.data);

    try {
      const data = JSON.parse(result.data);
      console.log('[QRScanner] Parsed QR data:', data);

      // Validate it's a ushadow connection QR code
      if (data.type !== 'ushadow-connect') {
        console.log('[QRScanner] Wrong type:', data.type);
        setError('Not a Ushadow QR code. Please scan the code from your Ushadow dashboard.');
        setScanned(false); // Allow retry
        return;
      }

      // Validate required fields
      if (!data.ip || !data.port) {
        console.log('[QRScanner] Missing fields - ip:', data.ip, 'port:', data.port);
        setError('Invalid QR code data. Missing connection details.');
        setScanned(false); // Allow retry
        return;
      }

      console.log('[QRScanner] QR validation successful, calling onScan');
      onScan(data as UshadowConnectionData);
    } catch (err) {
      console.error('[QRScanner] Failed to parse QR code:', err);
      console.error('[QRScanner] Raw data was:', result.data);
      setError(`Could not read QR code: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setScanned(false); // Allow retry on error
    }
  };

  const renderContent = () => {
    if (!permission) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primaryButton} />
          <Text style={styles.loadingText}>Loading camera...</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.centered}>
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan the QR code from your Ushadow dashboard.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
            testID="grant-camera-permission"
          >
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        >
          {/* QR overlay frame */}
          <View style={styles.overlay}>
            <View style={styles.overlayTop} />
            <View style={styles.overlayMiddle}>
              <View style={styles.overlaySide} />
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <View style={styles.overlaySide} />
            </View>
            <View style={styles.overlayBottom}>
              <Text style={styles.instructions}>
                Point your camera at the QR code on your Ushadow dashboard
              </Text>
            </View>
          </View>
        </CameraView>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setError(null);
                setScanned(false);
              }}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      testID="qr-scanner-modal"
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            testID="close-scanner"
          >
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR Code</Text>
          <View style={styles.headerSpacer} />
        </View>

        {renderContent()}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.lg,
    backgroundColor: theme.backgroundCard,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  closeButton: {
    padding: spacing.sm,
  },
  closeButtonText: {
    color: theme.link,
    fontSize: fontSize.base,
  },
  headerSpacer: {
    width: 60,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['3xl'],
  },
  loadingText: {
    color: theme.textSecondary,
    fontSize: fontSize.base,
    marginTop: spacing.lg,
  },
  permissionTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: '600',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  permissionText: {
    color: theme.textSecondary,
    fontSize: fontSize.base,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  permissionButton: {
    backgroundColor: theme.primaryButton,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  permissionButtonText: {
    color: theme.primaryButtonText,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: theme.primaryButton,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: borderRadius.md,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: borderRadius.md,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: borderRadius.md,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: borderRadius.md,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: spacing['2xl'],
  },
  instructions: {
    color: theme.textPrimary,
    fontSize: fontSize.base,
    textAlign: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  errorContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.error.bgSolid,
    padding: spacing.lg,
    alignItems: 'center',
  },
  errorText: {
    color: colors.error.light,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.error.dark,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});

export default QRScanner;
