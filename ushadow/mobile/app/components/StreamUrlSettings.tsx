/**
 * Stream URL Settings Component
 *
 * Collapsible settings for editing the stream URL
 * with selectable protocol and editable path.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parseStreamUrl, buildStreamUrl, StreamUrlConfig } from '../_utils/unodeStorage';
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface StreamUrlSettingsProps {
  streamUrl: string;
  onUrlChange: (url: string) => void;
  isConnected?: boolean;
  testID?: string;
}

const PROTOCOL_OPTIONS: Array<{ value: 'ws' | 'wss'; label: string }> = [
  { value: 'wss', label: 'WSS (Secure)' },
  { value: 'ws', label: 'WS (Insecure)' },
];

const PATH_PRESETS = [
  '/chronicle/ws_pcm',
  '/chronicle/ws',
  '/ws_pcm',
  '/ws',
];

export const StreamUrlSettings: React.FC<StreamUrlSettingsProps> = ({
  streamUrl,
  onUrlChange,
  isConnected = false,
  testID = 'stream-url-settings',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [config, setConfig] = useState<StreamUrlConfig>(() => parseStreamUrl(streamUrl));

  useEffect(() => {
    setConfig(parseStreamUrl(streamUrl));
  }, [streamUrl]);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  const handleConfigChange = (updates: Partial<StreamUrlConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onUrlChange(buildStreamUrl(newConfig));
  };

  const displayUrl = streamUrl.length > 45
    ? `${streamUrl.substring(0, 42)}...`
    : streamUrl;

  return (
    <View style={styles.container} testID={testID}>
      {/* Collapsed View - Just shows current URL */}
      <TouchableOpacity
        style={[
          styles.collapsedView,
          isConnected && styles.collapsedViewConnected,
        ]}
        onPress={handleToggle}
        testID="stream-url-toggle"
      >
        <View style={styles.collapsedContent}>
          <View style={styles.urlPreview}>
            <Ionicons
              name={isConnected ? 'radio-button-on' : 'link-outline'}
              size={16}
              color={isConnected ? colors.success.default : theme.textMuted}
            />
            <Text
              style={[
                styles.urlText,
                isConnected && styles.urlTextConnected,
              ]}
              numberOfLines={1}
            >
              {displayUrl}
            </Text>
          </View>
          <View style={styles.editButton}>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'settings-outline'}
              size={18}
              color={theme.textMuted}
            />
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded View - Full editing */}
      {isExpanded && (
        <View style={styles.expandedView} testID="stream-url-expanded">
          {/* Protocol Selector */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Protocol</Text>
            <View style={styles.protocolButtons}>
              {PROTOCOL_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.protocolButton,
                    config.protocol === option.value && styles.protocolButtonActive,
                  ]}
                  onPress={() => handleConfigChange({ protocol: option.value })}
                  testID={`protocol-${option.value}`}
                >
                  <Text
                    style={[
                      styles.protocolButtonText,
                      config.protocol === option.value && styles.protocolButtonTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Host Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Host</Text>
            <TextInput
              style={styles.textInput}
              value={config.host}
              onChangeText={(text) => handleConfigChange({ host: text })}
              placeholder="your-host.ts.net"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              testID="stream-host-input"
            />
          </View>

          {/* Path Input with Presets */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Path</Text>
            <TextInput
              style={styles.textInput}
              value={config.path}
              onChangeText={(text) => handleConfigChange({ path: text })}
              placeholder="/chronicle/ws_pcm"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              testID="stream-path-input"
            />
            <View style={styles.pathPresets}>
              {PATH_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetChip,
                    config.path === preset && styles.presetChipActive,
                  ]}
                  onPress={() => handleConfigChange({ path: preset })}
                  testID={`path-preset-${preset.replace(/\//g, '-')}`}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      config.path === preset && styles.presetChipTextActive,
                    ]}
                  >
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Full URL Preview */}
          <View style={styles.previewContainer}>
            <Text style={styles.previewLabel}>Full URL</Text>
            <Text style={styles.previewUrl} selectable>
              {buildStreamUrl(config)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  collapsedView: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  collapsedViewConnected: {
    borderColor: colors.success.default,
    backgroundColor: `${colors.success.default}08`,
  },
  collapsedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  urlPreview: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  urlText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    fontFamily: 'monospace',
    flex: 1,
  },
  urlTextConnected: {
    color: colors.success.default,
  },
  editButton: {
    padding: spacing.xs,
  },
  expandedView: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: theme.border,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  protocolButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  protocolButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: theme.backgroundInput,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  protocolButtonActive: {
    backgroundColor: `${colors.primary[400]}15`,
    borderColor: colors.primary[400],
  },
  protocolButtonText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  protocolButtonTextActive: {
    color: colors.primary[400],
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  pathPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  presetChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: theme.backgroundInput,
  },
  presetChipActive: {
    backgroundColor: `${colors.primary[400]}20`,
  },
  presetChipText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontFamily: 'monospace',
  },
  presetChipTextActive: {
    color: colors.primary[400],
  },
  previewContainer: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  previewLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginBottom: spacing.xs,
  },
  previewUrl: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    fontFamily: 'monospace',
  },
});

export default StreamUrlSettings;
