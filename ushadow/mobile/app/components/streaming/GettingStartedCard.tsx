/**
 * GettingStartedCard Component
 *
 * Displays step-by-step setup instructions for first-time users.
 * Shows when no UNodes are configured.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';

interface GettingStartedCardProps {
  onAddUNode: () => void;
  testID?: string;
}

interface Step {
  number: number;
  title: string;
  description: string;
  icon: string;
  completed?: boolean;
}

export const GettingStartedCard: React.FC<GettingStartedCardProps> = ({
  onAddUNode,
  testID = 'getting-started',
}) => {
  const [expanded, setExpanded] = useState(true);

  const steps: Step[] = [
    {
      number: 1,
      title: 'Download Ushadow',
      description: 'Get the Ushadow server software for your computer from ushadow.io',
      icon: 'download-outline',
    },
    {
      number: 2,
      title: 'Start your server',
      description: 'Run the Ushadow backend. A QR code will appear in the terminal for easy connection.',
      icon: 'desktop-outline',
    },
    {
      number: 3,
      title: 'Connect this app',
      description: 'Tap "Add UNode" below and scan the QR code, or enter the server URL manually.',
      icon: 'qr-code-outline',
    },
    {
      number: 4,
      title: 'Start streaming',
      description: 'Choose your audio source (phone mic or OMI device) and press the stream button.',
      icon: 'play-circle-outline',
    },
  ];

  return (
    <View style={styles.container} testID={testID}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        testID={`${testID}-header`}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="rocket" size={20} color={colors.primary[400]} />
          </View>
          <Text style={styles.headerTitle}>Getting Started</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.textMuted}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.content}>
          {/* Steps */}
          {steps.map((step, index) => (
            <View
              key={step.number}
              style={[
                styles.step,
                index === steps.length - 1 && styles.stepLast,
              ]}
            >
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{step.number}</Text>
              </View>
              <View style={styles.stepContent}>
                <View style={styles.stepHeader}>
                  <Ionicons
                    name={step.icon as any}
                    size={16}
                    color={colors.primary[400]}
                  />
                  <Text style={styles.stepTitle}>{step.title}</Text>
                </View>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
            </View>
          ))}

          {/* Action Button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onAddUNode}
            activeOpacity={0.7}
            testID={`${testID}-add-button`}
          >
            <Ionicons name="add-circle" size={20} color={theme.primaryButtonText} />
            <Text style={styles.actionButtonText}>Add UNode</Text>
          </TouchableOpacity>

          {/* Help Links */}
          <View style={styles.helpLinksContainer}>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => Linking.openURL('https://ushadow.io')}
              testID={`${testID}-download-link`}
            >
              <Ionicons name="globe-outline" size={16} color={colors.primary[400]} />
              <Text style={styles.downloadButtonText}>Download Server (ushadow.io)</Text>
            </TouchableOpacity>

            <View style={styles.helpLinks}>
              <Text style={styles.helpText}>Need help?</Text>
              <TouchableOpacity
                onPress={() => Linking.openURL('https://github.com/Ushadow-io/ushadow')}
                testID={`${testID}-docs-link`}
              >
                <Text style={styles.helpLink}>View Documentation</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primary[400] + '30',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.primary[400] + '10',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary[400] + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  content: {
    padding: spacing.md,
    paddingTop: spacing.sm,
  },
  step: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  stepLast: {
    borderBottomWidth: 0,
    marginBottom: spacing.sm,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[400],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    marginTop: 2,
  },
  stepNumberText: {
    color: theme.background,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  stepTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  stepDescription: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    lineHeight: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[400],
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  actionButtonText: {
    color: theme.primaryButtonText,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  helpLinksContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary[400] + '15',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary[400] + '30',
  },
  downloadButtonText: {
    color: colors.primary[400],
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  helpLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  helpText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  helpLink: {
    fontSize: fontSize.xs,
    color: theme.link,
  },
});
